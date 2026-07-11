import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import styles from './App.module.scss';

import Header from './Components/Header/Header';
import Stage from './Components/Stage/Stage';
import Sidebar from './Components/Sidebar/Sidebar';
import Toast from './Components/Toast/Toast';
import KofiWidget from './Components/KofiWidget/KofiWidget';
import { ACCEPT_VIDEO } from './Components/MyDropzone/MyDropzone';
import { PLATFORMS } from './Components/Selector/Selector';
import { CODECS, CODEC_OPTIONS, MAX_INPUT_BYTES } from './utils/codecs';
import {
  effDur, bitrateKbps, estimateOutBytes, isTargetReachable,
  WASM_MAX_OUTPUT_BYTES, plannedOutBytes, overWasmCeiling,
} from './utils/fit';
import { plannedPath, transcodeMp4 } from './utils/webcodecs';
import {
  hasFfmpeg, loadEngine, onLog, parseTimeSecs, transcodeWasm, recover,
} from './utils/ffmpegEncoder';

let uid = 0;
function genId() {
  uid += 1;
  return `f${uid}`;
}

function baseName(name) {
  return name.replace(/\.[^.]+$/, '');
}

// Copy for files whose input size is over the app's cap. The cap is 4 GiB
// (binary), but the label is deliberately the round decimal "4 GB": dividing
// by 1e9 and flooring turns 4·1024^3 (≈4.29e9) back into 4 for the user.
const oversizedMsg = (name) => (
  `${name} is over ${Math.floor(MAX_INPUT_BYTES / 1e9)} GB — trim it into parts first`
);

