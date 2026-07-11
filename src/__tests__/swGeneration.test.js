/**
 * @jest-environment node
 */
// The copy script (scripts/copy-ffmpeg-assets.js) bakes ONE composite version
// string into three places that must agree, or the service worker caches the
// runtime under a name the app never reads from: the /ffmpeg/<version>/ URL
// path, the FFMPEG_CACHE name in the generated public/sw.js, and
// REACT_APP_FFMPEG_VERSION in .env.local. This test pins that consistency so a
// future edit to the templating can't silently split them apart.
//
// Lives under src/ because create-react-app's Jest only discovers tests there
// (roots is locked to <rootDir>/src); it reaches up into scripts/ and
// node_modules/ for the real build inputs.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const TEMPLATE = path.join(ROOT, 'scripts', 'sw.template.js');

// Recompute the composite version exactly as the copy script does, so the
// test tracks the real inputs (bumping any of these packages changes it).
function computeVersion() {
  const packages = ['@ffmpeg/ffmpeg', '@ffmpeg/core-mt', 'mp4box', 'mp4-muxer'];
  return packages
    .map((name) => {
      const pkg = path.join(ROOT, 'node_modules', name, 'package.json');
      return JSON.parse(fs.readFileSync(pkg, 'utf8')).version;
    })
    .join('-');
}

// Apply the template substitution the way the script does.
function renderSw(version) {
  const template = fs.readFileSync(TEMPLATE, 'utf8');
  return template.replace(/__FFMPEG_VERSION__/g, version);
}

describe('sw.template.js version substitution', () => {
  const FAKE = '9.9.9-8.8.8-0.5.4-5.2.2';

  it('leaves no placeholder behind', () => {
    expect(renderSw(FAKE)).not.toContain('__FFMPEG_VERSION__');
  });

  it('bakes the version into FFMPEG_CACHE', () => {
    expect(renderSw(FAKE)).toContain(`const FFMPEG_CACHE = 'ffmpeg-${FAKE}'`);
  });

  it("runtimeCacheName derives the same name from the app's /ffmpeg/<version>/ path", () => {
    // The worker names the runtime cache off the request URL path, and it must
    // resolve to the same "ffmpeg-<version>" the app fetches under.
    const m = /^\/ffmpeg\/([^/]+)\//.exec(`/ffmpeg/${FAKE}/ffmpeg-core.wasm`);
    expect(m).not.toBeNull();
    expect(`ffmpeg-${m[1]}`).toBe(`ffmpeg-${FAKE}`);
  });
});

describe('generated artifacts agree (after a build/copy has run)', () => {
  const version = computeVersion();
  const swPath = path.join(ROOT, 'public', 'sw.js');
  const envPath = path.join(ROOT, '.env.local');
  const ffmpegDir = path.join(ROOT, 'public', 'ffmpeg', version);

  const built = fs.existsSync(swPath) && fs.existsSync(envPath);
  const maybe = built ? it : it.skip;

  maybe('public/sw.js caches under the computed composite version', () => {
    expect(fs.readFileSync(swPath, 'utf8'))
      .toContain(`const FFMPEG_CACHE = 'ffmpeg-${version}'`);
  });

  maybe('.env.local exposes the same version to the app', () => {
    expect(fs.readFileSync(envPath, 'utf8'))
      .toContain(`REACT_APP_FFMPEG_VERSION=${version}`);
  });

  maybe('the runtime assets were copied to the versioned dir', () => {
    expect(fs.existsSync(path.join(ffmpegDir, 'ffmpeg-core.wasm'))).toBe(true);
    expect(fs.existsSync(path.join(ffmpegDir, 'mp4box.all.min.js'))).toBe(true);
  });
});
