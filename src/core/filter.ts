// Pure fix-acceptance filter. No DOM imports.

import { haversineM } from './geo';
import type { RawFix } from './types';

export interface AcceptFixConfig {
  maxAccM?: number;
  minMoveM?: number;
  maxSpeedMs?: number;
}

const DEFAULT_MAX_ACC_M = 35;
const DEFAULT_MIN_MOVE_M = 5;
const DEFAULT_MAX_SPEED_MS = 70;

/**
 * Decide whether `next` should be accepted into a run's trace, given the
 * previously *accepted* fix (or null if this would be the first).
 *
 * Order of checks: accuracy, then (if prev exists) timestamp monotonicity,
 * then movement threshold (jitter-while-stopped rejection), then implied
 * speed (teleport rejection).
 */
export function acceptFix(
  prev: RawFix | null,
  next: RawFix,
  cfg?: AcceptFixConfig
): boolean {
  const maxAccM = cfg?.maxAccM ?? DEFAULT_MAX_ACC_M;
  const minMoveM = cfg?.minMoveM ?? DEFAULT_MIN_MOVE_M;
  const maxSpeedMs = cfg?.maxSpeedMs ?? DEFAULT_MAX_SPEED_MS;

  if (next.acc > maxAccM) return false;

  if (prev === null) return true;

  if (next.t <= prev.t) return false;

  const distM = haversineM(prev, next);
  if (distM < minMoveM) return false;

  const dtS = (next.t - prev.t) / 1000;
  const impliedSpeedMs = distM / dtS;
  if (impliedSpeedMs > maxSpeedMs) return false;

  return true;
}
