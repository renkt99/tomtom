import { db } from './db';
import { haversineM } from '../core/geo';
import { matchProgress, type ProgressHint } from '../core/progress';
import { buildCumDist, simplifyM, trimEnds } from '../core/polyline';
import { validateRun } from '../core/validate';
import { estimateEtaMs, type EtaEstimate, type RunSummary } from '../core/eta';
import type { LatLon, RawFix, Route, Run, TracePoint } from '../core/types';

const DEFAULT_CORRIDOR_M = 75;

/**
 * Build TracePoint[] from raw fixes. In route mode, `d` is distance-along-
 * route via matchProgress; in seed mode (route === null), `d` is simple
 * cumulative haversine distance.
 */
function toTracePoints(
  trace: RawFix[],
  startedAt: number,
  route: Route | null
): TracePoint[] {
  let hint: ProgressHint = { segIdx: 0, distAlongM: 0, offRouteM: 0 };
  let cumDistM = 0;
  let prevFix: RawFix | null = null;

  return trace.map((f) => {
    let d: number;
    if (route) {
      hint = matchProgress({ lat: f.lat, lon: f.lon }, route, hint);
      d = hint.distAlongM;
    } else {
      if (prevFix) {
        cumDistM += haversineM(prevFix, f);
      }
      d = cumDistM;
      prevFix = f;
    }

    return {
      t: f.t - startedAt,
      lat: f.lat,
      lon: f.lon,
      acc: f.acc,
      spd: f.spd ?? 0,
      d
    };
  });
}

function dowAndHour(startedAt: number): { dow: number; hour: number } {
  const d = new Date(startedAt);
  return { dow: d.getDay(), hour: d.getHours() };
}

async function recomputeBestRunId(routeId: string): Promise<string | null> {
  const runs = await db.runs.where('routeId').equals(routeId).toArray();
  const validRuns = runs.filter((r) => r.valid);
  if (validRuns.length === 0) return null;

  validRuns.sort((a, b) => a.durationMs - b.durationMs || a.startedAt - b.startedAt);
  return validRuns[0].id;
}

export async function createRouteFromSeed(
  name: string,
  trace: RawFix[]
): Promise<Route> {
  const trimmed = trimEnds(trace);
  if (trimmed.length < 2) {
    throw new Error('Not enough GPS data to create a route');
  }
  const latlons: LatLon[] = trimmed.map((f) => ({ lat: f.lat, lon: f.lon }));
  const simplified = simplifyM(latlons, 10);
  const { cumDistM, totalDistM } = buildCumDist(simplified);

  const route: Route = {
    id: crypto.randomUUID(),
    name,
    polyline: simplified,
    cumDistM,
    totalDistM,
    corridorM: DEFAULT_CORRIDOR_M,
    bestRunId: null,
    createdAt: Date.now()
  };

  await db.routes.add(route);

  const startedAt = trimmed[0].t;
  const tracePoints = toTracePoints(trimmed, startedAt, route);
  const durationMs = trimmed[trimmed.length - 1].t - trimmed[0].t;
  const { dow, hour } = dowAndHour(startedAt);
  const distanceM = tracePoints.length > 0 ? tracePoints[tracePoints.length - 1].d : 0;
  const validation = validateRun(tracePoints, route);

  const run: Run = {
    id: crypto.randomUUID(),
    routeId: route.id,
    startedAt,
    durationMs,
    dow,
    hour,
    trace: tracePoints,
    distanceM,
    coveragePct: validation.coveragePct,
    valid: validation.valid,
    reasons: validation.reasons,
    endedBy: 'seed'
  };

  await db.runs.add(run);

  if (run.valid) {
    route.bestRunId = run.id;
    await db.routes.update(route.id, { bestRunId: run.id });
  }

  return route;
}

