# Limbo Encoder — Architecture

Everything runs client-side. There is no backend: the app is a static React
bundle plus a self-hosted wasm encoder, deployed behind two HTTP headers.

This document covers the UI structure, the two encoding pipelines, the
size-fitting strategy, and — most importantly — a catalog of the non-obvious
platform constraints the implementation works around. Every entry in that
catalog was discovered by an encode failing in a real browser; do not
"simplify" them away without re-verifying.

## UI

Single-page React 17 app (CRA 4, SCSS modules, airbnb ESLint). `src/App.js`
owns all state; components are presentational.

**Per-file state model** — each added file is an object:

```
{ id, file, name, size, url,            // File + object URL for preview
  duration, width, height,              // probed via a hidden <video>
  trimStart, trimEnd,                   // seconds
  targetMB, platform,                   // target size + selected preset chip
  res, codec, fps,                      // advanced settings
  status,                               // 'ready' | 'encoding' | 'done' | 'error'
  progress, outUrl, outBlob, outBytes, outMime, outExt, errorLog }
```

The main panel renders by the **active** file's status: dropzone (no files) →
video preview + trim bar (`ready`) → spinner card (`encoding`) → done card
with Download / Share / Redo (`done`) → red error card with the encoder log
tail and a retry button (`error`). A chips row below tracks every file in the
batch; the sidebar (targets, estimate, advanced settings, convert button)
always reflects the active file.

Design reference: the UI is a faithful implementation of the Claude-Design
mock "Limbo Encoder.dc.html" (dark theme, Space Grotesk + JetBrains Mono,
`#3ddc97` green on `#0a0c10`). Fonts are self-hosted via `@fontsource` because
Google Fonts links are blocked under the COEP header (see below).

**Toasts** are transient (2.4 s, 6 s for errors) and rendered inside a
permanently mounted `role="status"` live region. Anything the user must not
miss goes in the error card, never in a toast.

## The two encoding pipelines

`encodeOne()` in `src/App.js` routes each file:

```
mp4/mov input AND H.264 output AND WebCodecs available?
  ├─ yes → WebCodecs fast path (src/utils/webcodecs.js)
  │        └─ any failure → falls through to ↓
  │          (unless the output would exceed the wasm ceiling —
  │           then it fails honestly in the error card instead)
  └─ no  → ffmpeg.wasm path (inline in encodeOne)
```

The decision itself lives in `plannedPath()` (`src/utils/webcodecs.js`) —
the same function the pre-encode validation uses to predict which engine a
file will hit, so routing and warnings cannot drift apart. Files that are
certain to fail (wasm path + output over the ceiling, see *Input and output
limits*) get a persistent amber `WarningNote` on their card and their
Convert is disabled.

### WebCodecs fast path (`src/utils/webcodecs.js`)

```
File ──slice(16MB)──▶ mp4box.js demux ──EncodedVideoChunk──▶ VideoDecoder
                          │                                      │ (GPU when granted)
                          │ AAC samples                          ▼ VideoFrame
                          │ (copied verbatim,              [trim gate, fps gate,
                          │  no re-encode)                  OffscreenCanvas scale]
                          ▼                                      │
                      mp4-muxer ◀──EncodedVideoChunk── VideoEncoder (GPU when granted)
                          │
                          ▼
                    Blob (mp4, faststart)
```

Key properties:

- **Handles AV1/HEVC input.** The browser's decoders do the work; the wasm
  core cannot decode AV1 at all.
- **Not bound by wasm memory.** The file is read in 16 MB slices; a >4 GB
  input is architecturally fine on this path (the app still enforces the 4 GB
  cap for consistency with the fallback).
- **Hardware selection**: the encoder config tries
  `prefer-hardware + latencyMode:'realtime' + bitrateMode:'constant'` first —
  Chrome only engages NVENC-class encoders in realtime mode — then falls back
  to software (`latencyMode:'quality'`), then to variable bitrate with a 0.88
  haircut. The decoder tries `prefer-hardware` then `no-preference`. Every run
  logs one console line (`Limbo WebCodecs: decode=… encode=…`) so users can
  see which engine they got.
