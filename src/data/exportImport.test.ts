import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { createRouteFromSeed, saveRun } from './repo';
import { exportAll, importAll, EXPORT_VERSION } from './exportImport';
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
  await db.settings.clear();
});

async function blobToJson(blob: Blob): Promise<unknown> {
  const text = await blob.text();
  return JSON.parse(text);
}

describe('exportAll / importAll round trip', () => {
  it('round-trips: export -> clear -> import restores routes/runs and bestRunId', async () => {
    const polyline = straightPolyline(20);
    const seedTrace = makeTrace(polyline, { speedMs: 10, seed: 1 });
    const route = await createRouteFromSeed('Home to Work', seedTrace);

    const fastTrace = makeTrace(polyline, { speedMs: 20, seed: 2 });
    await saveRun(route.id, fastTrace, fastTrace[0].t, 'manual');

    const routesBefore = await db.routes.toArray();
    const runsBefore = await db.runs.toArray();
    expect(routesBefore.length).toBe(1);
    expect(runsBefore.length).toBe(2);

    const blob = await exportAll();
    const payload = await blobToJson(blob);
    expect((payload as { version: number }).version).toBe(EXPORT_VERSION);

    await db.routes.clear();
    await db.runs.clear();
    expect(await db.routes.count()).toBe(0);
    expect(await db.runs.count()).toBe(0);

    const result = await importAll(payload);
    expect(result).toEqual({ routesAdded: 1, runsAdded: 2, skipped: 0 });

    const routesAfter = await db.routes.toArray();
    const runsAfter = await db.runs.toArray();
    expect(routesAfter).toEqual(routesBefore);
    expect(runsAfter.length).toBe(runsBefore.length);
    expect(new Set(runsAfter.map((r) => r.id))).toEqual(
      new Set(runsBefore.map((r) => r.id))
    );

    const restoredRoute = await db.routes.get(route.id);
    expect(restoredRoute?.bestRunId).toBe(routesBefore[0].bestRunId);
  });

  it('merge-by-id: importing the same backup again skips every record', async () => {
    const polyline = straightPolyline(20);
    const seedTrace = makeTrace(polyline, { speedMs: 10, seed: 5 });
    await createRouteFromSeed('Loop', seedTrace);

    const blob = await exportAll();
    const payload = await blobToJson(blob);

    const result = await importAll(payload);
    expect(result.routesAdded).toBe(0);
    expect(result.runsAdded).toBe(0);
    expect(result.skipped).toBe(2); // 1 route + 1 seed run, all pre-existing
  });

  it('merges a backup containing one new route without touching existing data', async () => {
    const polylineA = straightPolyline(20);
    await createRouteFromSeed('Existing Route', makeTrace(polylineA, { seed: 6 }));

    const polylineB = straightPolyline(15);
    const otherTrace = makeTrace(polylineB, { seed: 7 });
    const otherRoute = await createRouteFromSeed('Other Route', otherTrace);
    const otherRuns = await db.runs.where('routeId').equals(otherRoute.id).toArray();

    // Build a payload containing ONLY "Other Route" (as if it were a backup
    // captured from another device, exported before "Existing Route" ever
    // existed there) — exportAll() itself always dumps the whole local DB,
    // so we construct this one by hand to exercise "import brings in a
    // route the current DB doesn't have yet" without touching the existing
    // route's data.
    const otherPayload = {
      version: 1 as const,
      exportedAt: Date.now(),
      routes: [otherRoute],
      runs: otherRuns
    };

    // Simulate importing a backup from another device containing ONLY
    // "Other Route": delete it locally first, then re-import from the
    // captured payload.
    await db.runs.where('routeId').equals(otherRoute.id).delete();
    await db.routes.delete(otherRoute.id);
    expect(await db.routes.count()).toBe(1);

    const result = await importAll(otherPayload);
    expect(result.routesAdded).toBe(1);
    expect(result.runsAdded).toBe(1);
    expect(result.skipped).toBe(0);
    expect(await db.routes.count()).toBe(2);
  });

  it('rejects malformed input with a clear error and writes nothing', async () => {
    await expect(importAll(null)).rejects.toThrow(/expected a JSON object/i);
    await expect(importAll({})).rejects.toThrow(/version/i);
    await expect(importAll({ version: 1, routes: 'nope', runs: [] })).rejects.toThrow(
      /arrays/i
    );
    await expect(
      importAll({ version: 1, routes: [{ id: 'x' }], runs: [] })
    ).rejects.toThrow(/route record/i);
    await expect(
      importAll({ version: 1, routes: [], runs: [{ id: 'x' }] })
    ).rejects.toThrow(/run record/i);

    expect(await db.routes.count()).toBe(0);
    expect(await db.runs.count()).toBe(0);
  });
});
