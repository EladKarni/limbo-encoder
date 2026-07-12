// The size-fitting policy, shared by both encode paths: turn a target size
// into a video bitrate budget and an affordable resolution, then correct a
// measured overshoot. Encoder rate control is treated as a request, never a
// guarantee — see docs/ARCHITECTURE.md § Size-fitting strategy. Codec choice
// is a separate concern — see src/utils/codecs.js.
import { WASM_MAX_INPUT_BYTES, FAST_MAX_INPUT_BYTES } from './codecs';

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

// Perceptual-quality bands for the advanced panel, keyed off bits-per-pixel-
// per-frame (BPP = bitrate / (w × h × fps)) normalized to an H.264 baseline.
// BPP is the standard rough proxy for "how comfortably the bit budget covers
// this picture": the SAME budget spread over fewer pixels (lower resolution)
// or fewer frames (lower fps) buys a higher BPP and a sharper result — which
// is exactly the tradeoff we want the user to see. Cut points are H.264-
// referenced; other codecs are converted via CODEC_BPP_FACTOR before banding.
//
// Cut points triangulated from streaming-quality references: below ~0.1 BPP
// H.264 shows blocking/artifacts, 0.1–0.15 is the standard "good" range, and
// above ~0.2 is wasteful (visually identical at lower rates). ESPN ships 0.10
// BPP at 720p and 0.20 for hard high-motion 360p. BPP already folds in
// resolution and fps but stays content-dependent — high-motion footage needs
// ~1.5–2× the BPP of a talking head for the same look — so treat these as a
// rough perceptual read, not a promise.
export const BPP_BANDS = [
  { max: 0.04, label: 'Poor', hint: 'Blocky — drop resolution or fps, or raise the target.' },
  { max: 0.08, label: 'Fair', hint: 'Watchable, some softness. Lower resolution/fps to sharpen it.' },
  { max: 0.15, label: 'Good', hint: 'Looks fine for most content at this size.' },
  { max: Infinity, label: 'Excellent', hint: 'Near-transparent — you could raise resolution/fps.' },
];

// How many times more bits a codec needs vs H.264 for the same quality, so a
// VP8 stream is judged on the same scale (its BPP is divided by this before
// banding). H.264 is the 1.0 baseline; VP8 needs ~1.25× the bits — it is only
// modestly behind x264, but its weakness concentrates at the low bitrates a
// fit-to-limit compressor operates in, so this is slightly conservative.
export const CODEC_BPP_FACTOR = { 'H.264': 1, 'VP8 (WebM)': 1.25 };

// --- Simple-mode presets ---------------------------------------------------
// The friendly layer over the res/codec/fps dropdowns: a priority (what to keep
// high when the fixed budget forces a tradeoff) and a quality target (how many
// bits-per-pixel to aim for). derivePreset() solves these into the res/fps the
// dropdowns already understand. See docs/ARCHITECTURE.md § Size-fitting.

// The bits-per-pixel-per-frame each quality preset aims for, H.264-referenced
// (VP8 is solved a touch more conservatively via CODEC_BPP_FACTOR). Anchored to
// BPP_BANDS: Low sits in Fair, Medium at the Good floor, High mid-Good — so the
// preset name and the live quality readout stay consistent.
export const TARGET_BPP = { low: 0.05, medium: 0.10, high: 0.16 };

// The standard fps rungs a preset may pick, high → low. 'Original' means "the
// source fps" (capped at 60 for the budget, matching outputGeometry's default).
export const FPS_RUNGS = [60, 30, 24];
// The resolution ladder a preset may pick, tall → short (mirrors chooseHeight).
export const RES_RUNGS = [1080, 720, 480, 360];

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

// The input-size cap (bytes) that applies to a file, given its planned path.
// The WebCodecs fast path streams the source in 16 MB slices and is not
// MEMFS-bound (WORKERFS has handled 13+ GB inputs), so it earns the higher
// ceiling; wasm-bound files keep the conservative guardrail. Path is passed
// in — same reason as overWasmCeiling: no import cycle with the routing.
export function inputCapBytes(path) {
  return path === 'webcodecs' ? FAST_MAX_INPUT_BYTES : WASM_MAX_INPUT_BYTES;
}

// Effective output geometry the estimate should be judged on: the resolution
// the user capped to (or the source), width scaled to preserve aspect, and the
// output fps (defaulting to 30 for 'Original' — the same figure the wasm
// budget assumes). Used by videoQuality; kept pure and source-driven.
export function outputGeometry(f) {
  const srcH = f.height || 1080;
  const srcW = f.width || 1920;
  const h = f.res && f.res !== 'Original' ? Math.min(parseInt(f.res, 10), srcH) : srcH;
  const w = Math.round(srcW * (h / srcH));
  const fps = f.fps && f.fps !== 'Original' ? parseInt(f.fps, 10) : 30;
  return { w, h, fps };
}

