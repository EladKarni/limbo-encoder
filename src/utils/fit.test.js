// Fit-math unit tests — the browser-free core of the never-exceed-target
// guarantee. These lock the budget/ladder/reachability behavior; they proved
// the Phase 3 split of video.js into fit.js was byte-identical and now guard
// fit.js directly.
import {
  effDur,
  bitrateKbps,
  isTargetReachable,
  chooseHeight,
  plannedOutBytes,
  estimateOutBytes,
  budgetKbps,
  MIN_VIDEO_KBPS,
  MIN_BPP,
} from './fit';

// A minimal file record; override per case.
const mk = (over = {}) => ({
  size: 100e6,
  duration: 60,
  trimStart: 0,
  trimEnd: 60,
  targetMB: 10,
  ...over,
});

describe('effDur', () => {
  it.each([
    ['full clip', { duration: 60, trimStart: 0, trimEnd: 60 }, 60],
    ['trimmed both ends', { duration: 60, trimStart: 10, trimEnd: 40 }, 30],
    ['trimEnd 0 falls back to duration', { duration: 60, trimStart: 0, trimEnd: 0 }, 60],
    ['start only', { duration: 60, trimStart: 15, trimEnd: 60 }, 45],
    ['degenerate (end<=start) falls back to duration', { duration: 60, trimStart: 50, trimEnd: 40 }, 60],
    ['no duration at all', { duration: 0, trimStart: 0, trimEnd: 0 }, 0],
  ])('%s', (_label, over, expected) => {
    expect(effDur(mk(over))).toBeCloseTo(expected, 5);
  });
});

describe('budgetKbps', () => {
  it('is the shared target budget both paths compute', () => {
    // (8000*10/60)*0.95 - 128 = 1138.666...
    expect(budgetKbps(10, 60, 128)).toBeCloseTo(1138.6667, 3);
  });

  it('passes the audio figure through as a parameter (the intentional fork)', () => {
    // Same target/duration, different audio assumptions -> different budgets.
    const wasm = budgetKbps(10, 60, 128); // wasm path assumes 128k
    const webcodecs = budgetKbps(10, 60, 64); // WebCodecs uses the real track
    expect(webcodecs - wasm).toBeCloseTo(64, 6);
  });

  it('returns 0 when duration or target is missing', () => {
    expect(budgetKbps(0, 60, 128)).toBe(0);
    expect(budgetKbps(10, 0, 128)).toBe(0);
  });
});

describe('bitrateKbps', () => {
  it('returns 0 when duration or target is missing', () => {
    expect(bitrateKbps(mk({ duration: 0, trimEnd: 0 }))).toBe(0);
    expect(bitrateKbps(mk({ targetMB: 0 }))).toBe(0);
  });

  it('budgets target bytes minus 128k audio, times 0.95', () => {
    // target = (8000*10/60)*0.95 - 128 = 1138.67 -> capped by source (huge) -> 1139
    expect(bitrateKbps(mk({ targetMB: 10, duration: 60, size: 100e6 }))).toBe(1139);
  });

  it('caps the budget at the source bitrate so a roomy target cannot inflate', () => {
    // Small 2 MB source over 60s: source = (2e6*8/1000/60) - 128 = 138.67.
    // A generous 100 MB target would budget far more, but the cap wins.
    const br = bitrateKbps(mk({ targetMB: 100, duration: 60, size: 2e6 }));
    const sourceKbps = Math.round((2e6 * 8) / 1000 / 60 - 128);
    expect(br).toBe(sourceKbps); // 139
  });

  it('returns 0 when the target budget goes negative (unreachable)', () => {
    // 1 MB over the full 60s: (8000*1/60)*0.95 - 128 < 0, so the video
    // budget is negative and the file is not encodable at this target.
    const br = bitrateKbps(mk({ targetMB: 1, duration: 60, size: 50e6 }));
    expect(br).toBe(0);
  });

  it('can dip below the floor for a small-but-positive target (source cap raises only the source side)', () => {
    // The floor guards the SOURCE side; the final min(target, ...) can still
    // land under MIN_VIDEO_KBPS. isTargetReachable is what blocks these.
    // target = (8000*0.7/30)*0.95 - 128 = 49.33 -> min(49.33, bigSource) = 49.
    const br = bitrateKbps(mk({
      targetMB: 0.7, duration: 30, size: 50e6, trimEnd: 30,
    }));
    expect(br).toBe(49);
    expect(br).toBeLessThan(MIN_VIDEO_KBPS);
  });

  it('rounds to the nearest integer', () => {
    expect(Number.isInteger(bitrateKbps(mk()))).toBe(true);
  });
});

