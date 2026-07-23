import { describe, expect, it } from 'vitest';
import { ghostPositionAt, timeAtDistance } from './ghost';
import type { TracePoint } from './types';

function tp(t: number, lat: number, lon: number, d: number): TracePoint {
  return { t, lat, lon, acc: 5, spd: 0, d };
}

describe('ghostPositionAt', () => {
  it('lerps lat/lon between the bracketing points by time', () => {
    const trace = [tp(0, 0, 0, 0), tp(1000, 1, 1, 10), tp(2000, 2, 2, 20)];

    const mid = ghostPositionAt(trace, 500);
    expect(mid.lat).toBeCloseTo(0.5);
    expect(mid.lon).toBeCloseTo(0.5);

    const threeQuarter = ghostPositionAt(trace, 1500);
    expect(threeQuarter.lat).toBeCloseTo(1.5);
    expect(threeQuarter.lon).toBeCloseTo(1.5);
  });

  it('clamps to the first point before the trace starts', () => {
    const trace = [tp(1000, 5, 5, 0), tp(2000, 6, 6, 10)];
    const pos = ghostPositionAt(trace, -500);
    expect(pos).toEqual({ lat: 5, lon: 5 });
  });

  it('clamps to the last point after the trace ends', () => {
    const trace = [tp(1000, 5, 5, 0), tp(2000, 6, 6, 10)];
    const pos = ghostPositionAt(trace, 5000);
    expect(pos).toEqual({ lat: 6, lon: 6 });
  });

  it('handles a single-point trace', () => {
    const trace = [tp(1000, 5, 5, 0)];
    expect(ghostPositionAt(trace, 0)).toEqual({ lat: 5, lon: 5 });
    expect(ghostPositionAt(trace, 5000)).toEqual({ lat: 5, lon: 5 });
  });
});

describe('timeAtDistance', () => {
  it('lerps t between the bracketing points by distance', () => {
    const trace = [tp(0, 0, 0, 0), tp(1000, 1, 1, 10), tp(2000, 2, 2, 20)];
    expect(timeAtDistance(trace, 5)).toBeCloseTo(500);
    expect(timeAtDistance(trace, 15)).toBeCloseTo(1500);
  });

  it('clamps to the first point below the trace distance range', () => {
    const trace = [tp(1000, 0, 0, 100), tp(2000, 0, 0, 200)];
    expect(timeAtDistance(trace, 0)).toBe(1000);
  });

  it('clamps to the last point above the trace distance range', () => {
    const trace = [tp(1000, 0, 0, 100), tp(2000, 0, 0, 200)];
    expect(timeAtDistance(trace, 10000)).toBe(2000);
  });

  it('returns the earliest t at a flat plateau in d (stopped car), not skipping the stop', () => {
    // Car stopped between t=1000 and t=4000: d stays at 50 the whole time.
    const trace = [
      tp(0, 0, 0, 0),
      tp(1000, 0, 0, 50),
      tp(2000, 0, 0, 50),
      tp(3000, 0, 0, 50),
      tp(4000, 0, 0, 50),
      tp(5000, 0, 0, 60)
    ];
    // Asking for the time at distance 50 must return the EARLIEST arrival
    // (t=1000), not some later point in the plateau.
    expect(timeAtDistance(trace, 50)).toBe(1000);
  });

  it('handles a single-point trace', () => {
    const trace = [tp(1000, 0, 0, 50)];
    expect(timeAtDistance(trace, 0)).toBe(1000);
    expect(timeAtDistance(trace, 999)).toBe(1000);
  });
});