- **Audio is copied**, not re-encoded: raw AAC samples with the
  AudioSpecificConfig extracted from the `esds` box. If the audio track is not
  AAC or the ASC can't be read, the whole path throws and the wasm fallback
  (which re-encodes audio) takes over.
- **Backpressure**: the demux pump awaits whenever
  `decodeQueueSize`/`encodeQueueSize` exceed 60, keeping memory flat on long
  files.

### ffmpeg.wasm fallback (in `encodeOne`)

- `@ffmpeg/ffmpeg` 0.12 + `@ffmpeg/core-mt` (multithreaded), self-hosted in
  `public/ffmpeg/` (copied from node_modules by `scripts/copy-ffmpeg-assets.js`
  on every `prestart`/`prebuild`).
- Inputs are **mounted via WORKERFS** (`ffmpeg.mount('WORKERFS', {files},…)`),
  so ffmpeg reads the File on demand — the input never has to fit in wasm
  memory. The wasm heap itself is fixed at 1 GB (the binary declares
  min = max = 16384 pages; it cannot grow).
- Codecs: H.264 (`libx264 -preset superfast`, 8 threads) and VP8
  (`libvpx -deadline realtime -cpu-used 8`, **single thread** — see pitfalls).
  WebM audio is vorbis (see pitfalls). Every codec entry in
  `src/utils/video.js` carries a UI `hint` explaining its speed/quality
  tradeoff.
- Exit codes from `ffmpeg.exec()` are authoritative; a near-empty output file
  is treated as failure regardless.
- On any failure the engine is **terminated and reloaded** — a failed exec can
  leave the wasm core aborted, and further FS calls on an aborted core can
  crash the tab.

## Size-fitting strategy (shared by both paths)

The app's core promise is *the output fits the limit*. Encoder rate control is
treated as a request, never a guarantee:

1. **Budget**: `videoKbps = (8000 × targetMB / duration) × 0.95 − audioKbps`,
   capped at the source's own bitrate so a roomy target can't inflate the
   file. The WebCodecs path uses the audio track's real bitrate; the wasm path
   assumes the 128 kbps it encodes. Targets whose budget falls below
   100 kbps video are blocked up front (`isTargetReachable`).
2. **Resolution ladder** (`chooseHeight` in `src/utils/video.js`): pick the
   largest height (≤ the user's chosen cap) where the budget yields at least
   **0.035 bits per pixel**. Below that, encoders hit their quantizer ceiling
   and *overshoot the bitrate instead of honoring it* (and the picture is mush
   anyway). Ladder: source/user cap → 1080 → 720 → 480 → 360.
3. **Verify and correct**: after encoding, compare output bytes to the target.
   If over (>2%), re-encode with
   `bitrate × (target/actual) × 0.95` — the lower bitrate also re-picks a
   lower ladder rung — up to 3 attempts. If it still can't fit, the encode
   *fails honestly* (error card) rather than delivering an oversized file.

Progress is parsed from ffmpeg's own `time=` log lines against the effective
(trimmed) duration on the wasm path, and from processed-sample counts on the
WebCodecs path. Neither engine's built-in progress event is trusted (see
pitfalls).

## Platform pitfalls catalog

Everything below was observed, not theorized. Versions: Chrome ~137 headless
and desktop, `@ffmpeg/ffmpeg` 0.12.15, `@ffmpeg/core-mt` 0.12.10,
mp4box 0.5.4, mp4-muxer 5.2.2, CRA 4 / webpack 4.

### ffmpeg.wasm core (`@ffmpeg/core-mt` 0.12)

- **Thread-pool deadlock**: the core pre-spawns exactly 32 pthread workers and
  cannot spawn more while `exec` blocks its worker's event loop. FFmpeg's
  auto-threading (decoder ≈ cores, x264 ≈ 1.5×cores) overflows the pool on
  many-core machines and deadlocks at stream-mapping time. Fix: explicit
  `-threads` caps on both decode and encode
  (`min(8, max(2, hardwareConcurrency/2))`).
