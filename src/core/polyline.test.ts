import { describe, expect, it } from 'vitest';
import { haversineM, projectOntoSegment } from './geo';
import { buildCumDist, simplifyM, trimEnds } from './polyline';
import type { LatLon, RawFix } from './types';

describe('simplifyM', () => {
  it('preserves the first and last point', () => {
    const points: LatLon[] = [
      { lat: 0, lon: 0 },
      { lat: 0.0001, lon: 0.0002 },
      { lat: 0.0003, lon: 0.0001 },
      { lat: 0.001, lon: 0.001 }
    ];
    const simplified = simplifyM(points, 10);
    expect(simplified[0]).toEqual(points[0]);
    expect(simplified[simplified.length - 1]).toEqual(points[points.length - 1]);
  });

  it('collapses near-collinear points within epsilon', () => {
    // A near-straight line with a tiny wobble well under 10m.
    const points: LatLon[] = [
      { lat: 0, lon: 0 },
      { lat: 0.00001, lon: 0.0005 }, // ~1m off the straight line
      { lat: 0, lon: 0.001 }
    ];
    const simplified = simplifyM(points, 10);
    expect(simplified.length).toBe(2);
  });

  it('keeps points that deviate beyond epsilon', () => {
    const points: LatLon[] = [
      { lat: 0, lon: 0 },
      { lat: 0.001, lon: 0.0005 }, // ~111m off a straight line - keep
      { lat: 0, lon: 0.001 }
    ];
    const simplified = simplifyM(points, 10);
    expect(simplified.length).toBe(3);
  });

  it('keeps all remaining points within epsilon of the original path', () => {
    const points: LatLon[] = [
      { lat: 0, lon: 0 },
      { lat: 0.0002, lon: 0.0003 },
      { lat: 0.0001, lon: 0.0006 },
      { lat: 0.0005, lon: 0.0009 },
      { lat: 0.0004, lon: 0.0012 },
      { lat: 0.001, lon: 0.0015 }
    ];
    const epsilonM = 10;
    const simplified = simplifyM(points, epsilonM);

    // Every original point should be within epsilon of *some* segment of
    // the simplified polyline (a reasonable proxy for "stays close to the
    // original path").
    for (const p of points) {
      let minOffset = Infinity;
      for (let i = 0; i < simplified.length - 1; i++) {
        const { offsetM } = projectOntoSegment(p, simplified[i], simplified[i + 1]);
        minOffset = Math.min(minOffset, offsetM);
      }
      expect(minOffset).toBeLessThanOrEqual(epsilonM + 1e-6);
    }
  });

  it('handles fewer than 3 points as a no-op', () => {
    const points: LatLon[] = [{ lat: 0, lon: 0 }];
    expect(simplifyM(points)).toEqual(points);
  });
});

describe('buildCumDist', () => {
  it('starts at zero and totals match summed haversine distances', () => {
    const points: LatLon[] = [
      { lat: 0, lon: 0 },
      { lat: 0.001, lon: 0 },
      { lat: 0.001, lon: 0.001 },
      { lat: 0.002, lon: 0.002 }
    ];
    const { cumDistM, totalDistM } = buildCumDist(points);

    expect(cumDistM[0]).toBe(0);
    expect(cumDistM.length).toBe(points.length);

    let manualTotal = 0;
    for (let i = 1; i < points.length; i++) {
      manualTotal += haversineM(points[i - 1], points[i]);
      expect(cumDistM[i]).toBeCloseTo(manualTotal, 6);
    }
    expect(totalDistM).toBeCloseTo(manualTotal, 6);
  });

  it('handles a single point', () => {
    const { cumDistM, totalDistM } = buildCumDist([{ lat: 0, lon: 0 }]);
    expect(cumDistM).toEqual([0]);
    expect(totalDistM).toBe(0);
  });
});

describe('trimEnds', () => {
  const BASE_T = 1700000000000;

  function fixAt(lat: number, spd: number, i: number): RawFix {
    return { lat, lon: -74, acc: 10, spd, t: BASE_T + i * 1000 };
  }

  it('drops stationary lead-in and trailing fixes', () => {
    const startLat = 40.001;
    const movingLats = Array.from({ length: 10 }, (_, i) => startLat + i * 0.0001);
    const endLat = movingLats[movingLats.length - 1];

    const trace: RawFix[] = [
      fixAt(startLat + 0.0000001, 0, 0),
      fixAt(startLat - 0.0000001, 0, 1),
      fixAt(startLat, 0, 2),
      ...movingLats.map((lat, i) => fixAt(lat, 12, 3 + i)),
      fixAt(endLat + 0.0000001, 0, 13),
      fixAt(endLat - 0.0000001, 0, 14)
    ];

    const trimmed = trimEnds(trace);
    expect(trimmed.every((f) => f.spd === 12)).toBe(true);
    expect(trimmed.length).toBe(10);
  });

  it('keeps at least 2 points even if the whole trace is slow', () => {
    const trace: RawFix[] = [fixAt(40, 0, 0), fixAt(40, 0, 1), fixAt(40, 0, 2)];
    const trimmed = trimEnds(trace);
    expect(trimmed.length).toBeGreaterThanOrEqual(2);
  });

  it('is a no-op for traces of length <= 2', () => {
    const trace: RawFix[] = [fixAt(40, 0, 0), fixAt(40, 0, 1)];
    expect(trimEnds(trace)).toEqual(trace);
  });
});
