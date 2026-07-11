import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import styles from './App.module.scss';

import MyDropzone, { ACCEPT_VIDEO } from './Components/MyDropzone/MyDropzone';
import VideoPreview from './Components/VideoPreview/VideoPreview';
import TrimBar from './Components/TrimBar/TrimBar';
import ProgressBar from './Components/ProgressBar/ProgressBar';
import DoneCard from './Components/DoneCard/DoneCard';
import ErrorCard from './Components/ErrorCard/ErrorCard';
import FileChips from './Components/FileChips/FileChips';
import Selector, { PLATFORMS } from './Components/Selector/Selector';
import EstimateCard from './Components/EstimateCard/EstimateCard';
import AdvancedPanel from './Components/AdvancedPanel/AdvancedPanel';
import Button from './Components/Button/Button';
import Toast from './Components/Toast/Toast';
import { ClapperIcon } from './Components/Icons/Icons';
import {
  CODECS, CODEC_OPTIONS, effDur, bitrateKbps, estimateOutBytes, isTargetReachable,
  MAX_INPUT_BYTES, chooseHeight,
} from './utils/video';
import { webCodecsAvailable, transcodeMp4 } from './utils/webcodecs';

// The ffmpeg.wasm UMD runtime is loaded via a <script> tag in index.html
// (webpack 4 cannot parse the library's dist, and self-hosting keeps it
// same-origin under the COOP/COEP isolation headers).
const { FFmpeg } = window.FFmpegWASM || {};
const ffmpeg = FFmpeg ? new FFmpeg() : null;
const FFMPEG_BASE = `${process.env.PUBLIC_URL || ''}/ffmpeg`;

// Input files are mounted here via WORKERFS: ffmpeg reads straight from the
// File object on demand, so the input never has to fit in wasm memory.
const MOUNT_DIR = '/work';

let uid = 0;
function genId() {
  uid += 1;
  return `f${uid}`;
}

function baseName(name) {
  return name.replace(/\.[^.]+$/, '');
}

async function safeFsOp(op) {
  try {
    await op();
  } catch (err) {
    // Nothing to clean up.
  }
}

