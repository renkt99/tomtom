// Map-matching: track progress along a route's polyline. No DOM imports.

import { projectOntoSegment } from './geo';
import type { LatLon, Route } from './types';

export interface ProgressHint {
  segIdx: number;
  distAlongM: number;
  offRouteM: number;
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
 */
export function matchProgress(
  pos: LatLon,
  route: Route,
  hint: ProgressHint
): ProgressHint {
  const segCount = route.polyline.length - 1;
  if (segCount < 1) {
    return { ...hint };
  }

  const loIdx = Math.max(0, hint.segIdx - 2);
  const hiIdx = Math.min(segCount - 1, hint.segIdx + 20);

  let bestIdx = loIdx;
  let bestOffsetM = Infinity;
  let bestTFrac = 0;

  for (let i = loIdx; i <= hiIdx; i++) {
    const { tFrac, offsetM } = projectOntoSegment(
      pos,
      route.polyline[i],
      route.polyline[i + 1]
    );
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
      bestTFrac = tFrac;
    }
  }

  const segStartDist = route.cumDistM[bestIdx];
  const segEndDist = route.cumDistM[bestIdx + 1];
  const candidateDistAlongM =
    segStartDist + bestTFrac * (segEndDist - segStartDist);

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
