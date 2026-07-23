import { signal, type Signal } from '@preact/signals';
import { acceptFix } from '../core/filter';
import { haversineM } from '../core/geo';
import { matchProgress, type ProgressHint } from '../core/progress';
import type { RawFix, Route, TracePoint } from '../core/types';
import type { PositionSource } from './positionSource';

export type DriveState = 'idle' | 'acquiring' | 'recording' | 'finished' | 'error';

export interface DriveController {
  state: Signal<DriveState>;
  elapsedMs: Signal<number>;
  distM: Signal<number>;
  lastFix: Signal<RawFix | null>;
  /** Only meaningful in route mode (route !== null). */
  offRoute: Signal<boolean>;
  errorMessage: Signal<string | null>;
  /**
   * Plain (non-signal) array of accumulated trace points, mutated in place
   * as fixes are accepted. Not reactive on its own — pair reads of it with
   * one of the signals above (e.g. distM/lastFix) to know when to re-render.
   */
  trace: TracePoint[];
  start(): void;
  /**
   * Returns the accepted fixes with their original epoch timestamps —
   * this is what the repo layer (createRouteFromSeed / saveRun) expects.
   * The relative-time TracePoints in `trace` are for live display only.
   */
  stop(): { rawFixes: RawFix[]; startedAt: number };
}

/**
 * Factory for the recording state machine driving a run. `route === null`
 * means seed mode: no corridor matching, `d` is plain cumulative distance.
 */
export function createDriveController(
  source: PositionSource,
  route: Route | null
): DriveController {
  const state = signal<DriveState>('idle');
  const elapsedMs = signal(0);
  const distM = signal(0);
  const lastFix = signal<RawFix | null>(null);
  const offRoute = signal(false);
  const errorMessage = signal<string | null>(null);

  const trace: TracePoint[] = [];
  const rawFixes: RawFix[] = [];

  let prevAcceptedRawFix: RawFix | null = null;
  let startedAt = 0;
  let hint: ProgressHint = { segIdx: 0, distAlongM: 0, offRouteM: 0 };
  let seedCumDistM = 0;
  let prevSeedFix: RawFix | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  function onFix(fix: RawFix): void {
    if (!acceptFix(prevAcceptedRawFix, fix)) return;
    prevAcceptedRawFix = fix;

    if (state.value === 'acquiring') {
      startedAt = fix.t;
      state.value = 'recording';
      intervalId = setInterval(() => {
        elapsedMs.value = Date.now() - startedAt;
      }, 1000);
    }

    let d: number;
    if (route) {
      hint = matchProgress({ lat: fix.lat, lon: fix.lon }, route, hint);
      d = hint.distAlongM;
      offRoute.value = hint.offRouteM > route.corridorM;
    } else {
      if (prevSeedFix) {
        seedCumDistM += haversineM(prevSeedFix, fix);
      }
      d = seedCumDistM;
      prevSeedFix = fix;
    }

    rawFixes.push(fix);
    trace.push({
      t: fix.t - startedAt,
      lat: fix.lat,
      lon: fix.lon,
      acc: fix.acc,
      spd: fix.spd ?? 0,
      d
    });

    lastFix.value = fix;
    distM.value = d;
  }

  function onError(msg: string): void {
    state.value = 'error';
    errorMessage.value = msg;
  }

  function start(): void {
    state.value = 'acquiring';
    source.start(onFix, onError);
  }

  function stop(): { rawFixes: RawFix[]; startedAt: number } {
    source.stop();
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    state.value = 'finished';
    return { rawFixes, startedAt };
  }

  return {
    state,
    elapsedMs,
    distM,
    lastFix,
    offRoute,
    errorMessage,
    trace,
    start,
    stop
  };
}
