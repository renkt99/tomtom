import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
  createRouteFromSeed,
  deleteRoute,
  deleteRun,
  getRuns,
  listRoutesWithStats,
  saveRun
} from './repo';
import { makeTrace } from '../core/testUtils';
import type { LatLon } from '../core/types';

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
