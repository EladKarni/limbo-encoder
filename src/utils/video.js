// Hard input cap. WebAssembly is a 32-bit platform: browsers cap what a wasm
// app can address at 4 GB. Every in-browser encoder shares this restriction.
export const MAX_INPUT_BYTES = 4 * (1024 ** 3);

// Encoders available in the bundled ffmpeg.wasm core.
export const CODECS = {
  'H.264': {
    videoArgs: ['-c:v', 'libx264', '-preset', 'superfast'],
    audioArgs: ['-c:a', 'aac', '-b:a', '128k'],
    ext: 'mp4',
    mime: 'video/mp4',
  },
  // The core also ships libx265 and libvpx-vp9, but neither survives this
  // wasm build: x265 has no SIMD and deadlocks the pthread pool, and vp9
  // aborts on frame-buffer allocation. VP8 is the stable WebM encoder.
  'VP8 (WebM)': {
    // -threads 1 overrides the generic thread cap set before codec args;
    // libvpx multithreading is unstable in the wasm core. Audio is vorbis
    // because this core's libopus encoder crashes the renderer.
    videoArgs: ['-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-threads', '1'],
    audioArgs: ['-c:a', 'libvorbis', '-b:a', '128k'],
    ext: 'webm',
    mime: 'video/webm',
  },
};

export const CODEC_OPTIONS = Object.keys(CODECS);

// Effective (trimmed) duration of a clip, in seconds.
export function effDur(f) {
  const d = (f.trimEnd || f.duration) - (f.trimStart || 0);
  return d > 0 ? d : (f.duration || 0);
}

// Below this video bitrate the result is unusable; block the encode instead.
export const MIN_VIDEO_KBPS = 100;

// Video bitrate (kbps) that fits targetMB once 128k audio is accounted for,
// capped at the source's own bitrate so a roomy target can't inflate the
// file. The cap never drops below MIN_VIDEO_KBPS — only an unreachable
// target can, which is what isTargetReachable checks.
export function bitrateKbps(f) {
  const dur = effDur(f);
  if (!dur || !f.targetMB) return 0;
  const target = ((8000 * f.targetMB) / dur) * 0.95 - 128;
  const source = f.duration ? ((f.size * 8) / 1000 / f.duration) - 128 : target;
  const br = Math.min(target, Math.max(source, MIN_VIDEO_KBPS));
  return br > 0 ? Math.round(br) : 0;
}

export function isTargetReachable(f) {
  return bitrateKbps(f) >= MIN_VIDEO_KBPS;
}

// Below this many bits per pixel, encoders hit their quantizer ceiling and
// overshoot the bitrate instead of honoring it (and the picture is mush).
export const MIN_BPP = 0.035;

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

// Rough output size estimate, in bytes.
export function estimateOutBytes(f) {
  const origMB = f.size / 1e6;
  const ratio = f.duration ? effDur(f) / f.duration : 1;
  const est = Math.min(f.targetMB || origMB, origMB * ratio);
  return Math.max(est * 1e6 * 0.97, 40000);
}
