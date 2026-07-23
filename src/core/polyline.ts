// Pure polyline utilities: simplification, cumulative distance, trimming.
// No DOM imports.

import { haversineM, projectOntoSegment } from './geo';
import type { LatLon, RawFix } from './types';

/**
 * Douglas-Peucker simplification using perpendicular distance in meters
 * (via a local-meters projection, not raw lat/lon degrees). Always keeps
 * the first and last point.
 */
export function simplifyM(points: LatLon[], epsilonM = 10): LatLon[] {
  if (points.length <= 2) return points.slice();

  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  simplifyRange(points, 0, points.length - 1, epsilonM, keep);

  return points.filter((_, i) => keep[i]);
}

function simplifyRange(
  points: LatLon[],
  first: number,
  last: number,
  epsilonM: number,
  keep: boolean[]
): void {
  if (last <= first + 1) return;

  const a = points[first];
  const b = points[last];

  let maxDist = -1;
  let maxIdx = -1;

  for (let i = first + 1; i < last; i++) {
    const { offsetM } = projectOntoSegment(points[i], a, b);
    if (offsetM > maxDist) {
      maxDist = offsetM;
      maxIdx = i;
    }
  }

  if (maxDist > epsilonM) {
    keep[maxIdx] = true;
    simplifyRange(points, first, maxIdx, epsilonM, keep);
    simplifyRange(points, maxIdx, last, epsilonM, keep);
  }
}

/** Cumulative haversine distance along a polyline. cumDistM[0] === 0. */
export function buildCumDist(polyline: LatLon[]): {
  cumDistM: number[];
  totalDistM: number;
} {
  const cumDistM: number[] = polyline.length > 0 ? [0] : [];

  for (let i = 1; i < polyline.length; i++) {
    cumDistM.push(cumDistM[i - 1] + haversineM(polyline[i - 1], polyline[i]));
  }

  const totalDistM = cumDistM.length > 0 ? cumDistM[cumDistM.length - 1] : 0;

  return { cumDistM, totalDistM };
}

export interface TrimEndsConfig {
  radiusM?: number;
  minSpeedMs?: number;
}

/**
 * Drop leading/trailing near-stationary fixes (GPS jitter before/after
 * actual driving) so the trace starts/ends once real movement begins/ends.
 * Never drops below 2 points.
 */
export function trimEnds(trace: RawFix[], cfg?: TrimEndsConfig): RawFix[] {
  const radiusM = cfg?.radiusM ?? 15;
  const minSpeedMs = cfg?.minSpeedMs ?? 1;

  if (trace.length <= 2) return trace.slice();

  const speedOf = (fx: RawFix): number =>
    Number.isFinite(fx.spd) ? (fx.spd as number) : 0;

  let firstMovingIdx = trace.findIndex((fx) => speedOf(fx) >= minSpeedMs);
  if (firstMovingIdx === -1) firstMovingIdx = 0;

  let lastMovingIdx = -1;
  for (let i = trace.length - 1; i >= 0; i--) {
    if (speedOf(trace[i]) >= minSpeedMs) {
      lastMovingIdx = i;
      break;
    }
  }
  if (lastMovingIdx === -1) lastMovingIdx = trace.length - 1;

  const startAnchor = trace[firstMovingIdx];
  let startIdx = 0;
  while (
    startIdx < firstMovingIdx &&
    haversineM(trace[startIdx], startAnchor) <= radiusM
  ) {
    startIdx++;
  }

  const endAnchor = trace[lastMovingIdx];
  let endIdx = trace.length - 1;
  while (
    endIdx > lastMovingIdx &&
    haversineM(trace[endIdx], endAnchor) <= radiusM
  ) {
    endIdx--;
  }

  // Floor: never drop below 2 points, even if the whole trace is slow.
  startIdx = Math.min(startIdx, trace.length - 2);
  endIdx = Math.max(endIdx, 1);
  if (startIdx > endIdx) {
    startIdx = 0;
    endIdx = trace.length - 1;
  }

  return trace.slice(startIdx, endIdx + 1);
}
