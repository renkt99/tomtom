// Ghost-car positioning + delta timing math. Pure, no DOM imports.

import type { LatLon, TracePoint } from './types';

/**
 * Where the ghost (best-run trace) was at `tMs` (ms relative to run start).
 * Binary search on `trace[].t` (monotonic non-decreasing by construction),
 * lerp lat/lon between the bracketing points. Clamps to the first/last point
 * for tMs outside the trace's time range.
 */
export function ghostPositionAt(trace: TracePoint[], tMs: number): LatLon {
  if (trace.length === 0) {
    throw new Error('ghostPositionAt: trace must be non-empty');
  }
  if (trace.length === 1 || tMs <= trace[0].t) {
    return { lat: trace[0].lat, lon: trace[0].lon };
  }
  const last = trace[trace.length - 1];
  if (tMs >= last.t) {
    return { lat: last.lat, lon: last.lon };
  }

  // Find the first index whose t is > tMs; the bracket is [idx-1, idx].
  let lo = 0;
  let hi = trace.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (trace[mid].t > tMs) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }

  const b = trace[lo];
  const a = trace[lo - 1];
  const span = b.t - a.t;
  const frac = span > 0 ? (tMs - a.t) / span : 0;

  return {
    lat: a.lat + frac * (b.lat - a.lat),
    lon: a.lon + frac * (b.lon - a.lon)
  };
}

/**
 * The ms (relative to run start) at which `trace` reached distance-along-
 * route `dM`. Binary search on `trace[].d` (monotonic non-decreasing by
 * construction), lerp `t` between the bracketing points. Clamps to
 * [first.t, last.t] for dM outside the trace's distance range.
 *
 * Plateau handling: when `d` has a flat run (car stopped, d constant across
 * several points), returns the EARLIEST t at that distance value (lower-bound
 * binary search) — waiting at a red light counts fully against the ghost, we
 * must not skip forward past the stop.
 */
export function timeAtDistance(trace: TracePoint[], dM: number): number {
  if (trace.length === 0) {
    throw new Error('timeAtDistance: trace must be non-empty');
  }
  if (trace.length === 1 || dM <= trace[0].d) {
    return trace[0].t;
  }
  const last = trace[trace.length - 1];
  if (dM >= last.d) {
    return last.t;
  }

  // Lower-bound search: find the first index whose d is >= dM. Because of
  // plateaus (equal d across several consecutive points), this naturally
  // lands on the EARLIEST point reaching that distance.
  let lo = 0;
  let hi = trace.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (trace[mid].d >= dM) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }

  const b = trace[lo];
  const a = trace[lo - 1];
  const span = b.d - a.d;
  const frac = span > 0 ? (dM - a.d) / span : 0;

  return a.t + frac * (b.t - a.t);
}
