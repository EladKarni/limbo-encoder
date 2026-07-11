// The size-fitting policy, shared by both encode paths: turn a target size
// into a video bitrate budget and an affordable resolution, then correct a
// measured overshoot. Encoder rate control is treated as a request, never a
// guarantee — see docs/ARCHITECTURE.md § Size-fitting strategy. Codec choice
// is a separate concern — see src/utils/codecs.js.

// --- Correction-loop constants (both retry loops share these) --------------
// Accept an output up to this multiple of the target; encoders routinely
// miss the requested average by a percent or two.
export const TOLERANCE = 1.02;
// When a pass overshoots, scale the bitrate by target/actual and shave this
// much extra headroom so the corrected pass lands under, not exactly on.
export const CORRECTION = 0.95;
// Give up (and fail honestly) after this many passes.
export const ATTEMPTS = 3;
// Below this video bitrate the result is unusable; block or stop instead.
export const MIN_VIDEO_KBPS = 100;

// Output ceiling for the ffmpeg.wasm path. The output file accumulates in
// MEMFS, whose backing array grows 1.125x at a time; once a growth step
// needs a single allocation past Chromium's 2 GiB ArrayBuffer cap, exec
// fails. Measured 2026-07-11 in headless Chromium (@ffmpeg/core-mt 0.12.10):
// a 1.90 GB output completes end-to-end, 1.95 GB fails deterministically
// with "Array buffer allocation failed". Set ~10% under that wall.
export const WASM_MAX_OUTPUT_BYTES = 1.7e9;

// Below this many bits per pixel, encoders hit their quantizer ceiling and
// overshoot the bitrate instead of honoring it (and the picture is mush).
export const MIN_BPP = 0.035;

// Effective (trimmed) duration of a clip, in seconds.
export function effDur(f) {
  const d = (f.trimEnd || f.duration) - (f.trimStart || 0);
  return d > 0 ? d : (f.duration || 0);
}

// The raw target budget in kbps: the video bitrate that fills targetMB over
// durSec once audioKbps of audio is set aside, with a 5% safety margin. Both
// paths compute this identically; they differ only in the audio figure they
// pass — the wasm path assumes the 128 kbps it encodes, the WebCodecs path
// passes the copied track's real audio bitrate.
export function budgetKbps(targetMB, durSec, audioKbps) {
  if (!durSec || !targetMB) return 0;
  return ((8000 * targetMB) / durSec) * 0.95 - audioKbps;
}

// Video bitrate (kbps) for the wasm path: the 128k-audio budget, capped at
// the source's own bitrate so a roomy target can't inflate the file. The cap
// never drops below MIN_VIDEO_KBPS — only an unreachable target can, which is
// what isTargetReachable checks.
export function bitrateKbps(f) {
  const dur = effDur(f);
  if (!dur || !f.targetMB) return 0;
  const target = budgetKbps(f.targetMB, dur, 128);
  const source = f.duration ? ((f.size * 8) / 1000 / f.duration) - 128 : target;
  const br = Math.min(target, Math.max(source, MIN_VIDEO_KBPS));
  return br > 0 ? Math.round(br) : 0;
}

export function isTargetReachable(f) {
  return bitrateKbps(f) >= MIN_VIDEO_KBPS;
}

// The corrected bitrate after a measured overshoot, floored at MIN_VIDEO_KBPS.
// A lower corrected bitrate also re-picks a lower resolution rung via
// chooseHeight, so a single scale-down pulls both levers.
export function correctBitrate(prevKbps, actualBytes, targetBytes) {
  return Math.max(
    MIN_VIDEO_KBPS,
    Math.floor(prevKbps * (targetBytes / actualBytes) * CORRECTION),
  );
}

// Largest output height (capped at maxH) whose pixel rate the bitrate
// budget can actually afford. Falls through to the smallest rung.
export function chooseHeight(kbps, srcW, srcH, fps, maxH) {
  const cap = Math.min(maxH || srcH, srcH);
  const ladder = [cap, 1080, 720, 480, 360]
    .filter((h, i, a) => h <= cap && a.indexOf(h) === i);
  for (let i = 0; i < ladder.length; i += 1) {
    const w = srcW * (ladder[i] / srcH);
    if ((kbps * 1000) / (w * ladder[i] * fps) >= MIN_BPP) return ladder[i];
  }
  return ladder[ladder.length - 1];
}

// Upper bound on the bytes an encode will really produce: the target,
// unless the (trimmed share of the) source is smaller — bitrateKbps caps
// the video budget at the source's own bitrate, so the output can never
// outgrow the source. A big platform preset on a small file is therefore
// harmless; only files that can actually fill their target count.
export function plannedOutBytes(f) {
  const ratio = f.duration ? effDur(f) / f.duration : 1;
  return Math.min((f.targetMB || 0) * 1e6, f.size * ratio);
}

// True when a file is guaranteed to fail: it will run on the wasm engine
// (path === 'wasm') and the bytes it would really produce (target- or
// source-bound) exceed the engine's output ceiling. The caller passes the
// already-computed planned path so this stays engine-agnostic and avoids an
// import cycle with the WebCodecs routing.
export function overWasmCeiling(f, path) {
  return path === 'wasm' && plannedOutBytes(f) > WASM_MAX_OUTPUT_BYTES;
}

// Rough output size estimate, in bytes.
export function estimateOutBytes(f) {
  const origMB = f.size / 1e6;
  const ratio = f.duration ? effDur(f) / f.duration : 1;
  const est = Math.min(f.targetMB || origMB, origMB * ratio);
  return Math.max(est * 1e6 * 0.97, 40000);
}
