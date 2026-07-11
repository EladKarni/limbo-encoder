// Copies the ffmpeg.wasm runtime out of node_modules into public/ffmpeg so
// the app serves it same-origin. That keeps the "100% local" promise, avoids
// CDN fetches being blocked by the COOP/COEP isolation headers, and lets the
// UMD build resolve its worker chunk (814.ffmpeg.js) next to ffmpeg.js.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'public', 'ffmpeg');

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

fs.mkdirSync(outDir, { recursive: true });
files.forEach(([src, dest]) => {
  fs.copyFileSync(path.join(root, 'node_modules', src), path.join(outDir, dest));
});
process.stdout.write(`Copied ${files.length} ffmpeg assets to public/ffmpeg\n`);
