// Auto-stop detection: pure, no DOM imports. Detects "arrived and stopped
// near the route's end" so the drive controller can end the run without a
// manual tap. See services/driveController.ts for wiring (route mode only,
// never during replay).

import { haversineM } from './geo';
import type { RawFix, Route } from './types';

export interface AutoStopOpts {
  /** Distance from route.end within which we start considering "arrived", meters. */
  radiusM?: number;
  /** Speed below which the driver is considered stopped/crawling, m/s. */
  maxSpeedMs?: number;
  /** How long the near-end + slow condition must hold before firing, ms. */
  dwellMs?: number;
  /** Minimum fraction of route.totalDistM that must have been covered. */
  minCoverageFrac?: number;
}

export interface AutoStopDetector {
  /**
   * Feed the next accepted fix + its distance-along-route. Returns true the
   * moment the auto-stop condition fires (arrived near end, slow/stopped for
   * dwellMs, sufficient route coverage). Internally tracks dwell time, and
   * only arms once a fix has been seen outside the end radius — so a loop
   * route (start ≈ end) can't fire at the start of a run.
   */
  next(fix: RawFix, distAlongM: number): boolean;
}

const DEFAULT_RADIUS_M = 60;
const DEFAULT_MAX_SPEED_MS = 2.5;
const DEFAULT_DWELL_MS = 5000;
const DEFAULT_MIN_COVERAGE_FRAC = 0.8;

export function createAutoStopDetector(
  route: Route,
  opts: AutoStopOpts = {}
): AutoStopDetector {
  const radiusM = opts.radiusM ?? DEFAULT_RADIUS_M;
  const maxSpeedMs = opts.maxSpeedMs ?? DEFAULT_MAX_SPEED_MS;
  const dwellMs = opts.dwellMs ?? DEFAULT_DWELL_MS;
  const minCoverageFrac = opts.minCoverageFrac ?? DEFAULT_MIN_COVERAGE_FRAC;

  // On short routes a fixed radius covers a large fraction of the whole
  // route (e.g. a walked test block), so "near end" would be true well
  // before arrival and slow-moving runs get cut short with low coverage.
  // Scale the radius down to 5% of route length, floored at 15m for GPS
  // noise; long routes keep the configured radius.
  const effRadiusM = Math.min(radiusM, Math.max(0.05 * route.totalDistM, 15));

  const routeEnd = route.polyline[route.polyline.length - 1];

  let prevFix: RawFix | null = null;
  let dwellStartT: number | null = null;
  // Auto-stop only arms once the drive has been observed OUTSIDE the end
  // radius at least once. On loop routes the start is already "near end",
  // so without this the detector can fire seconds into a fresh run.
  let armed = false;

  function impliedSpeedMs(fix: RawFix): number {
    if (typeof fix.spd === 'number' && Number.isFinite(fix.spd)) {
      return fix.spd;
    }
    if (prevFix) {
      const dtS = (fix.t - prevFix.t) / 1000;
      if (dtS > 0) {
        return haversineM(prevFix, fix) / dtS;
      }
    }
    return 0;
  }

  return {
    next(fix: RawFix, distAlongM: number): boolean {
      const speedMs = impliedSpeedMs(fix);
      const nearEnd = routeEnd ? haversineM(fix, routeEnd) <= effRadiusM : false;
      const slow = speedMs < maxSpeedMs;
      const coverageOk =
        route.totalDistM > 0
          ? distAlongM >= minCoverageFrac * route.totalDistM
          : false;

      if (!nearEnd) armed = true;

      let fired = false;
      if (armed && nearEnd && slow && coverageOk) {
        if (dwellStartT === null) dwellStartT = fix.t;
        fired = fix.t - dwellStartT >= dwellMs;
      } else {
        dwellStartT = null;
      }

      prevFix = fix;
      return fired;
    }
  };
}
