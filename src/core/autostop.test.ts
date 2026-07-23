import { describe, expect, it } from 'vitest';
import { createAutoStopDetector } from './autostop';
import { buildCumDist } from './polyline';
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
