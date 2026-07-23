// Live delta-vs-best-run timing. Pure, no DOM imports.

import { timeAtDistance } from './ghost';
import type { TracePoint } from './types';

/**
 * Time delta vs the best run, measured at equal progress (not equal time):
 * how much longer (positive) or shorter (negative) it took the current
 * drive to reach `distAlongM` compared to `bestTrace`. Positive = behind
 * best (slower), negative = ahead of best (faster).
 */
export function computeDeltaMs(
  elapsedMs: number,
  distAlongM: number,
  bestTrace: TracePoint[]
): number {
  return elapsedMs - timeAtDistance(bestTrace, distAlongM);
}

export interface EmaSmoother {
  next(v: number): number;
}

/**
 * Exponential moving average smoother. The first call to `next` returns `v`
 * unchanged (no prior value to blend with); subsequent calls blend
 * `alpha * v + (1 - alpha) * prev`.
 */
export function createEmaSmoother(alpha = 0.3): EmaSmoother {
  let prev: number | null = null;

  return {
    next(v: number): number {
      const out = prev === null ? v : alpha * v + (1 - alpha) * prev;
      prev = out;
      return out;
    }
  };
}
