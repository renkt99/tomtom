import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
  createRouteFromSeed,
  deleteRoute,
  deleteRun,
  getEtaForRoute,
  getRuns,
  listRoutesWithStats,
  saveRun
} from './repo';
import { makeTrace } from '../core/testUtils';
import type { LatLon, Run } from '../core/types';

function straightPolyline(steps: number): LatLon[] {
  const pts: LatLon[] = [];
  for (let i = 0; i <= steps; i++) {
    pts.push({ lat: 40 + i * 0.0005, lon: -74 + i * 0.0005 });
  }
  return pts;
}

beforeEach(async () => {
  await db.routes.clear();
  await db.runs.clear();
});

describe('createRouteFromSeed + saveRun', () => {
  it('creates a route with a valid seed run as bestRunId, then a faster run becomes the new best', async () => {
    const polyline = straightPolyline(20);
    const seedTrace = makeTrace(polyline, { speedMs: 10, seed: 1 });

    const route = await createRouteFromSeed('Home to Work', seedTrace);

    expect(route.bestRunId).not.toBeNull();
    const seedRun = (await getRuns(route.id))[0];
    expect(seedRun.valid).toBe(true);
    expect(route.bestRunId).toBe(seedRun.id);

    // A faster drive over the same route.
    const fastTrace = makeTrace(polyline, { speedMs: 20, seed: 2 });
    const startedAt = fastTrace[0].t;
    const { run: fastRun, isNewBest } = await saveRun(
      route.id,
      fastTrace,
      startedAt,
      'manual'
    );

    expect(fastRun.valid).toBe(true);
    expect(fastRun.durationMs).toBeLessThan(seedRun.durationMs);
    expect(isNewBest).toBe(true);

    const stats = await listRoutesWithStats();
    const updated = stats.find((s) => s.route.id === route.id);
    expect(updated?.route.bestRunId).toBe(fastRun.id);
    expect(updated?.bestDurationMs).toBe(fastRun.durationMs);
    expect(updated?.runCount).toBe(2);
  });

  it('deleteRun recomputes bestRunId, and deleteRoute cascades to its runs', async () => {
    const polyline = straightPolyline(20);
    const seedTrace = makeTrace(polyline, { speedMs: 10, seed: 3 });
    const route = await createRouteFromSeed('Loop', seedTrace);
    const seedRun = (await getRuns(route.id))[0];

    const fastTrace = makeTrace(polyline, { speedMs: 20, seed: 4 });
    const { run: fastRun } = await saveRun(
      route.id,
      fastTrace,
      fastTrace[0].t,
      'manual'
    );

    // Delete the current best (fastRun); bestRunId should fall back to the
    // remaining valid run (seedRun).
    await deleteRun(fastRun.id);
    const routeAfterDelete = await db.routes.get(route.id);
    expect(routeAfterDelete?.bestRunId).toBe(seedRun.id);

    await deleteRoute(route.id);
    expect(await db.routes.get(route.id)).toBeUndefined();
    expect(await getRuns(route.id)).toEqual([]);
  });
});

describe('getEtaForRoute + listRoutesWithStats eta field', () => {
  it('returns a route-basis estimate when only a couple of valid runs exist', async () => {
    const polyline = straightPolyline(20);
    const seedTrace = makeTrace(polyline, { speedMs: 10, seed: 10 });
    const route = await createRouteFromSeed('Eta Route', seedTrace);
    const seedRun = (await getRuns(route.id))[0];

    const secondTrace = makeTrace(polyline, { speedMs: 15, seed: 11 });
    const { run: secondRun } = await saveRun(
      route.id,
      secondTrace,
      secondTrace[0].t,
      'manual'
    );

    expect(seedRun.valid).toBe(true);
    expect(secondRun.valid).toBe(true);

    // Both runs share the same dow/hour (makeTrace's default startT), so an
    // `at` matching that dow/hour puts both in the exact bucket -- but with
    // only 2 runs (< MIN_BUCKET=3), the ladder falls through to the
    // unconditional route-wide fallback.
    const at = { dow: seedRun.dow, hour: seedRun.hour, nowMs: Date.now() };
    const eta = await getEtaForRoute(route.id, at);

    expect(eta).not.toBeNull();
    expect(eta!.basis).toBe('route');
    expect(eta!.n).toBe(2);
    // Sane: the blended-free route estimate should land between (or at) the
    // two runs' durations.
    const [lo, hi] = [seedRun.durationMs, secondRun.durationMs].sort(
      (a, b) => a - b
    );
    expect(eta!.etaMs).toBeGreaterThanOrEqual(lo);
    expect(eta!.etaMs).toBeLessThanOrEqual(hi);
  });

  it('getEtaForRoute returns null when a route has zero valid runs', async () => {
    const polyline = straightPolyline(20);
    const seedTrace = makeTrace(polyline, { speedMs: 10, seed: 12 });
    const route = await createRouteFromSeed('No Valid Runs', seedTrace);
    const seedRun = (await getRuns(route.id))[0];

    // Remove the valid seed run and replace it with a manually-inserted
    // invalid run so the route has runs but none are valid.
    await deleteRun(seedRun.id);
    const invalidRun: Run = {
      id: crypto.randomUUID(),
      routeId: route.id,
      startedAt: Date.now(),
      durationMs: 60_000,
      dow: 1,
      hour: 8,
      trace: [],
      distanceM: 0,
      coveragePct: 10,
      valid: false,
      reasons: ['low-coverage'],
      endedBy: 'manual'
    };
    await db.runs.add(invalidRun);

    const eta = await getEtaForRoute(route.id);
    expect(eta).toBeNull();

    const stats = await listRoutesWithStats();
    const row = stats.find((s) => s.route.id === route.id);
    expect(row).toBeDefined();
    expect(row!.eta).toBeNull();
  });

  it('listRoutesWithStats includes a non-null eta when valid runs exist', async () => {
    const polyline = straightPolyline(20);
    const seedTrace = makeTrace(polyline, { speedMs: 10, seed: 13 });
    const route = await createRouteFromSeed('Eta In List', seedTrace);

    const stats = await listRoutesWithStats();
    const row = stats.find((s) => s.route.id === route.id);
    expect(row).toBeDefined();
    expect(row!.eta).not.toBeNull();
    expect(row!.eta!.basis).toBe('route');
    expect(row!.eta!.n).toBe(1);
  });
});
