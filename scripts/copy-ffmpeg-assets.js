// Copies the self-hosted runtime out of node_modules into versioned
// directories under public/ffmpeg so the app serves it same-origin. That keeps
// the "100% local" promise, avoids CDN fetches being blocked by the COOP/COEP
// isolation headers, and lets the UMD build resolve its worker chunk
// (814.ffmpeg.js) next to ffmpeg.js — which is also why the version lives in
// the path, not a ?v= query string: all files in a group must sit together.
//
// The asset list and the segment-versioning live in scripts/runtime-manifest.js
// (the single source of truth this script and assert-runtime-refs.js share).
// The versioned paths are what let netlify.toml mark /ffmpeg/* as immutable and
// the service worker (generated below) cache them forever: bumping a package
// lands its group's assets on a fresh URL. The core (wasm) and demux (mp4box/
// mp4-muxer) groups version independently, so bumping the small libs no longer
// re-downloads the 32 MB core.
const fs = require('fs');
const path = require('path');
const { resolve } = require('./runtime-manifest');

const root = path.join(__dirname, '..');
const ffmpegRoot = path.join(root, 'public', 'ffmpeg');

const manifest = resolve();
const segments = [manifest.core, manifest.demux];

// Drop stale segment dirs (and pre-versioning loose files) so public/ffmpeg
// never accumulates old runtimes.
if (fs.existsSync(ffmpegRoot)) {
  fs.readdirSync(ffmpegRoot).forEach((entry) => {
    if (!segments.includes(entry)) {
      fs.rmSync(path.join(ffmpegRoot, entry), { recursive: true, force: true });
    }
  });
}

manifest.copies.forEach(({ src, segment, dest }) => {
  const outDir = path.join(ffmpegRoot, segment);
  fs.mkdirSync(outDir, { recursive: true });
  fs.copyFileSync(path.join(root, 'node_modules', src), path.join(outDir, dest));
});

// Expose the segments to CRA. prestart/prebuild finish before react-scripts
// reads env files, so index.html (%REACT_APP_*%) and ffmpegEncoder.js
// (process.env.REACT_APP_*) both see them. Merge with any other keys already
// in .env.local — never clobber the file.
const envPath = path.join(root, '.env.local');
const envKeys = Object.keys(manifest.env);
let envLines = [];
if (fs.existsSync(envPath)) {
  envLines = fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((line) => line !== '' && !envKeys.some((k) => line.startsWith(`${k}=`)));
}
envKeys.forEach((k) => envLines.push(`${k}=${manifest.env[k]}`));
fs.writeFileSync(envPath, `${envLines.join('\n')}\n`);

// Generate the service worker. CRA interpolates %REACT_APP_*% in index.html
// only — not in other public/ files — so the segments are baked into public/
// sw.js here instead. public/sw.js is generated and git-ignored; edit
// scripts/sw.template.js.
const template = fs.readFileSync(path.join(__dirname, 'sw.template.js'), 'utf8');
const sw = template
  .replace(/__FFMPEG_CORE__/g, manifest.core)
  .replace(/__FFMPEG_DEMUX__/g, manifest.demux);
fs.writeFileSync(path.join(root, 'public', 'sw.js'), sw);

process.stdout.write(
  `Copied ${manifest.copies.length} runtime assets to public/ffmpeg/`
  + `{${manifest.core},${manifest.demux}} and generated public/sw.js\n`,
);
