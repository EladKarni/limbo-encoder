<!-- PROJECT SHIELDS -->
[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![MIT License][license-shield]][license-url]
[![Netlify Status](https://api.netlify.com/api/v1/badges/7181b6ab-977a-44cd-8b59-bfc1c5c6ec2b/deploy-status)](https://app.netlify.com/sites/limbo-encoder/deploys)


<!-- PROJECT LOGO -->
<br />
<p align="center">
  <a href="https://github.com/EladKarni/limbo-encoder">
    <img src="Resources/limboencoder-icon.svg" alt="Logo" width="80" height="80">
  </a>

  <h3 align="center">Limbo Encoder</h3>

  <p align="center">
    Shrink any video to fit any upload limit — entirely in your browser
    <br />
    <br />
    <a href="https://limbo-encoder.netlify.app/">View Demo</a>
    ·
    <a href="https://github.com/EladKarni/limbo-encoder/issues">Report Bug</a>
    ·
    <a href="https://github.com/EladKarni/limbo-encoder/issues">Request Feature</a>
  </p>
</p>


## Table of Contents

* [About the Project](#about-the-project)
  * [Features](#features)
  * [How It Works](#how-it-works)
  * [Limits](#limits)
  * [Built With](#built-with)
* [Getting Started](#getting-started)
* [Deployment](#deployment)
* [Contributing](#contributing)
* [License](#license)


## About The Project

Limbo Encoder shrinks videos to fit platform upload limits (Discord, WhatsApp,
email, and more) without FFmpeg knowledge or external programs. Everything runs
locally in the browser — no upload, no server, no account. If you lose internet
mid-encode, nothing is interrupted.

### Features

- **Platform presets** — Discord Free (10 MB) / Nitro (500 MB), WhatsApp (16 MB),
  Gmail (25 MB), Reddit (1 GB), Slack (1 GB), Telegram (2 GB), or any custom MB
  target.
- **Guaranteed fit** — the output size is verified against the target after every
  encode; if an encoder's rate control misses, the app re-encodes with a measured
  correction. You never get a file over the limit.
- **GPU-accelerated fast path** — mp4/mov sources targeting H.264 are transcoded
  with the browser's own WebCodecs decoders and encoders (hardware NVENC/AMF/
  QuickSync when available). This also decodes **AV1 and HEVC** recordings that
  pure-wasm FFmpeg cannot.
- **Batch encoding** — queue multiple files, each with its own target, trim, and
  settings.
- **Trim** — dual-handle in/out trimming before encoding.
- **Advanced settings** — resolution cap, frame rate, codec (H.264 mp4 or
  VP8 WebM), with the effective video bitrate shown live.
- **Smart quality ladder** — when a target is too small for the source resolution,
  the app automatically steps down (1080p → 720p → 480p → 360p) rather than
  producing an oversized or unwatchably starved encode.
- **Honest failures** — if an encode can't succeed, you get a persistent error
  card containing the actual encoder log and a retry button, not a vanished toast.

### How It Works

Two encoding pipelines, selected automatically per file (see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full details):

1. **WebCodecs fast path** — for `.mp4`/`.mov` inputs producing H.264: demux with
   mp4box.js, decode/encode with the browser's codecs (GPU when available), mux
   with mp4-muxer. AAC audio is copied losslessly. Roughly 10–20× faster than
   wasm and not bound by wasm memory limits.
2. **FFmpeg.wasm fallback** — for WebM output, non-mp4 containers, or browsers
   without WebCodecs: a self-hosted multithreaded `ffmpeg.wasm` core (x264
   8-threaded, VP8 single-threaded). Inputs are mounted via WORKERFS so they are
   read on demand instead of copied into memory.

Both paths share the same size-fitting strategy: compute a video bitrate budget
from the target (accounting for the real audio bitrate), pick the largest
resolution the budget can feed at a sane bits-per-pixel, encode, **measure**, and
retry with a corrected bitrate if the result is over target.

### Limits

- **4 GB per input file.** An app-chosen safety cap (`MAX_INPUT_BYTES`), not a
  platform limit: inputs stream from disk on both pipelines (WORKERFS mount on
  the wasm path, 16 MB slices on the WebCodecs path), so they never have to fit
  in memory.
- **~1.7 GB per output file on the wasm path** (`WASM_MAX_OUTPUT_BYTES`). The
  wasm engine's output accumulates in an in-memory file whose growth eventually
  needs a single allocation past Chromium's 2 GiB ArrayBuffer cap; measured
  wall is ≈1.9 GB. The app blocks targets it can't deliver before encoding
  starts. mp4/mov → H.264 conversions run on WebCodecs instead, whose own
  in-memory muxer tops out around 2 GB — past that the encode fails with an
  honest error card rather than an oversized or corrupt file.
- WebM output uses the wasm VP8 encoder, which is CPU-only and single-threaded
  (the wasm libvpx build is unstable multithreaded) — expect it to be much
  slower than H.264.
- AV1/HEVC *input* requires a WebCodecs-capable browser (Chrome, Edge, recent
  Firefox/Safari); the wasm fallback cannot decode AV1.

### Built With

- [WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) — browser-native (hardware) decode/encode
- [FFmpeg.wasm](https://ffmpegwasm.netlify.app/) 0.12 (`@ffmpeg/core-mt`) — wasm fallback engine
- [mp4box.js](https://github.com/gpac/mp4box.js) — mp4 demuxing for the fast path
- [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) — mp4 muxing for the fast path
- [React](https://reactjs.org/) 17 (Create React App 4) + SCSS modules
- [React-Dropzone](https://github.com/react-dropzone/react-dropzone)


## Getting Started

```sh
git clone https://github.com/EladKarni/limbo-encoder.git
cd limbo-encoder
yarn
yarn start        # dev server at http://localhost:3000
yarn build        # production build in ./build
```

Notes:

- Works on any Node ≥ 14 including current releases — the scripts set
  `NODE_OPTIONS=--openssl-legacy-provider` automatically (react-scripts 4's
  webpack needs it on Node 17+).
- `prestart`/`prebuild` run `scripts/copy-ffmpeg-assets.js`, which copies the
  ffmpeg.wasm runtime, mp4box, and mp4-muxer from `node_modules` into
  `public/ffmpeg/` (git-ignored). These are loaded via `<script>` tags because
  webpack 4 cannot parse their modern syntax — and self-hosting keeps the
  "100% local" promise honest.
- The dev server sends `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`
  headers via `src/setupProxy.js`. Without cross-origin isolation,
  `SharedArrayBuffer` is unavailable and the multithreaded ffmpeg core cannot
  load.


## Deployment

Any static host works if it serves the COOP/COEP headers. For Netlify this repo
ships [`netlify.toml`](netlify.toml):

```toml
[[headers]]
for = "/*"
  [headers.values]
    Cross-Origin-Opener-Policy = "same-origin"
    Cross-Origin-Embedder-Policy = "require-corp"
```

Everything (including the ~32 MB wasm core) is served same-origin; there are no
runtime CDN dependencies.


## Contributing

Contributions are what make the open source community such an amazing place to
learn, inspire, and create. Any contributions you make are **greatly
appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

Before opening a PR: `npx eslint src scripts --ext .js` must pass (airbnb
config), and read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — the encoding
paths are littered with non-obvious platform constraints that look like they
can be "simplified" and cannot.


## License

Distributed under the MIT License. See `LICENSE` for more information.

## Special Thanks

- Nakajima Megumi#7432
- [Flaeri](https://blog.otterbro.com/)
- [Icons by Freepik](https://www.flaticon.com/authors/freepik)

<!-- MARKDOWN LINKS & IMAGES -->
[contributors-shield]: https://img.shields.io/github/contributors/EladKarni/limbo-encoder.svg?style=flat-square
[contributors-url]: https://github.com/EladKarni/limbo-encoder/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/EladKarni/limbo-encoder.svg?style=flat-square
[forks-url]: https://github.com/EladKarni/limbo-encoder/network/members
[stars-shield]: https://img.shields.io/github/stars/EladKarni/limbo-encoder.svg?style=flat-square
[stars-url]: https://github.com/EladKarni/limbo-encoder/stargazers
[issues-shield]: https://img.shields.io/github/issues/EladKarni/limbo-encoder.svg?style=flat-square
[issues-url]: https://github.com/EladKarni/limbo-encoder/issues
[license-shield]: https://img.shields.io/github/license/EladKarni/limbo-encoder.svg?style=flat-square
[license-url]: https://github.com/EladKarni/limbo-encoder/blob/master/LICENSE.txt
