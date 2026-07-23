import { describe, expect, it } from 'vitest';
import { computeDeltaMs, createEmaSmoother } from './delta';
import { matchProgress, type ProgressHint } from './progress';
import { buildCumDist } from './polyline';
import { makeTrace } from './testUtils';
import type { LatLon, RawFix, Route, TracePoint } from './types';

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

/** Mirrors repo.ts's toTracePoints (route mode) for test purposes. */
function toTracePoints(fixes: RawFix[], startedAt: number, route: Route): TracePoint[] {
  let hint: ProgressHint = { segIdx: 0, distAlongM: 0, offRouteM: 0 };
  return fixes.map((f) => {
    hint = matchProgress({ lat: f.lat, lon: f.lon }, route, hint);
    return {
      t: f.t - startedAt,
      lat: f.lat,
      lon: f.lon,
      acc: f.acc,
      spd: f.spd ?? 0,
      d: hint.distAlongM
    };
  });
}

function straightPolyline(steps: number): LatLon[] {
  const pts: LatLon[] = [];
  for (let i = 0; i <= steps; i++) {
    pts.push({ lat: 40 + i * 0.0005, lon: -74 + i * 0.0005 });
  }
  return pts;
}

function tp(t: number, d: number): TracePoint {
  return { t, lat: 0, lon: 0, acc: 5, spd: 0, d };
}

describe('computeDeltaMs + createEmaSmoother', () => {
  it('replaying the best run against itself keeps the smoothed delta within 1.5s of 0 throughout', () => {
    const polyline = straightPolyline(20);
    const fixes = makeTrace(polyline, { speedMs: 12.5, seed: 7 });
    const route = makeRoute(polyline);
    const bestTrace = toTracePoints(fixes, fixes[0].t, route);

    const smoother = createEmaSmoother(0.3);

    for (const point of bestTrace) {
      const raw = computeDeltaMs(point.t, point.d, bestTrace);
      const smoothed = smoother.next(raw);
      expect(Math.abs(smoothed)).toBeLessThan(1500);
    }
  });

  it('a drive that is slower in the second half accrues a meaningfully positive delta by the end', () => {
    // Constant-speed best trace: 1 m/ms... simplified to d == t (1 m/ms is
    // absurd, but the units cancel — only relative timing matters here).
    const bestTrace: TracePoint[] = [];
    for (let i = 0; i <= 10; i++) {
      bestTrace.push(tp(i * 1000, i * 100));
    }

    const smoother = createEmaSmoother(0.3);
    let lastSmoothed = 0;

    // First half (d 0..500) tracks the best trace's pace exactly; second
    // half (d 500..1000) takes twice as long to cover the same distance.
    for (let i = 0; i <= 5; i++) {
      const elapsedMs = i * 1000;
      const distAlongM = i * 100;
      lastSmoothed = smoother.next(computeDeltaMs(elapsedMs, distAlongM, bestTrace));
    }
    expect(Math.abs(lastSmoothed)).toBeLessThan(1500);

    for (let i = 1; i <= 5; i++) {
      const elapsedMs = 5000 + i * 2000;
      const distAlongM = 500 + i * 100;
      lastSmoothed = smoother.next(computeDeltaMs(elapsedMs, distAlongM, bestTrace));
    }

    expect(lastSmoothed).toBeGreaterThan(2000);
  });

  it('handles a best trace with a stopped plateau in d without skipping the stop', () => {
    // Best run sat still (d constant at 50) from t=1000 to t=4000.
    const bestTrace: TracePoint[] = [
      tp(0, 0),
      tp(1000, 50),
      tp(2000, 50),
      tp(3000, 50),
      tp(4000, 50),
      tp(5000, 100)
    ];

    // Current drive reaches d=50 at t=1000 too (same pace) — delta should
    // be ~0, not skewed by the plateau.
    expect(computeDeltaMs(1000, 50, bestTrace)).toBe(0);

    // Current drive reaches d=50 later, at t=3000 (took an extra 2s to get
    // there) — delta should reflect that full 2s, not be masked by the best
    // run's own stop.
    expect(computeDeltaMs(3000, 50, bestTrace)).toBe(2000);
  });
});
