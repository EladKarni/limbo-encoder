// The encode pipeline as plain async functions, independent of React. Each
// takes a `ctx` of the small surface it needs (file-list access, an updateFile
// setter, the in-flight refs, toast, engine setter) so the hook that wires them
// (src/hooks/useEncoder.js) stays a thin binding and these stay unit-testable.
import { CODECS, MAX_INPUT_BYTES } from './codecs';
import {
  effDur, bitrateKbps, isTargetReachable, plannedOutBytes,
  WASM_MAX_OUTPUT_BYTES, overWasmCeiling,
} from './fit';
import { plannedPath, transcodeMp4 } from './webcodecs';
import { transcodeWasm, recover } from './ffmpegEncoder';
import { oversizedMsg } from './presets';

// Copy for targets the wasm engine cannot deliver (rendered from the constant
// so the number can never drift from the enforced ceiling). The overWasmCeiling
// rule itself lives in fit.js; this supplies the planned path and the copy.
export const overCeilingMsg = `Sizes over ${Math.round(WASM_MAX_OUTPUT_BYTES / 1e6)} MB `
  + 'aren\'t available for this type of video. Please choose a smaller target.';

// The reason a file cannot be encoded right now, as user-facing copy, or null
// when it is ready to go. '' means "not ready" (no message). Same order of
// checks as the encode guard.
export function encodeBlocker(f) {
  if (!f || f.status !== 'ready') return '';
  if (!f.duration) return `Could not read the duration of ${f.name}`;
  if (!(f.targetMB > 0)) return `Set a target size for ${f.name} first`;
  if (!isTargetReachable(f)) return `Target too small for ${f.name} — trim it or pick a larger limit`;
  if (f.size > MAX_INPUT_BYTES) return oversizedMsg(f.name);
  if (overWasmCeiling(f, plannedPath(f))) return `${f.name}: ${overCeilingMsg}`;
  return null;
}

// The transcodeMp4 options derived from a file record's advanced settings.
export function webCodecsOpts(f, onProgress) {
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
export function wasmOpts(f, id, codec, onRetry) {
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
export function donePatch(blob, mime, ext) {
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

const clampPct = (p) => Math.min(100, Math.max(0, p));

// The WebCodecs fast path. Returns true on success, false when it failed AND
// the wasm ceiling forbids a fallback (already surfaced in the error card), or
// null to fall through to the wasm encoder.
export async function webCodecsPass(ctx, f, id) {
  const { updateFile, failEncode, logTailRef } = ctx;
  try {
    const blob = await transcodeMp4(webCodecsOpts(f, (p) => updateFile(id, {
      progress: clampPct(p * 100),
    })));
    updateFile(id, donePatch(blob, 'video/mp4', 'mp4'));
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('WebCodecs path failed:', err);
    logTailRef.current.push(`WebCodecs: ${err && err.message ? err.message : err}`);
    // An output this large is beyond the wasm engine's ceiling, so falling back
    // would only trade this failure for a slower, guaranteed one — fail
    // honestly in the persistent card instead.
    if (plannedOutBytes(f) > WASM_MAX_OUTPUT_BYTES) {
      failEncode(id, f.name, 'This video couldn\'t be converted at this size. Try a smaller target.');
      return false;
    }
    updateFile(id, { progress: 0 });
    return null;
  }
}

// The ffmpeg.wasm path. On failure the aborted core is unusable, so recover()
// (terminate + reload) is the only safe cleanup; on success transcodeWasm
// already cleaned the FS.
export async function wasmPass(ctx, f, id, codec) {
  const { updateFile, failEncode, setEngine } = ctx;
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
}

// Router: validate, mark encoding, try the fast path, then the wasm path.
export async function runEncode(ctx, id) {
  const {
    filesRef, updateFile, setActiveId, showToast, encodingIdRef, encodingDurRef, logTailRef,
  } = ctx;
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
      const fast = await webCodecsPass(ctx, f, id);
      if (fast !== null) return fast; // succeeded, or failed past the ceiling
    }
    return await wasmPass(ctx, f, id, codec);
  } finally {
    encodingIdRef.current = null;
  }
}

// The file ids a Convert click should encode: every ready file in a batch, or
// just the active one when there is a single file / a specific selection.
export function selectEncodeIds(files, active) {
  if (files.length > 1) return files.filter((f) => f.status === 'ready').map((f) => f.id);
  return files
    .filter((f) => active && f.id === active.id && f.status === 'ready')
    .map((f) => f.id);
}

// Encode a list of ids in sequence, returning how many succeeded. Runs one at
// a time — the wasm engine is a shared singleton and can't encode in parallel.
export async function runBatch(ctx, ids) {
  return ids.reduce(async (prev, id) => {
    const count = await prev;
    const ok = await runEncode(ctx, id);
    return count + (ok ? 1 : 0);
  }, Promise.resolve(0));
}
