import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';
import styles from './App.module.scss';

import MyDropzone, { ACCEPT_VIDEO } from './Components/MyDropzone/MyDropzone';
import VideoPreview from './Components/VideoPreview/VideoPreview';
import TrimBar from './Components/TrimBar/TrimBar';
import ProgressBar from './Components/ProgressBar/ProgressBar';
import DoneCard from './Components/DoneCard/DoneCard';
import FileChips from './Components/FileChips/FileChips';
import Selector, { PLATFORMS } from './Components/Selector/Selector';
import EstimateCard from './Components/EstimateCard/EstimateCard';
import AdvancedPanel from './Components/AdvancedPanel/AdvancedPanel';
import Button from './Components/Button/Button';
import Toast from './Components/Toast/Toast';
import { ClapperIcon } from './Components/Icons/Icons';
import {
  CODECS, CODEC_OPTIONS, effDur, bitrateKbps, estimateOutBytes, isTargetReachable,
} from './utils/video';

const ffmpeg = createFFmpeg({ log: true });

let uid = 0;
function genId() {
  uid += 1;
  return `f${uid}`;
}

function baseName(name) {
  return name.replace(/\.[^.]+$/, '');
}

function safeUnlink(name) {
  try {
    ffmpeg.FS('unlink', name);
  } catch (err) {
    // File may not exist; nothing to clean up.
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
  // ffmpeg.wasm reports progress against the full input duration, so trimmed
  // encodes need their ratio scaled up to still land on 100%.
  const progressScaleRef = useRef(1);
  const toastTimerRef = useRef(null);
  const pickerRef = useRef(null);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const showToast = useCallback((message, tone = 'ok') => {
    clearTimeout(toastTimerRef.current);
    setToast({ message, tone });
    toastTimerRef.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const updateFile = useCallback((id, patch) => {
    setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }, []);

  useEffect(() => {
    ffmpeg.load()
      .then(() => setEngine('ready'))
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error(err);
        setEngine('error');
        showToast('Failed to load the encoder engine');
      });
    ffmpeg.setProgress(({ ratio, duration: infoDuration }) => {
      const id = encodingIdRef.current;
      // "Duration" log lines re-emit the previous run's ratio — skip them.
      if (!id || typeof infoDuration === 'number' || !Number.isFinite(ratio)) return;
      const scaled = ratio * 100 * progressScaleRef.current;
      updateFile(id, { progress: Math.min(100, Math.max(0, scaled)) });
    });
    return () => clearTimeout(toastTimerRef.current);
  }, [showToast, updateFile]);

  const loadMeta = useCallback((id, url, name) => {
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      const d = Number.isFinite(probe.duration) ? probe.duration : 0;
      updateFile(id, { duration: d, trimEnd: d });
    };
    probe.onerror = () => {
      showToast(`${name} could not be read as a video`);
    };
    probe.src = url;
  }, [updateFile, showToast]);

  const addFiles = useCallback((list) => {
    const accepted = [...list].filter(
      (f) => f.type.startsWith('video') || /\.(mp4|mov|webm|mkv|avi)$/i.test(f.name),
    );
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
  }, [loadMeta]);

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
    if (f.size > 1.5e9) {
      showToast(`${f.name} is too large for in-browser encoding (~1.5 GB max)`, 'error');
      return false;
    }

    encodingIdRef.current = id;
    progressScaleRef.current = f.duration / effDur(f);
    setActiveId(id);
    updateFile(id, { status: 'encoding', progress: 0 });

    const codec = CODECS[f.codec] || CODECS['H.264'];
    const inputName = `input-${id}`;
    const outputName = `output-${id}.${codec.ext}`;

    try {
      ffmpeg.FS('writeFile', inputName, await fetchFile(f.file));

      const dur = effDur(f);
      const bitrate = bitrateKbps(f);
      const trimmed = f.trimStart > 0.05 || (f.trimEnd > 0 && f.trimEnd < f.duration - 0.05);

      const args = [];
      if (trimmed && f.trimStart > 0) args.push('-ss', `${f.trimStart}`);
      args.push('-i', inputName);
      if (trimmed) args.push('-t', `${dur}`);
      // Always scale to even dimensions — yuv420p encoders reject odd sizes.
      if (f.res !== 'Original') {
        const h = parseInt(f.res, 10);
        args.push('-vf', `scale=-2:min(${h}\\,trunc(ih/2)*2)`);
      } else {
        args.push('-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2');
      }
      if (f.fps !== 'Original') args.push('-r', f.fps.replace(' fps', ''));
      args.push(...codec.videoArgs);
      args.push(
        '-b:v', `${bitrate}k`,
        '-minrate', `${bitrate}k`,
        '-maxrate', `${bitrate}k`,
        '-bufsize', `${bitrate * 2}k`,
      );
      args.push('-ac', '2', ...codec.audioArgs);
      args.push(outputName);

      await ffmpeg.run(...args);

      // ffmpeg.run resolves even when ffmpeg itself failed — a missing or
      // near-empty output file is the reliable failure signal.
      const data = ffmpeg.FS('readFile', outputName);
      if (!data || data.length < 1024) throw new Error('Encoder produced no output');

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
      updateFile(id, { status: 'ready', progress: 0 });
      showToast(`Encoding ${f.name} failed — see the console for details`, 'error');
      return false;
    } finally {
      safeUnlink(inputName);
      safeUnlink(outputName);
      encodingIdRef.current = null;
    }
  }, [showToast, updateFile]);

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
