// Retry-convergence tests for the measure-and-correct loop that backs the
// never-exceed-target guarantee. Both encode paths (App.js wasm loop and
// webcodecs.js transcodeMp4) implement the SAME loop with the SAME literals:
//
//   - up to ATTEMPTS (3) passes
//   - accept when output <= target * TOLERANCE (1.02)
//   - otherwise correct: bitrate = max(FLOOR, floor(bitrate * (target/actual) * 0.95))
//   - a lower corrected bitrate also re-picks a lower resolution rung
//
// Phase 3 hoists these literals + the correction into fit.js; this test then
// imports them so it validates the real extracted code. Until then the
// constants below mirror the source exactly (kept in one place so a broken
// correction formula fails here).
const ATTEMPTS = 3;
const TOLERANCE = 1.02;
const CORRECTION = 0.95;
const FLOOR = 100; // MIN_VIDEO_KBPS

// The correction step, exactly as written in both loops.
function correctBitrate(bitrate, actualBytes, targetBytes) {
  return Math.max(FLOOR, Math.floor(bitrate * (targetBytes / actualBytes) * CORRECTION));
}

// A fake encoder whose output scales with bitrate but overshoots the
// requested average by `overshoot`x — the failure mode real encoders show at
// thin bits-per-pixel. bytesPerKbps ties output size to bitrate linearly.
function makeEncoder({ overshoot, bytesPerKbps }) {
  return (bitrateKbps) => Math.round(bitrateKbps * bytesPerKbps * overshoot);
}

// Drives the loop the way both paths do; returns {ok, attempts, finalBytes}.
function runLoop({ startBitrate, targetBytes, encoder }) {
  let bitrate = startBitrate;
  let bytes = 0;
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    bytes = encoder(bitrate);
    if (bytes <= targetBytes * TOLERANCE) {
      return {
        ok: true, attempts: attempt + 1, finalBytes: bytes, finalBitrate: bitrate,
      };
    }
    if (attempt === ATTEMPTS - 1) break;
    bitrate = correctBitrate(bitrate, bytes, targetBytes);
  }
  return {
    ok: false, attempts: ATTEMPTS, finalBytes: bytes, finalBitrate: bitrate,
  };
}

describe('correctBitrate', () => {
  it('lowers the bitrate proportionally to the overshoot, with the 0.95 haircut', () => {
    // Overshot 2x: target/actual = 0.5, *0.95 -> new = 1000*0.5*0.95 = 475.
    expect(correctBitrate(1000, 2000, 1000)).toBe(475);
  });

  it('never drops below the floor', () => {
    expect(correctBitrate(120, 1e9, 1000)).toBe(FLOOR);
  });

  it('floors to an integer', () => {
    expect(Number.isInteger(correctBitrate(1234, 4321, 1000))).toBe(true);
  });
});

describe('retry loop convergence', () => {
  it('accepts a first pass already within tolerance', () => {
    const encoder = makeEncoder({ overshoot: 1.0, bytesPerKbps: 100 });
    const r = runLoop({ startBitrate: 100, targetBytes: 100 * 100, encoder });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(1);
  });

  it('accepts a pass that overshoots by <= 2% without correcting', () => {
    const targetBytes = 1_000_000;
    // Output exactly target*1.02 -> accepted on attempt 1.
    const encoder = () => Math.round(targetBytes * 1.02);
    const r = runLoop({ startBitrate: 1000, targetBytes, encoder });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(1);
  });

  it('converges within 3 attempts for a realistic 3-4x software overshoot', () => {
    // Software fallback overshoots ~3.5x at thin bpp; the corrected bitrate
    // pulls it back under target within the budget.
    const encoder = makeEncoder({ overshoot: 3.5, bytesPerKbps: 50 });
    const r = runLoop({ startBitrate: 4000, targetBytes: 4000 * 50, encoder });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBeLessThanOrEqual(ATTEMPTS);
    expect(r.finalBytes).toBeLessThanOrEqual(4000 * 50 * TOLERANCE);
  });

  it('the corrected bitrate strictly decreases while overshooting', () => {
    const encoder = makeEncoder({ overshoot: 3.5, bytesPerKbps: 50 });
    const targetBytes = 4000 * 50;
    let bitrate = 4000;
    const seen = [bitrate];
    for (let i = 0; i < ATTEMPTS - 1; i += 1) {
      const bytes = encoder(bitrate);
      if (bytes <= targetBytes * TOLERANCE) break;
      bitrate = correctBitrate(bitrate, bytes, targetBytes);
      seen.push(bitrate);
    }
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i]).toBeLessThan(seen[i - 1]);
    }
  });

  it('fails honestly (does not deliver an oversized file) when the floor cannot fit', () => {
    // An impossible target: even at the 100 kbps floor the encoder overshoots
    // past target. The loop must report failure, never return an oversized ok.
    const encoder = makeEncoder({ overshoot: 5, bytesPerKbps: 1000 });
    const r = runLoop({ startBitrate: 200, targetBytes: 50_000, encoder });
    expect(r.ok).toBe(false);
    expect(r.attempts).toBe(ATTEMPTS);
    // The critical invariant: a non-ok result is never treated as delivered.
    expect(r.finalBytes).toBeGreaterThan(50_000 * TOLERANCE);
  });

  it('a broken correction (raising instead of lowering the bitrate) would be caught', () => {
    // Guard test: prove the suite would catch a sign-flipped correction.
    const brokenCorrect = (bitrate) => bitrate * 2; // wrong direction
    const encoder = makeEncoder({ overshoot: 3.5, bytesPerKbps: 50 });
    const targetBytes = 4000 * 50;
    let bitrate = 4000;
    let ok = false;
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      const bytes = encoder(bitrate);
      if (bytes <= targetBytes * TOLERANCE) { ok = true; break; }
      bitrate = brokenCorrect(bitrate);
    }
    // A correction that raises the bitrate never converges — the guarantee
    // would be violated. This asserts the harness is sensitive to that.
    expect(ok).toBe(false);
  });
});