- **libx265 is unusable**: built without SIMD (`cpu capabilities: none!`) and
  deadlocks its own internal pool even with `pools=4`. Not offered.
- **libvpx-vp9 aborts**: `Failed to allocate frame buffer` even at 320×240 in
  a fresh 1 GB heap, then `Aborted()`. Not offered; VP8 is the WebM encoder.
- **libvpx (VP8) multithreading crashes the renderer**: `-threads 1` is forced
  in its codec args (which is why WebM is slow).
- **libopus crashes the tab** (renderer process, not a JS error). WebM audio
  uses libvorbis instead.
- **`exec` resolving ≠ success** in 0.9 (`run()` never rejected); in 0.12 the
  exit code is returned and must be checked. A defensive `data.length < 1024`
  check remains.
- **An aborted core poisons the instance**: after a mid-encode abort, further
  FS calls (unmount/delete) can crash the tab. Recovery = `terminate()` + full
  `load()` (fast, since assets are same-origin cached).
- **Progress events are garbage**: 0.9 re-emitted the previous run's ratio on
  `Duration:` lines; 0.12's `progress` values are wrong for real-world files
  (0, or >1). Parse `time=HH:MM:SS` from log lines yourself.
- **Wasm heap is fixed at 1 GB** (binary declares min=max). MEMFS file
  contents live in JS arrays outside the heap, so outputs are not bound by
  the heap — but they *are* bound by Chromium's 2 GiB per-ArrayBuffer cap,
  which MEMFS's 1.125× growth steps hit at ≈1.9 GB of output (measured; see
  *Input and output limits*). Decoder/encoder working memory must fit in the
  heap.

### WebCodecs

- **`latencyMode: 'quality'` ⇒ software encoder in Chrome.** Hardware
  (NVENC etc.) is only granted in `'realtime'` mode. If you want the GPU, ask
  for `prefer-hardware + realtime`.
- **Rate control overshoots**, especially the software fallback: at thin
  bits-per-pixel the quantizer ceiling wins and the requested average is
  exceeded by 3–4×, identically across `constant`/`variable` modes and
  regardless of the number you pass. Only the measure-and-retry loop plus the
  bpp resolution ladder actually guarantee size.
- `VideoEncoder.isConfigSupported` reporting `supported: true` says nothing
  about whether the bitrate will be honored.
- Decoded `VideoFrame`s must be `close()`d promptly on every path (including
  drop/error paths) or the decoder stalls.
- Scaling goes through `OffscreenCanvas.drawImage` + `new VideoFrame(canvas)`
  per frame — GPU-backed in real browsers, slow under SwiftShader in headless.

### mp4box.js (0.5.x)

