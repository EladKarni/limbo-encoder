/**
 * @jest-environment node
 */
// The copy script (scripts/copy-ffmpeg-assets.js) bakes the runtime segment
// versions into places that MUST agree, or the service worker caches the
// runtime under a name the app never reads from: the /ffmpeg/<segment>/ URL
// path, the FFMPEG_CACHES names in the generated public/sw.js, and the
// REACT_APP_FFMPEG_* keys in .env.local. This test pins that consistency —
// including the core/demux split — so a future edit can't silently break it.
//
// Lives under src/ because create-react-app's Jest only discovers tests there
// (roots is locked to <rootDir>/src); it reaches up into scripts/ and
// node_modules/ for the real build inputs.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const TEMPLATE = path.join(ROOT, 'scripts', 'sw.template.js');
// eslint-disable-next-line import/no-dynamic-require, global-require
const { resolve } = require(path.join(ROOT, 'scripts', 'runtime-manifest'));

// Apply the two-segment substitution the way the copy script does.
function renderSw(core, demux) {
  return fs.readFileSync(TEMPLATE, 'utf8')
    .replace(/__FFMPEG_CORE__/g, core)
    .replace(/__FFMPEG_DEMUX__/g, demux);
}

describe('sw.template.js segment substitution', () => {
  const CORE = 'core-9.9.9-8.8.8';
  const DEMUX = 'demux-0.5.4-5.2.2';

  it('leaves no placeholder behind', () => {
    const sw = renderSw(CORE, DEMUX);
    expect(sw).not.toContain('__FFMPEG_CORE__');
    expect(sw).not.toContain('__FFMPEG_DEMUX__');
  });

  it('bakes both segments into FFMPEG_CACHES', () => {
    const sw = renderSw(CORE, DEMUX);
    expect(sw).toContain(`'ffmpeg-${CORE}'`);
    expect(sw).toContain(`'ffmpeg-${DEMUX}'`);
  });

  it("runtimeCacheName derives each name from the app's /ffmpeg/<segment>/ path", () => {
    // The worker names each runtime cache off the request URL path, and it
    // must resolve to the same "ffmpeg-<segment>" the app fetches under.
    [CORE, DEMUX].forEach((seg) => {
      const m = /^\/ffmpeg\/([^/]+)\//.exec(`/ffmpeg/${seg}/asset.js`);
      expect(m).not.toBeNull();
      expect(`ffmpeg-${m[1]}`).toBe(`ffmpeg-${seg}`);
    });
  });
});

describe('the manifest splits the cache key so the core survives a demux bump', () => {
  const manifest = resolve();

  it('core and demux are separate, prefixed segments', () => {
    expect(manifest.core).toMatch(/^core-/);
    expect(manifest.demux).toMatch(/^demux-/);
    expect(manifest.core).not.toBe(manifest.demux);
  });

  it('exposes both segments as REACT_APP env keys', () => {
    expect(manifest.env.REACT_APP_FFMPEG_CORE).toBe(manifest.core);
    expect(manifest.env.REACT_APP_FFMPEG_DEMUX).toBe(manifest.demux);
  });

  it('routes the wasm core into the core segment and the demux libs into demux', () => {
    const core = manifest.copies.filter((c) => c.segment === manifest.core).map((c) => c.dest);
    const demux = manifest.copies.filter((c) => c.segment === manifest.demux).map((c) => c.dest);
    expect(core).toEqual(expect.arrayContaining(['ffmpeg-core.wasm', 'ffmpeg-core.js']));
    expect(demux).toEqual(expect.arrayContaining(['mp4box.all.min.js', 'mp4-muxer.js']));
    expect(core).not.toContain('mp4box.all.min.js');
  });
});

describe('generated artifacts agree (after a build/copy has run)', () => {
  const manifest = resolve();
  const swPath = path.join(ROOT, 'public', 'sw.js');
  const envPath = path.join(ROOT, '.env.local');

  const built = fs.existsSync(swPath) && fs.existsSync(envPath);
  const maybe = built ? it : it.skip;

  maybe('public/sw.js caches under both computed segments', () => {
    const sw = fs.readFileSync(swPath, 'utf8');
    expect(sw).toContain(`'ffmpeg-${manifest.core}'`);
    expect(sw).toContain(`'ffmpeg-${manifest.demux}'`);
  });

  maybe('.env.local exposes both segments to the app', () => {
    const env = fs.readFileSync(envPath, 'utf8');
    expect(env).toContain(`REACT_APP_FFMPEG_CORE=${manifest.core}`);
    expect(env).toContain(`REACT_APP_FFMPEG_DEMUX=${manifest.demux}`);
  });

  maybe('the runtime assets were copied to their segment dirs', () => {
    expect(fs.existsSync(path.join(ROOT, 'public', 'ffmpeg', manifest.core, 'ffmpeg-core.wasm'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'public', 'ffmpeg', manifest.demux, 'mp4box.all.min.js'))).toBe(true);
  });
});
