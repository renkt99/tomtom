// Heading (course-over-ground) tracking. Pure, no DOM imports.
import { bearingDeg } from './geo';
import type { RawFix } from './types';

/** Below this speed GPS course is noise: hold the previous heading. */
const MIN_SPEED_MS = 1;

/**
 * Next display heading given the previous heading, previous accepted fix,
 * and the newly accepted fix. Prefers the device-reported course, falls
 * back to the bearing from the previous fix, holds when (near) stationary.
 * Returns null until a heading basis first exists.
 */
export function nextHeadingDeg(
  prevHeadingDeg: number | null,
  prevFix: RawFix | null,
  fix: RawFix
): number | null {
  const moving = (fix.spd ?? 0) > MIN_SPEED_MS;
  if (!moving) return prevHeadingDeg;
  if (fix.hdg !== undefined) return fix.hdg;
  if (prevFix) return bearingDeg(prevFix, fix);
  return prevHeadingDeg;
}

/**
 * Signed shortest-arc delta (degrees, in [-180, 180)) to get from `fromDeg`
 * to `toDeg`. Used to accumulate rotations without ever spinning the long
 * way around (e.g. 359 -> 1 is +2, not -358).
 */
export function shortestArcDelta(fromDeg: number, toDeg: number): number {
  return ((toDeg - fromDeg) % 360 + 540) % 360 - 180;
}
