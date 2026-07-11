// Build-time guard: the runtime asset list has a single source of truth
// (runtime-manifest.js), but three files reference it by hand — the copy
// script (checked implicitly, it IS the consumer), index.html's eager script
// tags, and ffmpegEncoder.js's ffmpeg.load() base. If any drifts from the
// manifest — a renamed segment env var, a moved asset — the app 404s its
// runtime at load time with no build error. This asserts they agree, and
// runs in prebuild after the copy so a mismatch fails the build loudly.
const fs = require('fs');
const path = require('path');
const { resolve, GROUPS } = require('./runtime-manifest');

const root = path.join(__dirname, '..');
const manifest = resolve();
const errors = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

// index.html must reference each group's assets under that group's env var.
const html = read('public/index.html');
const htmlChecks = [
  { file: 'ffmpeg.js', env: 'REACT_APP_FFMPEG_CORE' },
  { file: 'mp4box.all.min.js', env: 'REACT_APP_FFMPEG_DEMUX' },
  { file: 'mp4-muxer.js', env: 'REACT_APP_FFMPEG_DEMUX' },
];
htmlChecks.forEach(({ file, env }) => {
  const expected = `/ffmpeg/%${env}%/${file}`;
  if (!html.includes(expected)) {
    errors.push(`index.html must load ${file} from %${env}% (expected "…${expected}")`);
  }
});

// ffmpegEncoder.js loads the wasm core off the CORE segment env var.
const encoder = read('src/utils/ffmpegEncoder.js');
if (!encoder.includes('process.env.REACT_APP_FFMPEG_CORE')) {
  errors.push('ffmpegEncoder.js must build FFMPEG_BASE from process.env.REACT_APP_FFMPEG_CORE');
}
['ffmpeg-core.js', 'ffmpeg-core.wasm', 'ffmpeg-core.worker.js'].forEach((f) => {
  if (!encoder.includes(`/${f}`)) {
    errors.push(`ffmpegEncoder.js must load ${f} from the core segment`);
  }
});

// Every manifest env key must actually be produced (guards a renamed group).
Object.keys(manifest.env).forEach((k) => {
  if (!html.includes(`%${k}%`) && !encoder.includes(k)) {
    errors.push(`manifest env key ${k} is referenced by no consumer`);
  }
});

// The demux libs must NOT be loaded via ffmpeg.load (they are script globals).
Object.values(GROUPS.demux.files).forEach(([, dest]) => {
  if (encoder.includes(dest)) {
    errors.push(`ffmpegEncoder.js should not reference the demux global ${dest}`);
  }
});

if (errors.length) {
  process.stderr.write(`runtime-ref check FAILED:\n- ${errors.join('\n- ')}\n`);
  process.exit(1);
}
process.stdout.write('runtime-ref check: index.html and ffmpegEncoder.js match the manifest\n');
