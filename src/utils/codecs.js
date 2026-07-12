// The encoder catalog for the ffmpeg.wasm path: which codecs the bundled
// core can actually deliver, the exact args each needs, and a UI hint per
// codec. Also the app-chosen input-size cap. Fitting output to a target is a
// separate concern — see src/utils/fit.js.

// Input-size sanity bounds, chosen by this app — not platform memory limits.
// Inputs stream from disk on both paths (WORKERFS mount on the wasm path,
// 16 MB slices on the WebCodecs path), so nothing here is bound by machine
// RAM. The cap is path-dependent: the WebCodecs fast path genuinely isn't
// MEMFS-bound and has swallowed 13+ GB inputs in the wild, so it earns a much
// higher ceiling; the wasm path keeps the conservative 4 GB guardrail. The
// applicable cap for a given file is resolved by inputCapBytes() in fit.js
// (which keys off the planned path). See docs/ARCHITECTURE.md § Input and
// output limits.
export const WASM_MAX_INPUT_BYTES = 4 * (1024 ** 3);
export const FAST_MAX_INPUT_BYTES = 64 * (1024 ** 3);

// Encoders available in the bundled ffmpeg.wasm core.
export const CODECS = {
  'H.264': {
    videoArgs: ['-c:v', 'libx264', '-preset', 'superfast'],
    audioArgs: ['-c:a', 'aac', '-b:a', '128k'],
    ext: 'mp4',
    mime: 'video/mp4',
    hint: 'Fast — uses your GPU when available. Hardware encoding trades a touch of '
      + 'quality per MB for a lot of speed.',
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
    hint: 'Much slower — no GPU, single CPU thread in the browser. Pick it only when '
      + 'you specifically need a .webm file.',
  },
};

export const CODEC_OPTIONS = Object.keys(CODECS);
