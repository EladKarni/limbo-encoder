# Limbo Encoder — agent notes

Browser-only video shrinker (fit-to-upload-limit). React 17 / CRA 4 / SCSS
modules / airbnb ESLint. No backend. **Read `docs/ARCHITECTURE.md` before
touching anything in the encoding paths** — they encode a long list of
platform workarounds that look removable and are not.

## Commands

```sh
yarn start                          # dev server :3000 (COOP/COEP via src/setupProxy.js)
yarn build                          # prod build (prebuild copies wasm assets to public/ffmpeg)
npx eslint src scripts --ext .js    # must be clean (airbnb)
```

Scripts already set `NODE_OPTIONS=--openssl-legacy-provider` (react-scripts 4
on modern Node). `public/ffmpeg/` is generated + git-ignored.

## Layout

- `src/App.js` — all state; `encodeOne()` routes WebCodecs vs ffmpeg.wasm.
- `src/utils/webcodecs.js` — WebCodecs pipeline (mp4box demux → decode →
  encode → mp4-muxer). Handles AV1/HEVC input, prefers GPU.
- `src/utils/video.js` — codec table (+ UI hints), bitrate budget,
  `chooseHeight` bpp ladder, `MAX_INPUT_BYTES` (4 GB), reachability.
- `src/Components/*` — presentational; one folder per component with
  `.module.scss` (tokens in `src/styles/_variables.scss`).
- `scripts/copy-ffmpeg-assets.js` — copies ffmpeg core + mp4box + mp4-muxer
  from node_modules to `public/ffmpeg/`; they load as **script-tag globals**
  (`window.FFmpegWASM`, `window.MP4Box`, `window.Mp4Muxer`) because webpack 4
  cannot parse their dists. Never `import` them.

## Invariants (violate = broken app, often a crashed tab)

- Output must **never exceed** the selected target: keep the
  encode → measure → corrected-retry loop and the bpp resolution ladder on
  BOTH paths. Encoder rate control (wasm or WebCodecs) cannot be trusted.
- wasm path: keep explicit `-threads` caps (pool of 32 pthreads → deadlock);
  VP8 stays single-threaded; no libopus / libvpx-vp9 / libx265 (crash, crash,
  deadlock); terminate+reload the engine after any failed exec.
- WebCodecs: hardware only engages with `prefer-hardware` +
  `latencyMode:'realtime'`; close every VideoFrame; never feed mp4box the same
  bytes twice (duplicate sample delivery).
- COOP/COEP must be served everywhere (netlify.toml, setupProxy.js) and all
  runtime assets stay same-origin — external URLs are blocked under COEP and
  would also break the "100% local" claim.
- Failures surface in the persistent error card with the log tail — never
  toast-only. Progress comes from parsed `time=` log lines / sample counts,
  not the engines' progress events.

## Verifying changes

Build, serve `build/` with COOP/COEP headers (a ready-made server script
pattern lives in git history / ARCHITECTURE.md context), then drive headless
Chromium: upload via the (hidden — unhide first) file inputs, click Convert,
assert the `DONE · <size>` badge, size ≤ target, and no `ENCODING FAILED`
card. Generate fixtures with host ffmpeg (`testsrc2`/noise for hard content,
`libsvtav1` for AV1 inputs). Headless has no GPU: WebCodecs logs
`encode=software` there; that's expected.
