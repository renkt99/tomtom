import { describe, expect, it } from 'vitest';
import { acceptFix } from './filter';
import type { RawFix } from './types';

const BASE_T = 1700000000000;

function fix(overrides: Partial<RawFix>): RawFix {
  return { lat: 40, lon: -74, acc: 10, spd: 10, t: BASE_T, ...overrides };
}

describe('acceptFix', () => {
  it('accepts the first fix if accurate enough', () => {
    expect(acceptFix(null, fix({ acc: 20 }))).toBe(true);
  });

  it('rejects the first fix if too inaccurate', () => {
    expect(acceptFix(null, fix({ acc: 50 }))).toBe(false);
  });

  it('rejects a fix with acc=50 even when a prev exists', () => {
    const prev = fix({ t: BASE_T });
    const next = fix({ t: BASE_T + 1000, acc: 50, lat: 40.001 });
    expect(acceptFix(prev, next)).toBe(false);
  });

  it('rejects a teleport implying >70 m/s', () => {
    const prev = fix({ lat: 40, lon: -74, t: BASE_T });
    // ~1.1km in 1s of latitude change => far above 70 m/s.
    const next = fix({ lat: 40.01, lon: -74, t: BASE_T + 1000 });
    expect(acceptFix(prev, next)).toBe(false);
  });

  it('rejects a fix with dt <= 0 vs prev (stale/duplicate timestamp)', () => {
    const prev = fix({ t: BASE_T });
    const sameT = fix({ t: BASE_T, lat: 40.001 });
    const earlierT = fix({ t: BASE_T - 500, lat: 40.001 });
    expect(acceptFix(prev, sameT)).toBe(false);
    expect(acceptFix(prev, earlierT)).toBe(false);
  });

  it('rejects sub-5m jitter while stopped', () => {
    const prev = fix({ lat: 40, lon: -74, t: BASE_T });
    // ~1m north.
    const next = fix({ lat: 40.000009, lon: -74, t: BASE_T + 1000 });
    expect(acceptFix(prev, next)).toBe(false);
  });

  it('accepts legitimate movement above thresholds', () => {
    const prev = fix({ lat: 40, lon: -74, t: BASE_T });
    // ~1.1km east/west would be too fast; use a small, plausible move.
    const next = fix({ lat: 40.0001, lon: -74, t: BASE_T + 5000 });
    expect(acceptFix(prev, next)).toBe(true);
  });

  it('respects custom config overrides', () => {
    const prev = fix({ lat: 40, lon: -74, t: BASE_T });
    const next = fix({ lat: 40.000009, lon: -74, t: BASE_T + 1000 });
    expect(acceptFix(prev, next, { minMoveM: 0.5 })).toBe(true);
  });
});