export async function saveRun(
  routeId: string,
  trace: RawFix[],
  startedAt: number,
  endedBy: 'manual' | 'seed'
): Promise<{ run: Run; isNewBest: boolean }> {
  const route = await db.routes.get(routeId);
  if (!route) throw new Error(`Route not found: ${routeId}`);

  const tracePoints = toTracePoints(trace, startedAt, route);
  const durationMs =
    trace.length > 0 ? trace[trace.length - 1].t - trace[0].t : 0;
  const { dow, hour } = dowAndHour(startedAt);
  const distanceM = tracePoints.length > 0 ? tracePoints[tracePoints.length - 1].d : 0;
  const validation = validateRun(tracePoints, route);

  const run: Run = {
    id: crypto.randomUUID(),
    routeId,
    startedAt,
    durationMs,
    dow,
    hour,
    trace: tracePoints,
    distanceM,
    coveragePct: validation.coveragePct,
    valid: validation.valid,
    reasons: validation.reasons,
    endedBy
  };

  await db.runs.add(run);

  const prevBestRunId = route.bestRunId;
  const newBestRunId = await recomputeBestRunId(routeId);
  if (newBestRunId !== prevBestRunId) {
    await db.routes.update(routeId, { bestRunId: newBestRunId });
  }

  const isNewBest = newBestRunId === run.id && newBestRunId !== prevBestRunId;

  return { run, isNewBest };
}

export async function listRoutesWithStats(): Promise<
  Array<{
    route: Route;
    bestDurationMs: number | null;
    runCount: number;
    eta: EtaEstimate | null;
  }>
> {
  const routes = await db.routes.toArray();
  const result: Array<{
    route: Route;
    bestDurationMs: number | null;
    runCount: number;
    eta: EtaEstimate | null;
  }> = [];

  for (const route of routes) {
    const runs = await db.runs.where('routeId').equals(route.id).toArray();
    const runCount = runs.length;
    let bestDurationMs: number | null = null;

    if (route.bestRunId) {
      const bestRun = runs.find((r) => r.id === route.bestRunId);
      bestDurationMs = bestRun ? bestRun.durationMs : null;
    }

    const eta = await getEtaForRoute(route.id);

    result.push({ route, bestDurationMs, runCount, eta });
  }

  return result;
}

/**
 * Estimate the ETA for a route based on its historical valid runs. Returns
 * null if there are no valid runs at all. `at` defaults to the current
 * dow/hour/time; pass an override (e.g. for tests) to estimate for a
 * different moment.
 */
export async function getEtaForRoute(
  routeId: string,
  at?: { dow: number; hour: number; nowMs: number }
): Promise<EtaEstimate | null> {
  const runs = await db.runs.where('routeId').equals(routeId).toArray();
  const validRuns = runs.filter((r) => r.valid);

  const summaries: RunSummary[] = validRuns.map((r) => ({
    durationMs: r.durationMs,
    startedAt: r.startedAt,
    dow: r.dow,
    hour: r.hour
  }));

  const resolvedAt = at ?? { ...dowAndHour(Date.now()), nowMs: Date.now() };

  return estimateEtaMs(summaries, resolvedAt);
}

export async function getRoute(id: string): Promise<Route | undefined> {
  return db.routes.get(id);
}

export async function getRuns(routeId: string): Promise<Run[]> {
  const runs = await db.runs.where('routeId').equals(routeId).toArray();
  return runs.sort((a, b) => b.startedAt - a.startedAt);
}

export async function getRun(id: string): Promise<Run | undefined> {
  return db.runs.get(id);
}

export async function deleteRun(id: string): Promise<void> {
  const run = await db.runs.get(id);
  if (!run) return;

  await db.runs.delete(id);

  const newBestRunId = await recomputeBestRunId(run.routeId);
  await db.routes.update(run.routeId, { bestRunId: newBestRunId });
}

export async function deleteRoute(id: string): Promise<void> {
  await db.runs.where('routeId').equals(id).delete();
  await db.routes.delete(id);
}

export async function renameRoute(id: string, name: string): Promise<void> {
  await db.routes.update(id, { name });
}
