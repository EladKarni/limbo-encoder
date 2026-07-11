// Pure pipeline helpers: the pre-encode guard chain and the option/patch
// mappers. These back the never-exceed-target guarantee's front door (which
// files are allowed to start) and the exact args each engine receives.
import {
  encodeBlocker, webCodecsOpts, wasmOpts, donePatch, overCeilingMsg,
} from './encodePipeline';

// jsdom lacks a real URL.createObjectURL; stub it for donePatch.
beforeAll(() => {
  if (!window.URL.createObjectURL) {
    window.URL.createObjectURL = () => 'blob:stub';
  }
});

const mk = (over = {}) => ({
  name: 'clip.mp4',
  status: 'ready',
  duration: 60,
  trimStart: 0,
  trimEnd: 60,
  targetMB: 10,
  size: 100e6,
  res: 'Original',
  fps: 'Original',
  codec: 'H.264',
  file: { name: 'clip.mp4' },
  ...over,
});

describe('encodeBlocker', () => {
  it("returns '' (no message) for a non-ready file", () => {
    expect(encodeBlocker(null)).toBe('');
    expect(encodeBlocker(mk({ status: 'done' }))).toBe('');
  });

  it('blocks a file with no probed duration', () => {
    expect(encodeBlocker(mk({ duration: 0, trimEnd: 0 }))).toMatch(/Could not read the duration/);
  });

  it('blocks a file with no target set', () => {
    expect(encodeBlocker(mk({ targetMB: 0 }))).toMatch(/Set a target size/);
  });

  it('blocks an unreachable target', () => {
    // 1 MB over 600s of tiny source: budget below the 100 kbps floor.
    expect(encodeBlocker(mk({
      targetMB: 1, duration: 600, trimEnd: 600, size: 5e6,
    }))).toMatch(/Target too small/);
  });

  it('blocks an oversized input', () => {
    expect(encodeBlocker(mk({ size: 5 * 1024 ** 3 }))).toMatch(/over 4 GB/);
  });

  it('returns null for a ready, reachable file', () => {
    expect(encodeBlocker(mk())).toBeNull();
  });

  it('keeps its check order: duration is reported before target', () => {
    // A file missing BOTH duration and target reports the duration message
    // first (guards run top to bottom).
    expect(encodeBlocker(mk({ duration: 0, trimEnd: 0, targetMB: 0 })))
      .toMatch(/Could not read the duration/);
  });
});

describe('webCodecsOpts', () => {
  it('maps advanced settings and passes onProgress through', () => {
    const onProgress = () => {};
    const opts = webCodecsOpts(mk({ res: '720p', fps: '30 fps' }), onProgress);
    expect(opts).toMatchObject({
      targetMB: 10, trimStart: 0, resHeight: 720, fpsOut: 30, onProgress,
    });
  });

  it('drops a trimEnd that is within 50ms of the full duration (no trim)', () => {
    expect(webCodecsOpts(mk({ trimEnd: 60 }), null).trimEnd).toBe(0);
    expect(webCodecsOpts(mk({ trimEnd: 30 }), null).trimEnd).toBe(30);
  });

  it('leaves res/fps at 0 for "Original"', () => {
    const opts = webCodecsOpts(mk(), null);
    expect(opts.resHeight).toBe(0);
    expect(opts.fpsOut).toBe(0);
  });
});

describe('wasmOpts', () => {
  it('carries id/codec/targetBytes and the derived geometry', () => {
    const codec = { mime: 'video/mp4', ext: 'mp4' };
    const opts = wasmOpts(mk({ width: 1920, height: 1080 }), 'f1', codec, () => {});
    expect(opts).toMatchObject({
      id: 'f1', codec, targetMB: 10, targetBytes: 10e6, srcW: 1920, srcH: 1080,
    });
    expect(opts.startBitrateKbps).toBeGreaterThan(0);
  });

  it('defaults missing source geometry to 1920x1080', () => {
    const opts = wasmOpts(mk({ width: 0, height: 0 }), 'f1', {}, () => {});
    expect(opts.srcW).toBe(1920);
    expect(opts.srcH).toBe(1080);
  });
});

describe('donePatch', () => {
  it('builds a done-state patch with the output metadata', () => {
    const blob = { size: 12345 };
    const patch = donePatch(blob, 'video/webm', 'webm');
    expect(patch).toMatchObject({
      status: 'done', progress: 100, outBlob: blob, outBytes: 12345, outMime: 'video/webm', outExt: 'webm',
    });
    expect(patch.outUrl).toBeTruthy();
  });
});

describe('overCeilingMsg', () => {
  it('renders the wasm output ceiling in MB', () => {
    expect(overCeilingMsg).toMatch(/Sizes over 1700 MB/);
  });
});