- **Never append the same byte range twice** — mp4box happily re-parses and
  re-delivers duplicate samples (symptom: mp4-muxer throws "Timestamps must be
  monotonically increasing"). The demux pump tracks the contiguous-from-zero
  high-water mark from the header pass and only feeds unseen bytes;
  already-buffered samples are delivered by `start()` alone.
- `appendBuffer` returns the next offset the parser wants — for moov-at-end
  files (classic OBS remux) it jumps over the mdat so header discovery is
  cheap. Feed chunks with `buf.fileStart` set.
- avcC/hvcC for `VideoDecoder.description`: serialize the box via `DataStream`
  and strip the 8-byte header. AV1 needs no description (codec string only).
  AAC's AudioSpecificConfig hides at `esds.esd` descriptor tag 4 → tag 5.
- Call `releaseUsedSamples` from `onSamples` or memory grows with the file.
- Use mp4box **0.5.x**: the 2.x rewrite ships no browser-global build.

### Toolchain (CRA 4 / webpack 4)

- webpack 4's parser (acorn 6) cannot read private class fields or optional
  chaining. `@ffmpeg/ffmpeg` 0.12, mp4box 2.x, and mp4-muxer dists all use
  them ⇒ they are **loaded as `<script>` globals** (`window.FFmpegWASM`,
  `window.MP4Box`, `window.Mp4Muxer`) from `public/ffmpeg/`, copied out of
  node_modules at build time. Do not `import` them.
- react-scripts 4 needs `NODE_OPTIONS=--openssl-legacy-provider` on Node 17+
  (baked into the package.json scripts).
- The `@ffmpeg/ffmpeg` UMD resolves its worker chunk (`814.ffmpeg.js`)
  relative to its own script URL — serve both files side by side and do not
  pass `classWorkerURL` (the UMD build resolves it against a baked-in
  `file://` path).

### Cross-origin isolation

`SharedArrayBuffer` (required by the multithreaded core) needs COOP/COEP
headers — set in `netlify.toml` for production and `src/setupProxy.js` for
the CRA dev server. Under `Cross-Origin-Embedder-Policy: require-corp`,
third-party resources (Google Fonts, CDN scripts) are blocked, which is why
fonts and all encoder runtimes are self-hosted. Everything being same-origin
is also what makes the "100% local · nothing uploaded" pill true.

### Input and output limits

Input files are capped at **4 GB** (`MAX_INPUT_BYTES`) — an app-chosen safety
cap, enforced at file-add time (immediate toast) and again at encode time.
It is *not* a platform memory limit: inputs never sit in memory whole on
either path (WORKERFS mount on the wasm path, 16 MB slices on the WebCodecs
path — WORKERFS has handled 13+ GB inputs in the wild). The earlier
"browsers cap WebAssembly apps at 4 GB" attribution was wrong twice over:
4 GiB is wasm32's address space, not a browser policy, and Chrome 133 /
Firefox 134 shipped Memory64 in early 2025 so browsers no longer cap wasm at
4 GB at all (Safari still lacks Memory64 as of mid-2026). Neither fact binds
here anyway — the bundled core's heap is fixed at 1 GiB regardless, and
lifting the input cap on the WebCodecs path is possible but deliberately out
of scope. (OBS recordings encoded with NVENC AV1 are handled by the
WebCodecs path; if WebCodecs is unavailable, the wasm path fails with a
decoder error shown in the error card.)

**Output size is the real wasm-path boundary.** The encoder's output
accumulates in MEMFS, whose backing Uint8Array grows in 1.125× steps; once a
step needs a single allocation past Chromium's 2 GiB ArrayBuffer cap, the
allocation throws and `exec` fails (cleanly — the error card shows it, no
tab crash). Measured 2026-07-11 in headless Chromium with
`@ffmpeg/core-mt` 0.12.10: a 1.90 GB output completes the full
exec → readFile → Blob pipeline, 1.95 GB fails deterministically with
"Array buffer allocation failed", and a real x264 encode delivered a
1.52 GB mp4 through the UI. `WASM_MAX_OUTPUT_BYTES` (1.7 GB, ~10% under the
wall) encodes this: files predicted for the wasm path whose *planned output*
(`plannedOutBytes` — the target, or the trimmed source share if smaller)
exceeds it are blocked up front with a persistent `WarningNote`, and
WebCodecs jobs over the ceiling skip the wasm fallback on failure. The
practical consequence: Reddit/Slack (1 GB) presets work on the wasm path;
Telegram-scale (2 GB) outputs currently fail on *both* paths in Chromium —
the WebCodecs path's in-memory mp4 muxer (`ArrayBufferTarget`, fastStart
`in-memory`) hits the same 2 GiB allocation cap while finalizing (measured:
a 1.94 GB WebCodecs encode ran to completion, then threw "Array buffer
allocation failed" in `muxer.finalize`). Such jobs are allowed to try
(deliberate: the ceiling is engine-specific and may change), and fail
honestly in the error card without falling back. Lifting that would need a
chunked muxer target — out of scope.
