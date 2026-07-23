import { describe, expect, it } from 'vitest';
import { buildCumDist } from './polyline';
import { matchAdvanceBudgetM, matchProgress, type ProgressHint } from './progress';
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

// A straight-ish out-and-bound polyline: 20 points heading east, then the
// same 20 points reversed heading back west along a nearly-identical path
// (small offset so segments aren't literally identical, mimicking real
// GPS-derived out-and-back routes).
function makeOutAndBackPolyline(): LatLon[] {
  const outbound: LatLon[] = [];
  for (let i = 0; i < 20; i++) {
    outbound.push({ lat: 40 + i * 0.00001, lon: -74 + i * 0.0005 });
  }
  const inbound = [...outbound].reverse().map((p) => ({ lat: p.lat, lon: p.lon }));
  return [...outbound, ...inbound];
}

describe('matchProgress', () => {
  it('advances distAlongM as a point moves along a single segment', () => {
    const polyline: LatLon[] = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 0.01 }
    ];
    const route = makeRoute(polyline);
    let hint: ProgressHint = { segIdx: 0, distAlongM: 0, offRouteM: 0 };

    hint = matchProgress({ lat: 0, lon: 0.0025 }, route, hint);
    const quarter = hint.distAlongM;

    hint = matchProgress({ lat: 0, lon: 0.0075 }, route, hint);
    const threeQuarter = hint.distAlongM;

    expect(threeQuarter).toBeGreaterThan(quarter);
    expect(hint.offRouteM).toBeLessThan(5);
  });

  it('does not advance distAlongM when off-route beyond the corridor, but updates offRouteM', () => {
    const polyline: LatLon[] = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 0.01 }
    ];
    const route = makeRoute(polyline, 50);
    let hint: ProgressHint = { segIdx: 0, distAlongM: 100, offRouteM: 0 };

    // ~1km north of the route - far outside a 50m corridor.
    hint = matchProgress({ lat: 0.01, lon: 0.005 }, route, hint);

    expect(hint.distAlongM).toBe(100);
    expect(hint.offRouteM).toBeGreaterThan(50);
  });

  it('never goes backward (monotonic clamp) even if a later match is earlier on the route', () => {
    const polyline: LatLon[] = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 0.01 },
      { lat: 0, lon: 0.02 }
    ];
    const route = makeRoute(polyline);
    let hint: ProgressHint = { segIdx: 1, distAlongM: 1500, offRouteM: 0 };

    // A point that (within the search window) best matches back near the start.
    hint = matchProgress({ lat: 0, lon: 0.001 }, route, hint);

    expect(hint.distAlongM).toBeGreaterThanOrEqual(1500);
  });

  it('is monotonically non-decreasing and reaches near totalDistM on an out-and-back route', () => {
    const polyline = makeOutAndBackPolyline();
    const route = makeRoute(polyline, 75);

    let hint: ProgressHint = { segIdx: 0, distAlongM: 0, offRouteM: 0 };
    const distances: number[] = [];

    // Feed positions along the whole out-and-back polyline, in order,
    // simulating a car driving out and then back along (almost) the same path.
    for (const p of polyline) {
      hint = matchProgress(p, route, hint);
      distances.push(hint.distAlongM);
    }

    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeGreaterThanOrEqual(distances[i - 1]);
    }

    expect(distances[distances.length - 1]).toBeGreaterThan(route.totalDistM * 0.95);
  });

  it('with maxAdvanceM, the first fix on a loop route matches the start, not the end', () => {
    // Closed block loop: start === end, few segments, so the final segment
    // is inside the initial search window and ties against segment 0 for a
    // fix at the shared vertex. Without the advance budget, the later-
    // segment tie preference teleports distAlongM to ~totalDistM.
    const loop: LatLon[] = [
      { lat: 40, lon: -74 },
      { lat: 40, lon: -73.999 },
      { lat: 40.0009, lon: -73.999 },
      { lat: 40.0009, lon: -74 },
      { lat: 40, lon: -74 }
    ];
    const route = makeRoute(loop);
    const hint0: ProgressHint = { segIdx: 0, distAlongM: 0, offRouteM: 0 };

    const hint = matchProgress(loop[0], route, hint0, matchAdvanceBudgetM(0));

    expect(hint.segIdx).toBe(0);
    expect(hint.distAlongM).toBeLessThan(route.totalDistM * 0.5);
  });

  it('with maxAdvanceM, sequential matching still advances to route end', () => {
    const polyline = makeOutAndBackPolyline();
    const route = makeRoute(polyline, 75);

    let hint: ProgressHint = { segIdx: 0, distAlongM: 0, offRouteM: 0 };
    let prev = false;
    for (const p of polyline) {
      // 1s between fixes, as the live controller would pass.
      hint = matchProgress(p, route, hint, matchAdvanceBudgetM(prev ? 1000 : 0));
      prev = true;
    }

    expect(hint.distAlongM).toBeGreaterThan(route.totalDistM * 0.95);
  });
});
