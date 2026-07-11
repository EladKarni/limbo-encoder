// Copies the ffmpeg.wasm runtime out of node_modules into a versioned
// directory under public/ffmpeg so the app serves it same-origin. That keeps
// the "100% local" promise, avoids CDN fetches being blocked by the COOP/COEP
// isolation headers, and lets the UMD build resolve its worker chunk
// (814.ffmpeg.js) next to ffmpeg.js — which is also why the version lives in
// the path, not a ?v= query string: all seven files must sit together.
//
// The versioned path is what lets netlify.toml mark /ffmpeg/* as immutable
// and the service worker (generated below from sw.template.js) cache it
// forever: bumping any of the four packages lands the assets on a fresh URL.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ffmpegRoot = path.join(root, 'public', 'ffmpeg');

const packages = ['@ffmpeg/ffmpeg', '@ffmpeg/core-mt', 'mp4box', 'mp4-muxer'];
const version = packages
  .map((name) => {
    const pkg = path.join(root, 'node_modules', name, 'package.json');
    return JSON.parse(fs.readFileSync(pkg, 'utf8')).version;
  })
  .join('-');

const outDir = path.join(ffmpegRoot, version);

const files = [
  ['@ffmpeg/ffmpeg/dist/umd/ffmpeg.js', 'ffmpeg.js'],
  ['@ffmpeg/ffmpeg/dist/umd/814.ffmpeg.js', '814.ffmpeg.js'],
  ['@ffmpeg/core-mt/dist/umd/ffmpeg-core.js', 'ffmpeg-core.js'],
  ['@ffmpeg/core-mt/dist/umd/ffmpeg-core.wasm', 'ffmpeg-core.wasm'],
  ['@ffmpeg/core-mt/dist/umd/ffmpeg-core.worker.js', 'ffmpeg-core.worker.js'],
  // WebCodecs fast path: mp4 demuxer and muxer, also script-tag globals
  // because their dists use syntax webpack 4 cannot parse.
  ['mp4box/dist/mp4box.all.min.js', 'mp4box.all.min.js'],
  ['mp4-muxer/build/mp4-muxer.js', 'mp4-muxer.js'],
];

// Drop stale version dirs (and pre-versioning loose files) so public/ffmpeg
// never accumulates old runtimes.
if (fs.existsSync(ffmpegRoot)) {
  fs.readdirSync(ffmpegRoot).forEach((entry) => {
    if (entry !== version) {
      fs.rmSync(path.join(ffmpegRoot, entry), { recursive: true, force: true });
    }
  });
}

fs.mkdirSync(outDir, { recursive: true });
files.forEach(([src, dest]) => {
  fs.copyFileSync(path.join(root, 'node_modules', src), path.join(outDir, dest));
});

// Expose the version to CRA. prestart/prebuild finish before react-scripts
// reads env files, so index.html (%REACT_APP_FFMPEG_VERSION%) and App.js
// (process.env.REACT_APP_FFMPEG_VERSION) both see it. Merge with any other
// keys already in .env.local — never clobber the file.
const envPath = path.join(root, '.env.local');
const envKey = 'REACT_APP_FFMPEG_VERSION';
let envLines = [];
if (fs.existsSync(envPath)) {
  envLines = fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((line) => line !== '' && !line.startsWith(`${envKey}=`));
}
envLines.push(`${envKey}=${version}`);
fs.writeFileSync(envPath, `${envLines.join('\n')}\n`);

// Generate the service worker. CRA interpolates %REACT_APP_*% in index.html
// only — not in other public/ files — so the version is baked into public/
// sw.js here instead. public/sw.js is generated and git-ignored; edit
// scripts/sw.template.js.
const template = fs.readFileSync(path.join(__dirname, 'sw.template.js'), 'utf8');
const sw = template.replace(/__FFMPEG_VERSION__/g, version);
fs.writeFileSync(path.join(root, 'public', 'sw.js'), sw);

process.stdout.write(
  `Copied ${files.length} ffmpeg assets to public/ffmpeg/${version} and generated public/sw.js\n`,
);
