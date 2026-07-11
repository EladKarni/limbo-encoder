// Single source of truth for the self-hosted runtime assets: which files are
// copied out of node_modules, which npm package versions their cache-busting
// path segment derives from, and where each is referenced. The copy script
// (copy-ffmpeg-assets.js) consumes this to lay the files out under
// public/ffmpeg/<segment>/, and the build asserts that index.html and
// ffmpegEncoder.js reference the same segments (assert-runtime-refs.js).
//
// The runtime is split into two independently-versioned groups so bumping the
// small demux/mux libs no longer invalidates the 32 MB wasm core cache:
//
//   - core:  @ffmpeg/ffmpeg + @ffmpeg/core-mt  -> public/ffmpeg/core-<v>/
//   - demux: mp4box + mp4-muxer                -> public/ffmpeg/demux-<v>/
//
// Both segments live under /ffmpeg/, so the service worker's URL-derived
// runtimeCacheName (/^\/ffmpeg\/([^/]+)\//) still names each cache correctly
// without any change to its logic.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function pkgVersion(name) {
  const pkg = path.join(root, 'node_modules', name, 'package.json');
  return JSON.parse(fs.readFileSync(pkg, 'utf8')).version;
}

// Each group: a path-segment prefix, the packages whose versions compose its
// segment, and the files copied into it (src relative to node_modules, dest
// basename served under the segment dir).
const GROUPS = {
  core: {
    prefix: 'core',
    packages: ['@ffmpeg/ffmpeg', '@ffmpeg/core-mt'],
    files: [
      ['@ffmpeg/ffmpeg/dist/umd/ffmpeg.js', 'ffmpeg.js'],
      ['@ffmpeg/ffmpeg/dist/umd/814.ffmpeg.js', '814.ffmpeg.js'],
      ['@ffmpeg/core-mt/dist/umd/ffmpeg-core.js', 'ffmpeg-core.js'],
      ['@ffmpeg/core-mt/dist/umd/ffmpeg-core.wasm', 'ffmpeg-core.wasm'],
      ['@ffmpeg/core-mt/dist/umd/ffmpeg-core.worker.js', 'ffmpeg-core.worker.js'],
    ],
  },
  demux: {
    prefix: 'demux',
    packages: ['mp4box', 'mp4-muxer'],
    // WebCodecs fast path: mp4 demuxer and muxer, script-tag globals because
    // their dists use syntax webpack 4 cannot parse.
    files: [
      ['mp4box/dist/mp4box.all.min.js', 'mp4box.all.min.js'],
      ['mp4-muxer/build/mp4-muxer.js', 'mp4-muxer.js'],
    ],
  },
};

// e.g. "core-0.12.15-0.12.10". Deterministic from installed versions.
function segment(group) {
  return `${group.prefix}-${group.packages.map(pkgVersion).join('-')}`;
}

// The resolved manifest: segment strings + the flat copy list + the env keys
// CRA exposes to index.html and ffmpegEncoder.js.
function resolve() {
  const core = segment(GROUPS.core);
  const demux = segment(GROUPS.demux);
  return {
    core,
    demux,
    // { srcRelativeToNodeModules, destSegmentDir, destBasename }
    copies: [
      ...GROUPS.core.files.map(([src, dest]) => ({ src, segment: core, dest })),
      ...GROUPS.demux.files.map(([src, dest]) => ({ src, segment: demux, dest })),
    ],
    env: {
      REACT_APP_FFMPEG_CORE: core,
      REACT_APP_FFMPEG_DEMUX: demux,
    },
  };
}

module.exports = { GROUPS, resolve, pkgVersion };
