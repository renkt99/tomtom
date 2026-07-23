// Map-matching: track progress along a route's polyline. No DOM imports.

import { projectOntoSegment } from './geo';
import type { LatLon, Route } from './types';

export interface ProgressHint {
  segIdx: number;
  distAlongM: number;
  offRouteM: number;
}

// Ceiling on plausible ground speed (same spirit as filter.ts's teleport
// rejection) plus a flat slack for GPS noise / starting slightly into the
// route. Together they bound how far distance-along-route may jump per fix.
const MAX_PLAUSIBLE_SPEED_MS = 70;
const MATCH_SLACK_M = 100;

/**
 * Max plausible forward jump in distance-along-route for a fix arriving
 * `dtMs` after the previous accepted fix (0 for the first fix of a run).
 * Callers doing sequential matching pass this as matchProgress's
 * `maxAdvanceM` so a fix can never advance progress further than the
 * vehicle could physically have travelled.
 */
export function matchAdvanceBudgetM(dtMs: number): number {
  return (Math.max(0, dtMs) / 1000) * MAX_PLAUSIBLE_SPEED_MS + MATCH_SLACK_M;
}

/**
 * Match `pos` against `route`, searching only a window of segments near the
 * last matched segment (`hint.segIdx`). This windowing is what lets
 * out-and-back / self-overlapping routes work correctly: without it, the
 * globally nearest segment could be the parallel opposite-direction leg,
 * which would make progress get stuck instead of advancing.
 *
 * distAlongM is monotonically clamped — it never goes backward. If the
 * best match is outside the route's corridor, progress does not advance,
 * but segIdx/offRouteM are still updated so callers have current info.
 *
 * `maxAdvanceM` (when given) excludes candidate matches that would advance
 * distAlongM by more than the vehicle could plausibly have travelled since
 * the previous fix (see matchAdvanceBudgetM). Without it, the first fix of
 * a loop route (start ≈ end) ties against the final segment and — because
 * ties prefer later segments — teleports progress to ~100%, which the
 * monotonic clamp then locks in.
 */
export function matchProgress(
  pos: LatLon,
  route: Route,
  hint: ProgressHint,
  maxAdvanceM?: number
): ProgressHint {
  const segCount = route.polyline.length - 1;
  if (segCount < 1) {
    return { ...hint };
  }

  const loIdx = Math.max(0, hint.segIdx - 2);
  const hiIdx = Math.min(segCount - 1, hint.segIdx + 20);

  let bestIdx = -1;
  let bestOffsetM = Infinity;
  let bestDistAlongM = 0;

  for (let i = loIdx; i <= hiIdx; i++) {
    const { tFrac, offsetM } = projectOntoSegment(
      pos,
      route.polyline[i],
      route.polyline[i + 1]
    );
    const candDistAlongM =
      route.cumDistM[i] + tFrac * (route.cumDistM[i + 1] - route.cumDistM[i]);
    if (
      maxAdvanceM !== undefined &&
      candDistAlongM > hint.distAlongM + maxAdvanceM
    ) {
      continue;
    }
    // On ties, prefer the higher segment index: the polyline's own index
    // order tracks recording order (start -> end), so preferring later
    // segments keeps matching biased toward forward progress instead of
    // getting stuck re-picking an earlier segment that happens to be
    // exactly as close (this matters for out-and-back / self-overlapping
    // routes, where a point can sit exactly on both the outbound and
    // return segments).
    if (offsetM <= bestOffsetM) {
      bestOffsetM = offsetM;
      bestIdx = i;
      bestDistAlongM = candDistAlongM;
    }
  }

  if (bestIdx === -1) {
    // Every windowed segment was an implausibly large forward jump (only
    // possible with maxAdvanceM set). Keep the hint unchanged.
    return { ...hint };
  }

  const candidateDistAlongM = bestDistAlongM;

  if (bestOffsetM > route.corridorM) {
    return {
      segIdx: bestIdx,
      distAlongM: hint.distAlongM,
      offRouteM: bestOffsetM
    };
  }

  return {
    segIdx: bestIdx,
    distAlongM: Math.max(hint.distAlongM, candidateDistAlongM),
    offRouteM: bestOffsetM
  };
}
