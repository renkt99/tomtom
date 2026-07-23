import { describe, expect, it } from 'vitest';
import { bearingDeg, haversineM, type LatLon } from './geo';

describe('haversineM', () => {
  it('is zero for identical points', () => {
    const p: LatLon = { lat: 51.5, lon: -0.12 };
    expect(haversineM(p, p)).toBe(0);
  });

  it('is ~111,195 m for 1 degree of latitude', () => {
    const a: LatLon = { lat: 0, lon: 0 };
    const b: LatLon = { lat: 1, lon: 0 };
    const d = haversineM(a, b);
    expect(d).toBeGreaterThan(111195 * 0.99);
    expect(d).toBeLessThan(111195 * 1.01);
  });

  it('is symmetric', () => {
    const a: LatLon = { lat: 40.7128, lon: -74.006 };
    const b: LatLon = { lat: 34.0522, lon: -118.2437 };
    expect(haversineM(a, b)).toBeCloseTo(haversineM(b, a), 6);
  });
});

describe('bearingDeg', () => {
  it('is ~0 due north', () => {
    const a: LatLon = { lat: 0, lon: 0 };
    const b: LatLon = { lat: 1, lon: 0 };
    expect(bearingDeg(a, b)).toBeCloseTo(0, 1);
  });

  it('is ~90 due east', () => {
    const a: LatLon = { lat: 0, lon: 0 };
    const b: LatLon = { lat: 0, lon: 1 };
    expect(bearingDeg(a, b)).toBeCloseTo(90, 1);
  });
});