function App() {
  const [engine, setEngine] = useState('loading');
  const ready = engine === 'ready';
  const [files, setFiles] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [showAdv, setShowAdv] = useState(false);
  const [toast, setToast] = useState(null);

  const filesRef = useRef(files);
  const encodingIdRef = useRef(null);
  // Output duration of the encode in flight; progress is parsed out of
  // ffmpeg's own "time=" log lines against this (the core's progress events
  // are unreliable — they can report 0 or >1 for real-world files).
  const encodingDurRef = useRef(0);
  // Rolling tail of ffmpeg log lines, kept for the error card.
  const logTailRef = useRef([]);
  const toastTimerRef = useRef(null);
  const pickerRef = useRef(null);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const showToast = useCallback((message, tone = 'ok') => {
    clearTimeout(toastTimerRef.current);
    setToast({ message, tone });
    // Errors carry more text and more consequence — leave them up longer.
    toastTimerRef.current = setTimeout(() => setToast(null), tone === 'error' ? 6000 : 2400);
  }, []);

  const updateFile = useCallback((id, patch) => {
    setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }, []);

  const loadEngine = useCallback(() => ffmpeg.load({
    coreURL: `${FFMPEG_BASE}/ffmpeg-core.js`,
    wasmURL: `${FFMPEG_BASE}/ffmpeg-core.wasm`,
    workerURL: `${FFMPEG_BASE}/ffmpeg-core.worker.js`,
  }), []);

  useEffect(() => {
    if (!ffmpeg) {
      setEngine('error');
      return undefined;
    }
    ffmpeg.on('log', ({ message }) => {
      // eslint-disable-next-line no-console
      console.log(message);
      logTailRef.current.push(message);
      if (logTailRef.current.length > 30) logTailRef.current.shift();
      const id = encodingIdRef.current;
      const dur = encodingDurRef.current;
      if (!id || !dur) return;
      const m = /time=(\d+):(\d+):(\d+\.?\d*)/.exec(message);
      if (!m) return;
      const secs = (parseInt(m[1], 10) * 3600) + (parseInt(m[2], 10) * 60) + parseFloat(m[3]);
      updateFile(id, { progress: Math.min(100, Math.max(0, (secs / dur) * 100)) });
    });
    loadEngine()
      .then(() => setEngine('ready'))
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error(err);
        setEngine('error');
        showToast('Failed to load the encoder engine', 'error');
      });
    return () => clearTimeout(toastTimerRef.current);
  }, [loadEngine, showToast, updateFile]);

  const loadMeta = useCallback((id, url, name) => {
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      const d = Number.isFinite(probe.duration) ? probe.duration : 0;
      updateFile(id, {
        duration: d,
        trimEnd: d,
        width: probe.videoWidth || 0,
        height: probe.videoHeight || 0,
      });
    };
    probe.onerror = () => {
      showToast(`${name} could not be read as a video`, 'error');
    };
    probe.src = url;
  }, [updateFile, showToast]);

  const addFiles = useCallback((list) => {
    const videos = [...list].filter(
      (f) => f.type.startsWith('video') || /\.(mp4|mov|webm|mkv|avi)$/i.test(f.name),
    );
    const oversized = videos.find((f) => f.size > MAX_INPUT_BYTES);
    if (oversized) {
      showToast(
        `${oversized.name} is over 4 GB — browsers cap WebAssembly apps at 4 GB of memory. That's a web-platform limit, not ours.`,
        'error',
      );
    }
    const accepted = videos.filter((f) => f.size <= MAX_INPUT_BYTES);
    if (!accepted.length) return;
    const defaultPlatform = PLATFORMS[0];
    const created = accepted.map((f) => ({
      id: genId(),
      file: f,
      name: f.name,
      size: f.size,
      url: URL.createObjectURL(f),
      duration: 0,
      trimStart: 0,
      trimEnd: 0,
      targetMB: defaultPlatform.mb,
      platform: defaultPlatform.id,
      res: 'Original',
      codec: CODEC_OPTIONS[0],
      fps: 'Original',
      status: 'ready',
      progress: 0,
      outUrl: null,
      outBytes: null,
      outMime: null,
      outExt: null,
    }));
    setFiles((fs) => [...fs, ...created]);
    setActiveId((prev) => prev || created[0].id);
    created.forEach((f) => loadMeta(f.id, f.url, f.name));
  }, [loadMeta, showToast]);

  const removeFile = useCallback((id) => {
    const f = filesRef.current.find((x) => x.id === id);
    if (!f) return;
    if (f.status === 'encoding') {
      showToast('Wait for the current encode to finish');
      return;
    }
    URL.revokeObjectURL(f.url);
    if (f.outUrl) URL.revokeObjectURL(f.outUrl);
    setFiles((fs) => fs.filter((x) => x.id !== id));
    setActiveId((prev) => {
      if (prev !== id) return prev;
      const rest = filesRef.current.filter((x) => x.id !== id);
      return rest[0] ? rest[0].id : null;
    });
  }, [showToast]);

  const active = files.find((f) => f.id === activeId) || files[0] || null;
  const isEncoding = files.some((f) => f.status === 'encoding');
  const readyCount = files.filter((f) => f.status === 'ready').length;

  const encodeOne = useCallback(async (id) => {
    const f = filesRef.current.find((x) => x.id === id);
    if (!f || f.status !== 'ready') return false;
    if (!f.duration) {
      showToast(`Could not read the duration of ${f.name}`, 'error');
      return false;
    }
    if (!(f.targetMB > 0)) {
      showToast(`Set a target size for ${f.name} first`, 'error');
      return false;
    }
    if (!isTargetReachable(f)) {
      showToast(`Target too small for ${f.name} — trim it or pick a larger limit`, 'error');
      return false;
    }
    if (f.size > MAX_INPUT_BYTES) {
      showToast(
        `${f.name} is over 4 GB — browsers cap WebAssembly apps at 4 GB of memory. That's a web-platform limit, not ours.`,
        'error',
      );
      return false;
    }

    encodingIdRef.current = id;
    encodingDurRef.current = effDur(f);
    logTailRef.current = [];
    setActiveId(id);
    updateFile(id, { status: 'encoding', progress: 0 });

    const codec = CODECS[f.codec] || CODECS['H.264'];

    // Fast path: for mp4/mov sources targeting H.264, transcode with the
    // browser's own WebCodecs decoders/encoders — hardware speed, and it
    // handles inputs (AV1, HEVC) the wasm core cannot decode. Any failure
    // falls through to the wasm encoder below.
    if (codec.ext === 'mp4' && /\.(mp4|mov)$/i.test(f.name) && webCodecsAvailable()) {
      try {
        const blob = await transcodeMp4({
          file: f.file,
          targetMB: f.targetMB,
          trimStart: f.trimStart || 0,
          trimEnd: f.trimEnd && f.trimEnd < f.duration - 0.05 ? f.trimEnd : 0,
          resHeight: f.res !== 'Original' ? parseInt(f.res, 10) : 0,
          fpsOut: f.fps !== 'Original' ? parseInt(f.fps, 10) : 0,
          onProgress: (p) => updateFile(id, {
            progress: Math.min(100, Math.max(0, p * 100)),
          }),
        });
        updateFile(id, {
          status: 'done',
          progress: 100,
          outUrl: URL.createObjectURL(blob),
          outBlob: blob,
          outBytes: blob.size,
          outMime: 'video/mp4',
          outExt: 'mp4',
        });
        encodingIdRef.current = null;
        return true;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('WebCodecs path failed, falling back to ffmpeg:', err);
        logTailRef.current.push(`WebCodecs: ${err && err.message ? err.message : err}`);
        updateFile(id, { progress: 0 });
      }
    }

    const outputName = `output-${id}.${codec.ext}`;
    let failed = false;

    try {
      await ffmpeg.createDir(MOUNT_DIR);
      const mounted = await ffmpeg.mount('WORKERFS', { files: [f.file] }, MOUNT_DIR);
      if (!mounted) throw new Error('Could not mount the input file');
      const inputPath = `${MOUNT_DIR}/${f.file.name}`;

      const dur = effDur(f);
      const trimmed = f.trimStart > 0.05 || (f.trimEnd > 0 && f.trimEnd < f.duration - 0.05);

      // The wasm core pre-spawns a fixed pool of 32 pthread workers, and no
      // more can start while exec blocks its worker. Auto threading (decoder
      // ~cores + x264 ~1.5x cores) overflows the pool on many-core machines
      // and deadlocks, so cap both decode and encode thread counts.
      const threads = `${Math.min(8, Math.max(2, Math.floor((navigator.hardwareConcurrency || 4) / 2)))}`;

      const srcW = f.width || 1920;
      const srcH = f.height || 1080;
      const fpsForBudget = f.fps !== 'Original' ? parseInt(f.fps, 10) : 30;
      const userMaxH = f.res !== 'Original' ? parseInt(f.res, 10) : srcH;
      const targetBytes = f.targetMB * 1e6;

      // Encoders overshoot rather than honor bitrates below their quantizer
      // ceiling, so pick an affordable resolution up front, verify the
      // result size, and retry with a measured correction if it misses.
      let bitrate = bitrateKbps(f);
      let data = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const height = chooseHeight(bitrate, srcW, srcH, fpsForBudget, userMaxH);

        const args = ['-threads', threads];
        if (trimmed && f.trimStart > 0) args.push('-ss', `${f.trimStart}`);
        args.push('-i', inputPath);
        if (trimmed) args.push('-t', `${dur}`);
        // Always scale to even dimensions — yuv420p encoders reject odd sizes.
        args.push('-vf', `scale=-2:min(${height}\\,trunc(ih/2)*2)`);
        if (f.fps !== 'Original') args.push('-r', f.fps.replace(' fps', ''));
        // Generic encoder thread cap first, so a codec's own -threads wins.
        args.push('-threads', threads);
        args.push(...codec.videoArgs);
        args.push(
          '-b:v', `${bitrate}k`,
          '-minrate', `${bitrate}k`,
          '-maxrate', `${bitrate}k`,
          '-bufsize', `${bitrate * 2}k`,
        );
        args.push('-ac', '2', ...codec.audioArgs);
        args.push(outputName);

        // eslint-disable-next-line no-await-in-loop
        const exitCode = await ffmpeg.exec(args);
        if (exitCode !== 0) throw new Error(`ffmpeg exited with code ${exitCode}`);

        // eslint-disable-next-line no-await-in-loop
        data = await ffmpeg.readFile(outputName);
        if (!data || data.length < 1024) throw new Error('Encoder produced no output');
        if (data.length <= targetBytes * 1.02) break;

        if (attempt === 2) {
          throw new Error(
            `Could not fit under ${f.targetMB} MB (got ${(data.length / 1e6).toFixed(1)} MB) `
            + '— try a larger target, a shorter trim, or a lower frame rate',
          );
        }
        bitrate = Math.max(100, Math.floor(bitrate * (targetBytes / data.length) * 0.95));
        // eslint-disable-next-line no-await-in-loop
        await safeFsOp(() => ffmpeg.deleteFile(outputName));
        updateFile(id, { progress: 0 });
      }

      const outBlob = new Blob([data.buffer], { type: codec.mime });
      const outUrl = URL.createObjectURL(outBlob);
      updateFile(id, {
        status: 'done',
        progress: 100,
        outUrl,
        outBlob,
        outBytes: data.length,
        outMime: codec.mime,
        outExt: codec.ext,
      });
      return true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      failed = true;
      updateFile(id, {
        status: 'error',
        progress: 0,
        errorLog: [...logTailRef.current, String(err && err.message ? err.message : err)].join('\n'),
      });
      showToast(`Encoding ${f.name} failed`, 'error');
      return false;
    } finally {
      if (failed) {
        // A failed exec can leave the wasm core aborted, and any further FS
        // call on it can crash the tab — a fresh worker is the only safe
        // recovery (it also wipes the in-memory FS, so no cleanup needed).
        setEngine('loading');
        try {
          ffmpeg.terminate();
          await loadEngine();
          setEngine('ready');
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(err);
          setEngine('error');
        }
      } else {
        await safeFsOp(() => ffmpeg.deleteFile(outputName));
        await safeFsOp(() => ffmpeg.unmount(MOUNT_DIR));
        await safeFsOp(() => ffmpeg.deleteDir(MOUNT_DIR));
      }
      encodingIdRef.current = null;
    }
  }, [loadEngine, showToast, updateFile]);

  const convert = async () => {
    if (!ready || isEncoding) return;
    const batch = files.length > 1;
    const ids = batch
      ? files.filter((f) => f.status === 'ready').map((f) => f.id)
      : files.filter((f) => active && f.id === active.id && f.status === 'ready').map((f) => f.id);
    if (!ids.length) return;
    const succeeded = await ids.reduce(async (prev, id) => {
      const count = await prev;
      const ok = await encodeOne(id);
      return count + (ok ? 1 : 0);
    }, Promise.resolve(0));
    if (ids.length > 1) {
      if (succeeded === ids.length) showToast(`Encoded ${succeeded} videos`);
      else showToast(`Encoded ${succeeded} of ${ids.length} videos — the rest were skipped`, 'error');
    }
  };

  const download = () => {
    if (!active || !active.outUrl) return;
    const link = document.createElement('a');
    link.href = active.outUrl;
    link.download = `${baseName(active.name)}_limbo.${active.outExt || 'mp4'}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast('Download started');
  };

  const share = async () => {
    if (!active || !active.outBlob) return;
    const shareFile = new File(
      [active.outBlob],
      `${baseName(active.name)}_limbo.${active.outExt || 'mp4'}`,
      { type: active.outMime || 'video/mp4' },
    );
    if (!(navigator.canShare && navigator.canShare({ files: [shareFile] }))) {
      showToast('Sharing files is not supported in this browser');
      return;
    }
    try {
      await navigator.share({ files: [shareFile] });
    } catch (err) {
      if (err.name !== 'AbortError') showToast('Sharing failed', 'error');
    }
  };

  const redo = () => {
    if (!active) return;
    if (active.outUrl) URL.revokeObjectURL(active.outUrl);
    updateFile(active.id, {
      status: 'ready',
      progress: 0,
      outUrl: null,
      outBlob: null,
      outBytes: null,
      outMime: null,
      outExt: null,
    });
  };

  const openPicker = () => {
    if (pickerRef.current) pickerRef.current.click();
  };

  const onPick = (e) => {
    const input = e.target;
    addFiles(input.files);
    input.value = '';
  };

  const br = active ? bitrateKbps(active) : 0;
  const bitrateLabel = br > 0 ? `${br.toLocaleString()} kbps` : '—';
  const convertLabel = files.length > 1 ? `Convert all (${readyCount})` : 'Convert';
  const encodable = files.filter(
    (f) => f.status === 'ready' && f.duration > 0 && f.targetMB > 0 && isTargetReachable(f),
  );
  const canConvert = files.length > 1
    ? encodable.length > 0
    : Boolean(active && encodable.some((f) => f.id === active.id));

  return (
    <div className={styles.app}>
      <div className={styles.glow} />
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <div className={styles.logo}>
              <ClapperIcon color="#06120c" />
            </div>
            <div>
              <div className={styles.title}>
                LIMBO
                <span>·</span>
                ENCODER
              </div>
              <div className={styles.tagline}>Shrink any video to fit any upload limit</div>
            </div>
          </div>
          <div
            className={{
              ready: styles.pill,
              loading: styles.pillLoading,
              error: styles.pillError,
            }[engine]}
          >
            <span className={styles.pillDot} />
            <span>
              {{
                ready: '100% local · nothing uploaded',
                loading: 'loading encoder…',
                error: 'encoder failed to load — reload to retry',
              }[engine]}
            </span>
          </div>
        </header>

        <main className={styles.main}>
          <section className={styles.stage}>
            {!active && <MyDropzone onFiles={addFiles} />}

            {active && active.status === 'ready' && (
              <>
                <VideoPreview
                  url={active.url}
                  name={active.name}
                  onDuration={(d) => {
                    if (!Number.isFinite(d)) return;
                    updateFile(active.id, { duration: d, trimEnd: active.trimEnd || d });
                  }}
                />
                <TrimBar
                  duration={active.duration}
                  trimStart={active.trimStart}
                  trimEnd={active.trimEnd}
                  onChange={(patch) => updateFile(active.id, patch)}
                />
              </>
            )}

            {active && active.status === 'encoding' && (
              <ProgressBar perc={active.progress} name={active.name} />
            )}

            {active && active.status === 'done' && (
              <DoneCard
                url={active.outUrl}
                outBytes={active.outBytes || 0}
                onDownload={download}
                onShare={share}
                onRedo={redo}
              />
            )}

            {active && active.status === 'error' && (
              <ErrorCard
                name={active.name}
                log={active.errorLog}
                onRetry={() => updateFile(active.id, { status: 'ready', progress: 0, errorLog: null })}
              />
            )}

            {files.length > 0 && (
              <FileChips
                files={files}
                activeId={active ? active.id : null}
                onSelect={setActiveId}
                onRemove={removeFile}
                onAdd={openPicker}
              />
            )}
          </section>

          {active && (
            <aside
              className={isEncoding ? styles.sidebarDimmed : styles.sidebar}
              {...(isEncoding ? { inert: '' } : {})}
            >
              <Selector
                platform={active.platform}
                targetMB={active.targetMB}
                onSelect={(p) => updateFile(active.id, { targetMB: p.mb, platform: p.id })}
                onCustom={(mb) => updateFile(active.id, {
                  targetMB: Number.isNaN(mb) ? 0 : mb,
                  platform: 'custom',
                })}
              />
              <EstimateCard
                origBytes={active.size}
                estBytes={estimateOutBytes(active)}
              />
              <AdvancedPanel
                open={showAdv}
                onToggle={() => setShowAdv((s) => !s)}
                res={active.res}
                codec={active.codec}
                fps={active.fps}
                codecOptions={CODEC_OPTIONS}
                onChange={(patch) => updateFile(active.id, patch)}
                bitrateLabel={bitrateLabel}
              />
              <Button onClick={convert} disabled={!ready || !canConvert}>
                {convertLabel}
              </Button>
            </aside>
          )}
        </main>

        <footer className={styles.footer}>
          <span>Special thanks:</span>
          <span>Nakajima Megumi#7432</span>
          <a href="https://blog.otterbro.com/">Flaeri</a>
          <a href="https://www.flaticon.com/authors/freepik" title="Freepik">Icons by Freepik</a>
        </footer>
      </div>

      <Toast message={toast && toast.message} tone={toast ? toast.tone : 'ok'} />
      <input
        ref={pickerRef}
        type="file"
        accept={ACCEPT_VIDEO}
        multiple
        className={styles.hiddenInput}
        onChange={onPick}
        aria-label="Add videos"
      />
    </div>
  );
}

export default App;
