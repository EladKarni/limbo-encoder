// Routing + wasm-output-ceiling tests. plannedPath is the single source of
// truth for which engine a file hits; overWasmCeiling (now in fit.js)
// composes the planned path with plannedOutBytes and WASM_MAX_OUTPUT_BYTES.
import { plannedPath, webCodecsAvailable } from './webcodecs';
import { plannedOutBytes, WASM_MAX_OUTPUT_BYTES, overWasmCeiling } from './fit';

// Make webCodecsAvailable() return true by planting the globals it probes.
function enableWebCodecs() {
  window.VideoDecoder = function VideoDecoder() {};
  window.VideoEncoder = function VideoEncoder() {};
  window.EncodedVideoChunk = function EncodedVideoChunk() {};
  window.OffscreenCanvas = function OffscreenCanvas() {};
  window.MP4Box = {};
  window.Mp4Muxer = {};
}

function disableWebCodecs() {
  delete window.VideoDecoder;
  delete window.VideoEncoder;
  delete window.EncodedVideoChunk;
  delete window.OffscreenCanvas;
  delete window.MP4Box;
  delete window.Mp4Muxer;
}

afterEach(disableWebCodecs);

const mk = (over = {}) => ({
  name: 'clip.mp4',
  codec: 'H.264',
  size: 100e6,
  duration: 60,
  trimStart: 0,
  trimEnd: 60,
  targetMB: 10,
  ...over,
});

describe('webCodecsAvailable', () => {
  it('is false when the required globals are absent', () => {
    disableWebCodecs();
    expect(webCodecsAvailable()).toBe(false);
  });

  it('is true only when every required global is present', () => {
    enableWebCodecs();
    expect(webCodecsAvailable()).toBe(true);
    // Removing any single probe flips it back to false.
    delete window.MP4Box;
    expect(webCodecsAvailable()).toBe(false);
  });
});

describe('plannedPath', () => {
  it('routes mp4 + H.264 + WebCodecs-available to the fast path', () => {
    enableWebCodecs();
    expect(plannedPath(mk({ name: 'clip.mp4', codec: 'H.264' }))).toBe('webcodecs');
    expect(plannedPath(mk({ name: 'clip.MOV', codec: 'H.264' }))).toBe('webcodecs');
  });

  it('routes to wasm when WebCodecs is unavailable', () => {
    disableWebCodecs();
    expect(plannedPath(mk({ name: 'clip.mp4', codec: 'H.264' }))).toBe('wasm');
  });

  it('routes non-mp4/mov containers to wasm even with WebCodecs', () => {
    enableWebCodecs();
    expect(plannedPath(mk({ name: 'clip.webm', codec: 'H.264' }))).toBe('wasm');
    expect(plannedPath(mk({ name: 'clip.mkv', codec: 'H.264' }))).toBe('wasm');
    expect(plannedPath(mk({ name: 'clip.avi', codec: 'H.264' }))).toBe('wasm');
  });

  it('routes WebM-output (VP8) to wasm even for an mp4 source', () => {
    enableWebCodecs();
    expect(plannedPath(mk({ name: 'clip.mp4', codec: 'VP8 (WebM)' }))).toBe('wasm');
  });

  it('defaults an unknown codec key to H.264 for routing', () => {
    enableWebCodecs();
    expect(plannedPath(mk({ name: 'clip.mp4', codec: 'nonsense' }))).toBe('webcodecs');
  });

  it('is case-insensitive on the extension', () => {
    enableWebCodecs();
    expect(plannedPath(mk({ name: 'CLIP.MP4', codec: 'H.264' }))).toBe('webcodecs');
  });
});

// overWasmCeiling now lives in fit.js and takes the already-computed planned
// path (keeping fit.js free of a routing import cycle). App calls it with
// plannedPath(f); the tests mirror that exactly.
describe('WASM_MAX_OUTPUT_BYTES ceiling', () => {
  it('is the documented ~1.7 GB wall', () => {
    expect(WASM_MAX_OUTPUT_BYTES).toBe(1.7e9);
  });

  it('flags a wasm-path file whose planned output exceeds the ceiling', () => {
    disableWebCodecs(); // force wasm
    // 3 GB target, source large enough to fill it, no trim.
    const f = mk({
      name: 'big.mkv', codec: 'H.264', targetMB: 3000, size: 10e9, duration: 60,
    });
    expect(plannedOutBytes(f)).toBeGreaterThan(WASM_MAX_OUTPUT_BYTES);
    expect(overWasmCeiling(f, plannedPath(f))).toBe(true);
  });

  it('does not flag a webcodecs-path file even over the ceiling (engine-specific)', () => {
    enableWebCodecs();
    const f = mk({
      name: 'big.mp4', codec: 'H.264', targetMB: 3000, size: 10e9, duration: 60,
    });
    expect(plannedPath(f)).toBe('webcodecs');
    expect(overWasmCeiling(f, plannedPath(f))).toBe(false);
  });

  it('does not flag a wasm-path file under the ceiling', () => {
    disableWebCodecs();
    const f = mk({
      name: 'ok.webm', codec: 'VP8 (WebM)', targetMB: 1000, size: 5e9, duration: 60,
    });
    expect(plannedOutBytes(f)).toBeLessThan(WASM_MAX_OUTPUT_BYTES);
    expect(overWasmCeiling(f, plannedPath(f))).toBe(false);
  });

  it('does not flag when a small source cannot fill a huge target (source-bound planned bytes)', () => {
    disableWebCodecs();
    // Huge target but a 100 MB source: plannedOutBytes is source-bound.
    const f = mk({
      name: 'small.mkv', codec: 'H.264', targetMB: 3000, size: 100e6, duration: 60,
    });
    expect(plannedOutBytes(f)).toBe(100e6);
    expect(overWasmCeiling(f, plannedPath(f))).toBe(false);
  });
});