// The perceptual quality of the planned encode as a { bpp, label, hint } band —
// the read the advanced panel surfaces so resolution/codec/fps changes show
// their quality tradeoff instead of a fixed budget number. bpp is the H.264-
// normalized bits-per-pixel-per-frame; null when we can't compute it yet
// (no bitrate/duration/geometry). Same budget, different spread: this is the
// only place the res/codec/fps choices visibly move a number.
export function videoQuality(f) {
  // Without probed source geometry we would be judging outputGeometry's
  // 1080p encoder-fallback, not the real picture — so report nothing yet.
  if (!f || !f.width || !f.height) return null;
  const kbps = bitrateKbps(f);
  const { w, h, fps } = outputGeometry(f);
  if (!kbps || !w || !h || !fps) return null;
  const factor = CODEC_BPP_FACTOR[f.codec] || 1;
  const bpp = (kbps * 1000) / (w * h * fps) / factor;
  const band = BPP_BANDS.find((b) => bpp < b.max) || BPP_BANDS[BPP_BANDS.length - 1];
  return { bpp, label: band.label, hint: band.hint };
}

// Solve a simple-mode preset into the { res, fps } strings the advanced
// dropdowns use, given the file's fixed bit budget and source geometry. The
// budget is fixed by the target size, so on a tight budget sharpness and
// smoothness trade off; the priority says which one to keep maxed and let the
// other flex to hit the quality preset's target bits-per-pixel.
//
//   'balance'    → today's automatic behavior: leave both at 'Original' and let
//                  the engine's chooseHeight ladder decide.
//   'quality'    → pin resolution to source; pick the HIGHEST fps rung that
//                  still meets the target BPP (low quality keeps fps high; high
//                  quality cuts fps to fund the sharper picture).
//   'smoothness' → pin fps to source; pick the HIGHEST resolution rung that
//                  still meets the target BPP.
//
// Returns { res, fps } as the same 'Original' / '720p' / '30 fps' strings the
// dropdowns emit, so the caller just writes them onto the record. Falls back to
// the current settings when the budget/geometry isn't known yet.
export function derivePreset(f, priority, quality) {
  if (priority === 'balance') return { res: 'Original', fps: 'Original' };
  const kbps = bitrateKbps(f);
  if (!kbps || !f.width || !f.height) return { res: f.res, fps: f.fps };

  const srcH = f.height;
  const srcW = f.width;
  const srcFps = Math.min(FPS_RUNGS[0], 60); // source fps unknown → treat as 60 cap
  const factor = CODEC_BPP_FACTOR[f.codec] || 1;
  const targetBpp = (TARGET_BPP[quality] || TARGET_BPP.medium) * factor;
  const bppAt = (w, h, fps) => (kbps * 1000) / (w * h * fps);

  if (priority === 'quality') {
    // Resolution maxed (source); find the highest fps that still hits target.
    const fps = FPS_RUNGS.find((r) => bppAt(srcW, srcH, r) >= targetBpp)
      || FPS_RUNGS[FPS_RUNGS.length - 1];
    return { res: 'Original', fps: `${fps} fps` };
  }

  // priority === 'smoothness': fps maxed (source); find the tallest rung ≤ src
  // whose pixel rate at the source fps still hits the target BPP.
  const rungs = RES_RUNGS.filter((h) => h <= srcH);
  if (!rungs.length) rungs.push(RES_RUNGS[RES_RUNGS.length - 1]);
  const h = rungs.find((rung) => {
    const w = Math.round(srcW * (rung / srcH));
    return bppAt(w, rung, srcFps) >= targetBpp;
  }) || rungs[rungs.length - 1];
  const res = h >= srcH ? 'Original' : `${h}p`;
  return { res, fps: 'Original' };
}

// Which preset (if any) the current res/fps match — so the UI can highlight the
// active priority/quality, or show 'Custom' when the user has hand-edited the
// dropdowns to something no preset would produce. Returns { priority, quality }
// or null. Checks 'balance' first (its Original/Original is also what an
// unsolvable quality/smoothness pick falls back to).
export function matchPreset(f) {
  const PRIORITIES = ['balance', 'quality', 'smoothness'];
  const QUALITIES = ['low', 'medium', 'high'];
  for (let p = 0; p < PRIORITIES.length; p += 1) {
    for (let q = 0; q < QUALITIES.length; q += 1) {
      const d = derivePreset(f, PRIORITIES[p], QUALITIES[q]);
      if (d.res === (f.res || 'Original') && d.fps === (f.fps || 'Original')) {
        return { priority: PRIORITIES[p], quality: QUALITIES[q] };
      }
    }
  }
  return null;
}

// Rough output size estimate, in bytes.
export function estimateOutBytes(f) {
  const origMB = f.size / 1e6;
  const ratio = f.duration ? effDur(f) / f.duration : 1;
  const est = Math.min(f.targetMB || origMB, origMB * ratio);
  return Math.max(est * 1e6 * 0.97, 40000);
}
