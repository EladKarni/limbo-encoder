// Encoders available in the bundled ffmpeg.wasm core.
export const CODECS = {
  'H.264': {
    videoArgs: ['-c:v', 'libx264', '-preset', 'superfast'],
    audioArgs: ['-c:a', 'aac', '-b:a', '128k'],
    ext: 'mp4',
    mime: 'video/mp4',
  },
  'VP9 (WebM)': {
    videoArgs: ['-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8'],
    audioArgs: ['-c:a', 'libopus', '-b:a', '128k'],
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

// Rough output size estimate, in bytes.
export function estimateOutBytes(f) {
  const origMB = f.size / 1e6;
  const ratio = f.duration ? effDur(f) / f.duration : 1;
  const est = Math.min(f.targetMB || origMB, origMB * ratio);
  return Math.max(est * 1e6 * 0.97, 40000);
}