describe('isTargetReachable', () => {
  it('is true when the budget meets the floor', () => {
    expect(isTargetReachable(mk({ targetMB: 10, duration: 60, size: 100e6 }))).toBe(true);
  });

  it('is false when the target is too small for the duration', () => {
    // 1 MB over 600s of tiny-bitrate source: budget below 100 kbps.
    expect(isTargetReachable(mk({
      targetMB: 1, duration: 600, size: 5e6, trimEnd: 600,
    }))).toBe(false);
  });

  it('agrees with bitrateKbps >= MIN_VIDEO_KBPS', () => {
    const f = mk({
      targetMB: 2, duration: 120, size: 30e6, trimEnd: 120,
    });
    expect(isTargetReachable(f)).toBe(bitrateKbps(f) >= MIN_VIDEO_KBPS);
  });
});

describe('chooseHeight (bpp ladder)', () => {
  // The ladder is [cap, 1080, 720, 480, 360] filtered to <= cap and unique;
  // it returns the largest rung whose bpp = (kbps*1000)/(w*h*fps) >= MIN_BPP.
  const srcW = 1920;
  const srcH = 1080;
  const fps = 30;

  it('never exceeds the user/source cap', () => {
    expect(chooseHeight(50000, srcW, srcH, fps, 720)).toBeLessThanOrEqual(720);
    expect(chooseHeight(50000, srcW, srcH, fps, 1080)).toBeLessThanOrEqual(1080);
  });

  it('picks a full-resolution rung when the budget is generous', () => {
    // A very high bitrate affords the source resolution.
    expect(chooseHeight(50000, srcW, srcH, fps, srcH)).toBe(1080);
  });

  it('steps down when the budget cannot feed the top rung at MIN_BPP', () => {
    // Bitrate that gives >= MIN_BPP at 720 but not at 1080.
    // bpp@1080 = (kbps*1000)/(1920*1080*30); solve kbps so bpp<MIN_BPP@1080
    // but >=MIN_BPP@720 (1280x720).
    const kbps1080 = Math.floor((MIN_BPP * 1920 * 1080 * fps) / 1000) - 50; // just under
    const h = chooseHeight(kbps1080, srcW, srcH, fps, srcH);
    expect(h).toBeLessThan(1080);
    expect([720, 480, 360]).toContain(h);
  });

  it('falls through to the smallest rung (360) when the budget is tiny', () => {
    expect(chooseHeight(50, srcW, srcH, fps, srcH)).toBe(360);
  });

  it('a lower bitrate never picks a taller rung than a higher one (monotonic)', () => {
    const heights = [50, 200, 800, 2000, 8000, 50000].map(
      (k) => chooseHeight(k, srcW, srcH, fps, srcH),
    );
    for (let i = 1; i < heights.length; i += 1) {
      expect(heights[i]).toBeGreaterThanOrEqual(heights[i - 1]);
    }
  });

  it('respects MIN_BPP exactly at the chosen rung', () => {
    const kbps = 3000;
    const h = chooseHeight(kbps, srcW, srcH, fps, srcH);
    const w = srcW * (h / srcH);
    const bpp = (kbps * 1000) / (w * h * fps);
    // Either the chosen rung meets MIN_BPP, or it is the smallest rung (360).
    expect(bpp >= MIN_BPP || h === 360).toBe(true);
  });
});

describe('plannedOutBytes', () => {
  it('is the target when the source can fill it', () => {
    expect(plannedOutBytes(mk({ targetMB: 10, size: 100e6, duration: 60 }))).toBe(10e6);
  });

  it('is the trimmed source share when that is smaller than the target', () => {
    // 5 MB source, trimmed to half -> 2.5 MB planned, below a 10 MB target.
    const f = mk({
      targetMB: 10, size: 5e6, duration: 60, trimStart: 0, trimEnd: 30,
    });
    expect(plannedOutBytes(f)).toBeCloseTo(2.5e6, 0);
  });

  it('never exceeds the target', () => {
    const f = mk({ targetMB: 3, size: 999e6, duration: 60 });
    expect(plannedOutBytes(f)).toBeLessThanOrEqual(3e6);
  });
});

describe('estimateOutBytes', () => {
  it('is bounded below by a small floor', () => {
    expect(estimateOutBytes(mk({ targetMB: 0, size: 1000, duration: 60 })))
      .toBeGreaterThanOrEqual(40000);
  });

  it('tracks the smaller of the target and the trimmed source share', () => {
    const f = mk({
      targetMB: 100, size: 20e6, duration: 60, trimEnd: 60,
    });
    // origMB=20, ratio=1, est=min(100,20)=20 -> *1e6*0.97
    expect(estimateOutBytes(f)).toBeCloseTo(20e6 * 0.97, 0);
  });
});
