import { describe, expect, it } from 'vitest';
import { createAutoStopDetector } from './autostop';
import { acceptFix } from './filter';
import { buildCumDist } from './polyline';
import { matchAdvanceBudgetM, matchProgress, type ProgressHint } from './progress';
import { makeTrace } from './testUtils';
import type { Route, RawFix } from './types';

function makeRoute(): Route {
  const polyline = [
    { lat: 40, lon: -74 },
    { lat: 40.005, lon: -74 } // ~555 m north
  ];
  const { cumDistM, totalDistM } = buildCumDist(polyline);
  return {
    id: 'r1',
    name: 'test route',
    polyline,
    cumDistM,
    totalDistM,
    corridorM: 75,
    bestRunId: null,
    createdAt: 0
  };
}

/** Fixes that sit still at `pos` for `durationMs`, one per second. */
function dwellFixes(pos: { lat: number; lon: number }, startT: number, durationMs: number): RawFix[] {
  const fixes: RawFix[] = [];
  for (let t = 0; t <= durationMs; t += 1000) {
    fixes.push({ lat: pos.lat, lon: pos.lon, acc: 5, spd: 0, t: startT + t });
  }
  return fixes;
}

describe('createAutoStopDetector', () => {
  it('does not fire while driving at speed toward the end', () => {
    const route = makeRoute();
    const detector = createAutoStopDetector(route);
    const fixes = makeTrace(route.polyline, { speedMs: 12, hz: 1, noiseM: 0 });

    // distAlongM is irrelevant here: speed stays well above maxSpeedMs for
    // the whole approach, so the detector should never fire regardless of
    // coverage.
    let fired = false;
    for (const f of fixes) {
      fired = detector.next(f, route.totalDistM) || fired;
    }
    expect(fired).toBe(false);
  });

  it('fires after dwelling near the end, slow, with sufficient coverage', () => {
    const route = makeRoute();
    const detector = createAutoStopDetector(route, {
      radiusM: 60,
      maxSpeedMs: 2.5,
      dwellMs: 5000,
      minCoverageFrac: 0.8
    });

    // Approach from mid-route first (arms the detector: a fix outside the
    // end radius has been seen), then dwell at the end.
    detector.next(
      { lat: 40.0025, lon: -74, acc: 5, spd: 12, t: 1_699_999_999_000 },
      route.totalDistM * 0.5
    );

    const end = route.polyline[route.polyline.length - 1];
    const fixes = dwellFixes(end, 1_700_000_000_000, 8000);

    let fired = false;
    for (const f of fixes) {
      if (detector.next(f, route.totalDistM)) {
        fired = true;
        break;
      }
    }
    expect(fired).toBe(true);
  });

  it('does not fire before ever leaving the end zone (loop route: start ≈ end)', () => {
    // Loop: start and end are the same point, so a fresh run begins "near
    // end". Even with (bogus) full coverage and walking speed, the detector
    // must not fire until the drive has been outside the end radius once.
    const loop = [
      { lat: 40, lon: -74 },
      { lat: 40, lon: -73.999 },
      { lat: 40.0009, lon: -73.999 },
      { lat: 40.0009, lon: -74 },
      { lat: 40, lon: -74 }
    ];
    const { cumDistM, totalDistM } = buildCumDist(loop);
    const route: Route = {
      id: 'r2',
      name: 'loop',
      polyline: loop,
      cumDistM,
      totalDistM,
      corridorM: 75,
      bestRunId: null,
      createdAt: 0
    };

    const detector = createAutoStopDetector(route);
    let fired = false;
    for (const f of dwellFixes(loop[0], 1_700_000_000_000, 15_000)) {
      fired = detector.next(f, route.totalDistM) || fired;
    }
    expect(fired).toBe(false);

    // After walking away past the radius and coming back with coverage,
    // arrival detection works normally.
    fired =
      detector.next(
        { lat: 40.0005, lon: -73.9995, acc: 5, spd: 1.4, t: 1_700_000_020_000 },
        route.totalDistM * 0.5
      ) || fired;
    expect(fired).toBe(false);
    for (const f of dwellFixes(loop[4], 1_700_000_030_000, 8000)) {
      fired = detector.next(f, route.totalDistM) || fired;
    }
    expect(fired).toBe(true);
  });

  it('walked block loop: records to arrival instead of firing seconds after start', () => {
    // Regression for the field bug where recording a run on a small loop
    // route exited within ~5-12s: the first fix matched the loop's final
    // segment (progress teleported to ~100%), and walking pace is always
    // below the detector's speed threshold, so nearEnd + slow + coverage
    // held from the very first fix. Full accept/match/detect pipeline,
    // wired the way driveController wires it.
    const loop = [
      { lat: 40, lon: -74 },
      { lat: 40, lon: -73.99906 },
      { lat: 40.00054, lon: -73.99906 },
      { lat: 40.00054, lon: -74 },
      { lat: 40, lon: -74 }
    ];
    const { cumDistM, totalDistM } = buildCumDist(loop);
    const route: Route = {
      id: 'r3',
      name: 'block',
      polyline: loop,
      cumDistM,
      totalDistM,
      corridorM: 75,
      bestRunId: null,
      createdAt: 0
    };

    // Walking pace, 1 Hz, 6m GPS noise.
    const fixes = makeTrace(loop, { speedMs: 1.4, hz: 1, noiseM: 6, seed: 1 });
    const detector = createAutoStopDetector(route);
    let hint: ProgressHint = { segIdx: 0, distAlongM: 0, offRouteM: 0 };
    let prev: RawFix | null = null;
    let startedT: number | null = null;
    let firedAtMs: number | null = null;
    let firedAtDistM = 0;

    for (const fix of fixes) {
      if (!acceptFix(prev, fix)) continue;
      const dtMs = prev ? fix.t - prev.t : 0;
      prev = fix;
      if (startedT === null) startedT = fix.t;
      hint = matchProgress(
        { lat: fix.lat, lon: fix.lon },
        route,
        hint,
        matchAdvanceBudgetM(dtMs)
      );
      // Early in the walk, progress must not have teleported to the end.
      if (fix.t - startedT <= 10_000) {
        expect(hint.distAlongM).toBeLessThan(route.totalDistM * 0.5);
      }
      if (detector.next(fix, hint.distAlongM)) {
        firedAtMs = fix.t - startedT;
        firedAtDistM = hint.distAlongM;
        break;
      }
    }

    // Never fires in the first minute; when it does fire it is a genuine
    // arrival (>90% of the loop actually covered).
    if (firedAtMs !== null) {
      expect(firedAtMs).toBeGreaterThan(60_000);
      expect(firedAtDistM).toBeGreaterThan(route.totalDistM * 0.9);
    }
  });

  it('does not fire if coverage is insufficient even when stopped near the end', () => {
    const route = makeRoute();
    const detector = createAutoStopDetector(route);
    const end = route.polyline[route.polyline.length - 1];
    const fixes = dwellFixes(end, 1_700_000_000_000, 8000);

    let fired = false;
    for (const f of fixes) {
      // distAlongM far below minCoverageFrac * totalDistM
      if (detector.next(f, route.totalDistM * 0.1)) {
        fired = true;
        break;
      }
    }
    expect(fired).toBe(false);
  });

  it('resets the dwell timer if the driver moves away before dwellMs elapses', () => {
    const route = makeRoute();
    const detector = createAutoStopDetector(route, { dwellMs: 5000 });
    const end = route.polyline[route.polyline.length - 1];

    let fired = false;
    // Dwell for 3s (not enough to fire)...
    for (const f of dwellFixes(end, 1_700_000_000_000, 3000)) {
      fired = detector.next(f, route.totalDistM) || fired;
    }
    expect(fired).toBe(false);

    // ...then drive away fast (resets dwell)...
    fired =
      detector.next(
        { lat: 40.02, lon: -74, acc: 5, spd: 15, t: 1_700_000_004_000 },
        route.totalDistM
      ) || fired;
    expect(fired).toBe(false);

    // ...then come back and only dwell 3s again: still shouldn't fire.
    for (const f of dwellFixes(end, 1_700_000_005_000, 3000)) {
      fired = detector.next(f, route.totalDistM) || fired;
    }
    expect(fired).toBe(false);
  });
});
