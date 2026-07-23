// JSON export/import backup, merge-by-id. On-device storage is the only
// copy of this data (see plan risks: Safari IndexedDB eviction) — this is
// the real backup mechanism.

import { db } from './db';
import { recomputeBestRunId } from './repo';
import type { Route, Run } from '../core/types';

export const EXPORT_VERSION = 1 as const;

export interface ExportPayload {
  version: typeof EXPORT_VERSION;
  exportedAt: number;
  routes: Route[];
  runs: Run[];
}

export interface ImportResult {
  routesAdded: number;
  runsAdded: number;
  skipped: number;
}

export async function exportAll(): Promise<Blob> {
  const [routes, runs] = await Promise.all([
    db.routes.toArray(),
    db.runs.toArray()
  ]);

  const payload: ExportPayload = {
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    routes,
    runs
  };

  return new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json'
  });
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isValidRoute(v: unknown): v is Route {
  if (!isPlainObject(v)) return false;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    Array.isArray(v.polyline) &&
    Array.isArray(v.cumDistM) &&
    typeof v.totalDistM === 'number' &&
    typeof v.corridorM === 'number' &&
    (v.bestRunId === null || typeof v.bestRunId === 'string') &&
    typeof v.createdAt === 'number'
  );
}

function isValidRun(v: unknown): v is Run {
  if (!isPlainObject(v)) return false;
  return (
    typeof v.id === 'string' &&
    typeof v.routeId === 'string' &&
    typeof v.startedAt === 'number' &&
    typeof v.durationMs === 'number' &&
    typeof v.dow === 'number' &&
    typeof v.hour === 'number' &&
    Array.isArray(v.trace) &&
    typeof v.distanceM === 'number' &&
    typeof v.coveragePct === 'number' &&
    typeof v.valid === 'boolean' &&
    Array.isArray(v.reasons) &&
    (v.endedBy === 'manual' || v.endedBy === 'seed' || v.endedBy === 'auto')
  );
}

/**
 * Import a backup produced by exportAll(). Validates the top-level shape and
 * every record before writing anything; merges by id (records whose id
 * already exists locally are skipped, never overwritten); recomputes
 * bestRunId for every route that gained a run or was newly added.
 *
 * Throws a plain Error with a user-presentable message on malformed input —
 * nothing is written to the DB in that case.
 */
export async function importAll(json: unknown): Promise<ImportResult> {
  if (!isPlainObject(json)) {
    throw new Error('Invalid backup file: expected a JSON object.');
  }
  if (json.version !== EXPORT_VERSION) {
    throw new Error(
      `Invalid backup file: unsupported version "${String(json.version)}" (expected ${EXPORT_VERSION}).`
    );
  }
  if (!Array.isArray(json.routes) || !Array.isArray(json.runs)) {
    throw new Error('Invalid backup file: "routes" and "runs" must be arrays.');
  }

  const routes = json.routes as unknown[];
  const runs = json.runs as unknown[];

  for (const r of routes) {
    if (!isValidRoute(r)) {
      throw new Error('Invalid backup file: a route record is missing required fields.');
    }
  }
  for (const r of runs) {
    if (!isValidRun(r)) {
      throw new Error('Invalid backup file: a run record is missing required fields.');
    }
  }

  let routesAdded = 0;
  let runsAdded = 0;
  let skipped = 0;
  const affectedRouteIds = new Set<string>();

  for (const route of routes as Route[]) {
    const existing = await db.routes.get(route.id);
    if (existing) {
      skipped++;
      continue;
    }
    await db.routes.add(route);
    routesAdded++;
    affectedRouteIds.add(route.id);
  }

  for (const run of runs as Run[]) {
    const existing = await db.runs.get(run.id);
    if (existing) {
      skipped++;
      continue;
    }
    await db.runs.add(run);
    runsAdded++;
    affectedRouteIds.add(run.routeId);
  }

  for (const routeId of affectedRouteIds) {
    const route = await db.routes.get(routeId);
    if (!route) continue; // run referenced a route not present locally or in this import
    const bestRunId = await recomputeBestRunId(routeId);
    if (bestRunId !== route.bestRunId) {
      await db.routes.update(routeId, { bestRunId });
    }
  }

  return { routesAdded, runsAdded, skipped };
}