// Copy for targets the wasm engine cannot deliver (rendered from the
// constant so the number can never drift from the enforced ceiling). The
// overWasmCeiling rule itself lives in fit.js; App supplies the planned path
// and this user-facing copy.
const overCeilingMsg = `Sizes over ${Math.round(WASM_MAX_OUTPUT_BYTES / 1e6)} MB `
  + 'aren\'t available for this type of video. Please choose a smaller target.';

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

  // Shared failure surface for both encode paths: the persistent error card
  // carrying the log tail (never toast-only) plus a transient toast.
  const failEncode = useCallback((id, name, lastLine) => {
    updateFile(id, {
      status: 'error',
      progress: 0,
      errorLog: [...logTailRef.current, lastLine].join('\n'),
    });
    showToast(`Encoding ${name} failed`, 'error');
  }, [updateFile, showToast]);

  useEffect(() => {
    if (!hasFfmpeg) {
      setEngine('error');
      return undefined;
    }
    onLog((message) => {
      // eslint-disable-next-line no-console
      console.log(message);
      logTailRef.current.push(message);
      if (logTailRef.current.length > 30) logTailRef.current.shift();
      const id = encodingIdRef.current;
      const dur = encodingDurRef.current;
      if (!id || !dur) return;
      const secs = parseTimeSecs(message);
      if (secs === null) return;
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
  }, [showToast, updateFile]);

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
      showToast(oversizedMsg(oversized.name), 'error');
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
      outBlob: null,
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
      showToast(oversizedMsg(f.name), 'error');
      return false;
    }
    if (overWasmCeiling(f, plannedPath(f))) {
      // Also surfaced as a persistent WarningNote on the file's card; this
      // guard is what keeps batch runs from attempting a doomed encode.
      showToast(`${f.name}: ${overCeilingMsg}`, 'error');
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
    // handles inputs (AV1, HEVC) the wasm core cannot decode. Failures fall
    // through to the wasm encoder below, unless the output is too big for
    // it to ever deliver.
    if (plannedPath(f) === 'webcodecs') {
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
        console.warn('WebCodecs path failed:', err);
        logTailRef.current.push(`WebCodecs: ${err && err.message ? err.message : err}`);
        // An output this large is beyond the wasm engine's ceiling, so
        // falling back would only trade this failure for a slower,
        // guaranteed one — fail honestly in the persistent card instead.
        if (plannedOutBytes(f) > WASM_MAX_OUTPUT_BYTES) {
          failEncode(id, f.name, 'This video couldn\'t be converted at this size. Try a smaller target.');
          encodingIdRef.current = null;
          return false;
        }
        updateFile(id, { progress: 0 });
      }
    }

    const srcH = f.height || 1080;
    let failed = false;
    try {
      const outBlob = await transcodeWasm({
        id,
        file: f.file,
        codec,
        startBitrateKbps: bitrateKbps(f),
        targetMB: f.targetMB,
        targetBytes: f.targetMB * 1e6,
        srcW: f.width || 1920,
        srcH,
        fpsForBudget: f.fps !== 'Original' ? parseInt(f.fps, 10) : 30,
        userMaxH: f.res !== 'Original' ? parseInt(f.res, 10) : srcH,
        durationSec: effDur(f),
        trimStart: f.trimStart,
        trimEnd: f.trimEnd,
        fps: f.fps,
        onRetry: () => updateFile(id, { progress: 0 }),
      });
      updateFile(id, {
        status: 'done',
        progress: 100,
        outUrl: URL.createObjectURL(outBlob),
        outBlob,
        outBytes: outBlob.size,
        outMime: codec.mime,
        outExt: codec.ext,
      });
      return true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      failed = true;
      failEncode(id, f.name, String(err && err.message ? err.message : err));
      return false;
    } finally {
      if (failed) {
        // A failed exec can leave the wasm core aborted; recover() terminates
        // and reloads a fresh worker (the only safe recovery — it also wipes
        // the in-memory FS, so no cleanup needed). On success transcodeWasm
        // already cleaned up.
        setEngine('loading');
        try {
          await recover();
          setEngine('ready');
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(err);
          setEngine('error');
        }
      }
      encodingIdRef.current = null;
    }
  }, [showToast, updateFile, failEncode]);

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
    (f) => f.status === 'ready' && f.duration > 0 && f.targetMB > 0
      && isTargetReachable(f) && !overWasmCeiling(f, plannedPath(f)),
  );
  const canConvert = files.length > 1
    ? encodable.length > 0
    : Boolean(active && encodable.some((f) => f.id === active.id));

  return (
    <div className={styles.app}>
      <div className={styles.glow} />
      <div className={styles.shell}>
        <Header engine={engine} />

        <main className={styles.main}>
          <Stage
            active={active}
            files={files}
            overCeiling={Boolean(active) && overWasmCeiling(active, plannedPath(active))}
            overCeilingMsg={overCeilingMsg}
            onFiles={addFiles}
            onUpdate={updateFile}
            onDownload={download}
            onShare={share}
            onRedo={redo}
            onRetry={(id) => updateFile(id, { status: 'ready', progress: 0, errorLog: null })}
            onSelect={setActiveId}
            onRemove={removeFile}
            onAdd={openPicker}
          />

          {active && (
            <Sidebar
              active={active}
              isEncoding={isEncoding}
              showAdv={showAdv}
              codecOptions={CODEC_OPTIONS}
              codecHint={(CODECS[active.codec] || CODECS['H.264']).hint}
              estBytes={estimateOutBytes(active)}
              bitrateLabel={bitrateLabel}
              convertLabel={convertLabel}
              canConvert={canConvert}
              ready={ready}
              onUpdate={updateFile}
              onToggleAdv={() => setShowAdv((s) => !s)}
              onConvert={convert}
            />
          )}
        </main>

        <footer className={styles.footer}>
          <div className={styles.credits}>
            <span>Special thanks:</span>
            <span>Nakajima Megumi#7432</span>
            <a href="https://blog.otterbro.com/">Flaeri</a>
            <a href="https://www.flaticon.com/authors/freepik" title="Freepik">Icons by Freepik</a>
          </div>
          <KofiWidget />
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
