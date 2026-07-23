import { describe, expect, it } from 'vitest';
import { bearingDeg, haversineM, projectOntoSegment, type LatLon } from './geo';

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

describe('projectOntoSegment', () => {
  it('projects a point directly onto the segment midpoint', () => {
    // A short east-west segment near the equator; offset the point due
    // north from its midpoint.
    const a: LatLon = { lat: 0, lon: 0 };
    const b: LatLon = { lat: 0, lon: 0.01 };
    const mid: LatLon = { lat: 0, lon: 0.005 };
    const p: LatLon = { lat: 0.001, lon: 0.005 };

    const { tFrac, offsetM, point } = projectOntoSegment(p, a, b);

    expect(tFrac).toBeCloseTo(0.5, 2);
    expect(offsetM).toBeGreaterThan(0);
    expect(offsetM).toBeCloseTo(haversineM(p, mid), -1);
    expect(point.lon).toBeCloseTo(mid.lon, 4);
  });

  it('clamps tFrac to 0 when the point projects before a', () => {
    const a: LatLon = { lat: 0, lon: 0 };
    const b: LatLon = { lat: 0, lon: 0.01 };
    const p: LatLon = { lat: 0, lon: -0.01 };

    const { tFrac, point } = projectOntoSegment(p, a, b);

    expect(tFrac).toBe(0);
    expect(point.lon).toBeCloseTo(a.lon, 6);
  });

  it('clamps tFrac to 1 when the point projects past b', () => {
    const a: LatLon = { lat: 0, lon: 0 };
    const b: LatLon = { lat: 0, lon: 0.01 };
    const p: LatLon = { lat: 0, lon: 0.02 };

    const { tFrac, point } = projectOntoSegment(p, a, b);

    expect(tFrac).toBe(1);
    expect(point.lon).toBeCloseTo(b.lon, 6);
  });

  it('offsetM is ~0 for a point on the segment', () => {
    const a: LatLon = { lat: 51.5, lon: -0.1 };
    const b: LatLon = { lat: 51.51, lon: -0.09 };
    const p: LatLon = {
      lat: (a.lat + b.lat) / 2,
      lon: (a.lon + b.lon) / 2
    };

    const { offsetM } = projectOntoSegment(p, a, b);
    expect(offsetM).toBeLessThan(1);
  });
});
