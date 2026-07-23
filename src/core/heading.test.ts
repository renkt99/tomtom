import { describe, expect, it } from 'vitest';
import { nextHeadingDeg, shortestArcDelta } from './heading';
import type { RawFix } from './types';

const BASE_T = 1700000000000;

function fix(overrides: Partial<RawFix>): RawFix {
  return { lat: 0, lon: 0, acc: 10, spd: 10, t: BASE_T, ...overrides };
}

describe('nextHeadingDeg', () => {
  it('prefers the device-reported heading when moving', () => {
    const prevFix = fix({ lat: 0, lon: 0, t: BASE_T });
    const next = fix({ lat: 0, lon: 0.0001, t: BASE_T + 1000, spd: 10, hdg: 123 });
    expect(nextHeadingDeg(45, prevFix, next)).toBe(123);
  });

  it('falls back to the bearing from the previous fix when hdg is undefined and moving', () => {
    // Due east.
    const prevFix = fix({ lat: 0, lon: 0, t: BASE_T });
    const next = fix({ lat: 0, lon: 0.001, t: BASE_T + 1000, spd: 10, hdg: undefined });
    const result = nextHeadingDeg(null, prevFix, next);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(90, 0);
  });

  it('holds the previous heading when spd is 0, even if hdg is present', () => {
    const prevFix = fix({ lat: 0, lon: 0, t: BASE_T });
    const next = fix({ lat: 0, lon: 0.0001, t: BASE_T + 1000, spd: 0, hdg: 200 });
    expect(nextHeadingDeg(77, prevFix, next)).toBe(77);
  });

  it('returns hdg for the first fix (no prev) when moving and hdg is present', () => {
    const next = fix({ spd: 10, hdg: 55 });
    expect(nextHeadingDeg(null, null, next)).toBe(55);
  });

  it('returns null for the first fix when moving with no hdg and no prev fix', () => {
    const next = fix({ spd: 10, hdg: undefined });
    expect(nextHeadingDeg(null, null, next)).toBeNull();
  });
});

describe('shortestArcDelta', () => {
  it('(350, 10) -> 20', () => {
    expect(shortestArcDelta(350, 10)).toBeCloseTo(20, 6);
  });

  it('(10, 350) -> -20', () => {
    expect(shortestArcDelta(10, 350)).toBeCloseTo(-20, 6);
  });

  it('(0, 180) -> +-180 (antipodal: both directions are equally "shortest")', () => {
    // The spec formula's canonicalization lands this exact boundary case on
    // -180 rather than +180; they represent the same rotation.
    expect(Math.abs(shortestArcDelta(0, 180))).toBeCloseTo(180, 6);
  });

  it('(90, 90) -> 0', () => {
    expect(shortestArcDelta(90, 90)).toBeCloseTo(0, 6);
  });
});
