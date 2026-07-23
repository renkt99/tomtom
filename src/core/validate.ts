// Pure run validation. No DOM imports.

import { haversineM } from './geo';
import { matchProgress, type ProgressHint } from './progress';
import type { Route } from './types';

export interface ValidateResult {
  valid: boolean;
  coveragePct: number;
  reasons: string[];
}

interface MinimalTracePoint {
  lat: number;
  lon: number;
  t: number;
}

const MIN_COVERAGE_PCT = 90;
const MAX_ENDPOINT_DIST_M = 100;
const MAX_AVG_SPEED_MS = 40;
const MIN_FIX_COUNT = 20;

/**
 * Validate a completed trace against its route. Works for both RawFix[]
 * and TracePoint[] since only lat/lon/t are read.
 */
export function validateRun(
  trace: MinimalTracePoint[],
  route: Route
): ValidateResult {
  const reasons: string[] = [];

  let hint: ProgressHint = { segIdx: 0, distAlongM: 0, offRouteM: 0 };
  let maxInCorridorDistM = 0;

  for (const pt of trace) {
    hint = matchProgress({ lat: pt.lat, lon: pt.lon }, route, hint);
    if (hint.offRouteM <= route.corridorM) {
      maxInCorridorDistM = Math.max(maxInCorridorDistM, hint.distAlongM);
    }
  }

  let coveragePct =
    route.totalDistM > 0 ? (maxInCorridorDistM / route.totalDistM) * 100 : 0;
  coveragePct = Math.max(0, Math.min(100, coveragePct));

  if (coveragePct < MIN_COVERAGE_PCT) reasons.push('low-coverage');

  if (trace.length > 0 && route.polyline.length > 0) {
    const startDistM = haversineM(trace[0], route.polyline[0]);
    if (startDistM > MAX_ENDPOINT_DIST_M) reasons.push('start-off-route');

    const endDistM = haversineM(
      trace[trace.length - 1],
      route.polyline[route.polyline.length - 1]
    );
    if (endDistM > MAX_ENDPOINT_DIST_M) reasons.push('end-off-route');
  }

  if (trace.length >= 2) {
    let pathLenM = 0;
    for (let i = 1; i < trace.length; i++) {
      pathLenM += haversineM(trace[i - 1], trace[i]);
    }
    const durationS = (trace[trace.length - 1].t - trace[0].t) / 1000;
    if (durationS > 0) {
      const avgSpeedMs = pathLenM / durationS;
      if (avgSpeedMs > MAX_AVG_SPEED_MS) reasons.push('too-fast');
    }
  }

  if (trace.length < MIN_FIX_COUNT) reasons.push('too-few-fixes');

  return { valid: reasons.length === 0, coveragePct, reasons };
}
