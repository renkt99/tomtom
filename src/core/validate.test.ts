import { describe, expect, it } from 'vitest';
import { buildCumDist, simplifyM, trimEnds } from './polyline';
import { makeTrace } from './testUtils';
import { validateRun } from './validate';
import type { LatLon, Route } from './types';

function makeRoute(polyline: LatLon[], corridorM = 75): Route {
  const { cumDistM, totalDistM } = buildCumDist(polyline);
  return {
    id: 'r1',
    name: 'test route',
    polyline,
    cumDistM,
    totalDistM,
    corridorM,
    bestRunId: null,
    createdAt: 0
  };
}

function straightPolyline(steps: number): LatLon[] {
  const pts: LatLon[] = [];
  for (let i = 0; i <= steps; i++) {
    pts.push({ lat: 40 + i * 0.0005, lon: -74 + i * 0.0005 });
  }
  return pts;
}

describe('validateRun', () => {
  it('rejects a trace covering only half the route', () => {
    const polyline = straightPolyline(20);
    const route = makeRoute(polyline);

    const fullTrace = makeTrace(polyline);
    // Keep only the first half of fixes (by index), which covers roughly
    // the first half of the route's distance.
    const halfTrace = fullTrace.slice(0, Math.floor(fullTrace.length / 2));

    const result = validateRun(halfTrace, route);

    expect(result.coveragePct).toBeGreaterThan(30);
    expect(result.coveragePct).toBeLessThan(70);
    expect(result.reasons).toContain('low-coverage');
    expect(result.valid).toBe(false);
  });

  it('accepts a clean full-coverage trace built via the seed pipeline', () => {
    const rawPolyline = straightPolyline(20);
    const rawTrace = makeTrace(rawPolyline, { noiseM: 2 });

    const trimmed = trimEnds(rawTrace);
    const simplified = simplifyM(
      trimmed.map((f) => ({ lat: f.lat, lon: f.lon })),
      10
    );
    const route = makeRoute(simplified);

    const result = validateRun(trimmed, route);

    expect(result.reasons).not.toContain('low-coverage');
    expect(result.coveragePct).toBeGreaterThan(90);
    expect(result.valid).toBe(true);
  });

  it('flags start-off-route and end-off-route for a trace far from the route endpoints', () => {
    const polyline = straightPolyline(20);
    const route = makeRoute(polyline);

    const farAwayTrace = makeTrace(
      straightPolyline(20).map((p) => ({ lat: p.lat + 0.01, lon: p.lon + 0.01 }))
    );

    const result = validateRun(farAwayTrace, route);
    expect(result.reasons).toContain('start-off-route');
    expect(result.reasons).toContain('end-off-route');
  });

  it('flags too-few-fixes for a short trace', () => {
    const polyline = straightPolyline(20);
    const route = makeRoute(polyline);
    const shortTrace = makeTrace(polyline, { hz: 0.05 }); // very few samples

    const result = validateRun(shortTrace, route);
    expect(result.reasons).toContain('too-few-fixes');
  });

  it('flags too-fast for an implausibly high average speed', () => {
    const polyline = straightPolyline(20);
    const route = makeRoute(polyline);
    const fastTrace = makeTrace(polyline, { speedMs: 100, hz: 1 });

    const result = validateRun(fastTrace, route);
    expect(result.reasons).toContain('too-fast');
  });
});
