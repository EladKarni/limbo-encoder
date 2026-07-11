import { useRef, useEffect, useCallback } from 'react';
import { CODECS, MAX_INPUT_BYTES } from '../utils/codecs';
import {
  effDur, bitrateKbps, isTargetReachable, plannedOutBytes,
  WASM_MAX_OUTPUT_BYTES, overWasmCeiling,
} from '../utils/fit';
import { plannedPath, transcodeMp4 } from '../utils/webcodecs';
import { transcodeWasm, recover, parseTimeSecs } from '../utils/ffmpegEncoder';
import { oversizedMsg } from './useFiles';

// Copy for targets the wasm engine cannot deliver (rendered from the constant
// so the number can never drift from the enforced ceiling). The overWasmCeiling
// rule itself lives in fit.js; this supplies the planned path and the copy.
const overCeilingMsg = `Sizes over ${Math.round(WASM_MAX_OUTPUT_BYTES / 1e6)} MB `
  + 'aren\'t available for this type of video. Please choose a smaller target.';

// The reason a file cannot be encoded right now, as user-facing copy, or null
// when it is ready to go. '' means "not ready" (no message). Same order of
// checks as the encode guard.
function encodeBlocker(f) {
  if (!f || f.status !== 'ready') return '';
  if (!f.duration) return `Could not read the duration of ${f.name}`;
  if (!(f.targetMB > 0)) return `Set a target size for ${f.name} first`;
  if (!isTargetReachable(f)) return `Target too small for ${f.name} — trim it or pick a larger limit`;
  if (f.size > MAX_INPUT_BYTES) return oversizedMsg(f.name);
  if (overWasmCeiling(f, plannedPath(f))) return `${f.name}: ${overCeilingMsg}`;
  return null;
}

// The transcodeMp4 options derived from a file record's advanced settings.
function webCodecsOpts(f, onProgress) {
  return {
    file: f.file,
    targetMB: f.targetMB,
    trimStart: f.trimStart || 0,
    trimEnd: f.trimEnd && f.trimEnd < f.duration - 0.05 ? f.trimEnd : 0,
    resHeight: f.res !== 'Original' ? parseInt(f.res, 10) : 0,
    fpsOut: f.fps !== 'Original' ? parseInt(f.fps, 10) : 0,
    onProgress,
  };
}

// The transcodeWasm options derived from a file record's advanced settings.
function wasmOpts(f, id, codec, onRetry) {
  const srcH = f.height || 1080;
  return {
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
    onRetry,
  };
}

// The done-state patch for a finished encode.
function donePatch(blob, mime, ext) {
  return {
    status: 'done',
    progress: 100,
    outUrl: URL.createObjectURL(blob),
    outBlob: blob,
    outBytes: blob.size,
    outMime: mime,
    outExt: ext,
  };
}

// The encode pipeline: the two adapters (WebCodecs fast path, ffmpeg.wasm) and
// the router that validates, marks encoding, and tries them in order. Owns the
// in-flight encode refs and exposes handleLogLine so the engine boot can feed
// ffmpeg log lines here for progress parsing.
export default function useEncoder({
  filesRef, updateFile, setActiveId, showToast, setEngine, setLogHandler,
}) {
  const encodingIdRef = useRef(null);
  // Output duration of the encode in flight; progress is parsed out of
  // ffmpeg's own "time=" log lines against this (the core's progress events
  // are unreliable — they can report 0 or >1 for real-world files).
  const encodingDurRef = useRef(0);
  // Rolling tail of ffmpeg log lines, kept for the error card.
  const logTailRef = useRef([]);

  // Feed every ffmpeg log line here (wired by the engine boot). Keeps the tail
  // for the error card and parses time= into progress for the active encode.
  const handleLogLine = useCallback((message) => {
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
  }, [updateFile]);

  // Wire the log handler into the engine so ffmpeg log lines reach it.
  useEffect(() => {
    setLogHandler(handleLogLine);
  }, [setLogHandler, handleLogLine]);

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

  // The WebCodecs fast path. Returns true on success, false when it failed AND
  // the wasm ceiling forbids a fallback (already surfaced in the error card),
  // or null to fall through to the wasm encoder.
  const runWebCodecs = useCallback(async (f, id) => {
    try {
      const blob = await transcodeMp4(webCodecsOpts(f, (p) => updateFile(id, {
        progress: Math.min(100, Math.max(0, p * 100)),
      })));
      updateFile(id, donePatch(blob, 'video/mp4', 'mp4'));
      return true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('WebCodecs path failed:', err);
      logTailRef.current.push(`WebCodecs: ${err && err.message ? err.message : err}`);
      // An output this large is beyond the wasm engine's ceiling, so falling
      // back would only trade this failure for a slower, guaranteed one —
      // fail honestly in the persistent card instead.
      if (plannedOutBytes(f) > WASM_MAX_OUTPUT_BYTES) {
        failEncode(id, f.name, 'This video couldn\'t be converted at this size. Try a smaller target.');
        return false;
      }
      updateFile(id, { progress: 0 });
      return null;
    }
  }, [updateFile, failEncode]);

  // The ffmpeg.wasm path. On failure the aborted core is unusable, so recover()
  // (terminate + reload) is the only safe cleanup; on success transcodeWasm
  // already cleaned the FS.
  const runWasm = useCallback(async (f, id, codec) => {
    let failed = false;
    try {
      const outBlob = await transcodeWasm(
        wasmOpts(f, id, codec, () => updateFile(id, { progress: 0 })),
      );
      updateFile(id, donePatch(outBlob, codec.mime, codec.ext));
      return true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      failed = true;
      failEncode(id, f.name, String(err && err.message ? err.message : err));
      return false;
    } finally {
      if (failed) {
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
    }
  }, [updateFile, failEncode, setEngine]);

  // Router: validate, mark encoding, try the fast path, then the wasm path.
  const encodeOne = useCallback(async (id) => {
    const f = filesRef.current.find((x) => x.id === id);
    const blocker = encodeBlocker(f);
    if (blocker === '') return false; // not ready; no message
    if (blocker) {
      showToast(blocker, 'error');
      return false;
    }

    encodingIdRef.current = id;
    encodingDurRef.current = effDur(f);
    logTailRef.current = [];
    setActiveId(id);
    updateFile(id, { status: 'encoding', progress: 0 });

    const codec = CODECS[f.codec] || CODECS['H.264'];
    try {
      if (plannedPath(f) === 'webcodecs') {
        const fast = await runWebCodecs(f, id);
        if (fast !== null) return fast; // succeeded, or failed past the ceiling
      }
      return await runWasm(f, id, codec);
    } finally {
      encodingIdRef.current = null;
    }
  }, [filesRef, updateFile, setActiveId, showToast, runWebCodecs, runWasm]);

  return { encodeOne, overCeilingMsg };
}
