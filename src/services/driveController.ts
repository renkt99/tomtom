import { signal, type Signal } from '@preact/signals';
import { acceptFix } from '../core/filter';
import { computeDeltaMs, createEmaSmoother } from '../core/delta';
import { haversineM } from '../core/geo';
import { ghostPositionAt } from '../core/ghost';
import { matchAdvanceBudgetM, matchProgress, type ProgressHint } from '../core/progress';
import { createAutoStopDetector, type AutoStopOpts } from '../core/autostop';
import type { LatLon, RawFix, Route, TracePoint } from '../core/types';
import type { PositionSource } from './positionSource';

export type DriveState = 'idle' | 'acquiring' | 'recording' | 'finished' | 'error';

export interface DriveStopResult {
  rawFixes: RawFix[];
  startedAt: number;
}

export interface DriveController {
  state: Signal<DriveState>;
  elapsedMs: Signal<number>;
  /** Epoch ms of the first accepted fix that transitioned into 'recording'. */
  startedAtMs: Signal<number | null>;
  distM: Signal<number>;
  lastFix: Signal<RawFix | null>;
  /** Only meaningful in route mode (route !== null). */
  offRoute: Signal<boolean>;
  /** Numeric off-route distance, meters (route mode only; 0 in seed mode). */
  offRouteM: Signal<number>;
  errorMessage: Signal<string | null>;
  /** Null when bestTrace is null, or before recording starts. */
  deltaMs: Signal<number | null>;
  /** Delta before EMA smoothing — for the debug panel. */
  rawDeltaMs: Signal<number | null>;
  /** Null when bestTrace is null, or before recording starts. */
  ghostPos: Signal<LatLon | null>;
  /** Count of fixes accepted into the trace (debug panel). */
  acceptedCount: Signal<number>;
  /** Count of fixes rejected by acceptFix (debug panel). */
  rejectedCount: Signal<number>;
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
  stop(): DriveStopResult;
}

export interface DriveControllerOpts {
  /**
   * Multiplier applied to wall-clock elapsed time between fixes. Leave at
   * 1 for real drives. For simulated playback at N× (where the source
   * emits synthesized timestamps with original intervals on a compressed
   * wall schedule), pass N so the ticker's display/ghost updates advance
   * in drive-time between fix arrivals.
   */
  timeScale?: number;
  /**
   * True for replay drives (route mode, playing back a stored run):
   * auto-stop is disabled — a replay always runs to the end of its fixed
   * fixture rather than detecting arrival.
   */
  replay?: boolean;
  /** Override the default auto-stop thresholds (route mode, non-replay only). */
  autoStopOpts?: AutoStopOpts;
  /**
   * Called when auto-stop fires (route mode, non-replay, while recording):
   * the controller has already set state to 'finished' and stopped the
   * source by the time this is called. Receives the same shape as stop().
   */
  onAutoStop?(result: DriveStopResult): void;
}

/**
 * Factory for the recording state machine driving a run. `route === null`
 * means seed mode: no corridor matching, `d` is plain cumulative distance.
 */
export function createDriveController(
  source: PositionSource,
  route: Route | null,
  bestTrace: TracePoint[] | null = null,
  opts: DriveControllerOpts = {}
): DriveController {
  const timeScale = opts.timeScale ?? 1;
  const state = signal<DriveState>('idle');
  const elapsedMs = signal(0);
  const startedAtMs = signal<number | null>(null);
  const distM = signal(0);
  const lastFix = signal<RawFix | null>(null);
  const offRoute = signal(false);
  const offRouteM = signal(0);
  const errorMessage = signal<string | null>(null);
  const deltaMs = signal<number | null>(null);
  const rawDeltaMs = signal<number | null>(null);
  const ghostPos = signal<LatLon | null>(null);
  const acceptedCount = signal(0);
  const rejectedCount = signal(0);

  const trace: TracePoint[] = [];
  const rawFixes: RawFix[] = [];

  let prevAcceptedRawFix: RawFix | null = null;
  let startedAt = 0;
  let hint: ProgressHint = { segIdx: 0, distAlongM: 0, offRouteM: 0 };
  let seedCumDistM = 0;
  let prevSeedFix: RawFix | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  const deltaSmoother = createEmaSmoother(0.3);

  const autoStop =
    route && !opts.replay ? createAutoStopDetector(route, opts.autoStopOpts) : null;

  function stopInternal(): DriveStopResult {
    source.stop();
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    state.value = 'finished';
    return { rawFixes, startedAt };
  }

  function onFix(fix: RawFix): void {
    if (!acceptFix(prevAcceptedRawFix, fix)) {
      rejectedCount.value++;
      return;
    }
    acceptedCount.value++;
    const dtMs = prevAcceptedRawFix ? fix.t - prevAcceptedRawFix.t : 0;
    prevAcceptedRawFix = fix;

    if (state.value === 'acquiring') {
      startedAt = fix.t;
      startedAtMs.value = fix.t;
      state.value = 'recording';
      intervalId = setInterval(() => {
        const elapsed = (Date.now() - startedAt) * timeScale;
        elapsedMs.value = elapsed;
        if (bestTrace) {
          ghostPos.value = ghostPositionAt(bestTrace, elapsed);
        }
      }, 1000);
    }

    let d: number;
    if (route) {
      hint = matchProgress(
        { lat: fix.lat, lon: fix.lon },
        route,
        hint,
        matchAdvanceBudgetM(dtMs)
      );
      d = hint.distAlongM;
      offRouteM.value = hint.offRouteM;
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

    // Fix timestamps are authoritative drive-time (real epoch for live GPS,
    // synthesized original-interval epoch for simulated playback) — use them
    // for delta/ghost/display rather than the wall clock.
    const elapsed = fix.t - startedAt;
    elapsedMs.value = elapsed;
    if (bestTrace) {
      const raw = computeDeltaMs(elapsed, d, bestTrace);
      rawDeltaMs.value = raw;
      deltaMs.value = deltaSmoother.next(raw);
      ghostPos.value = ghostPositionAt(bestTrace, elapsed);
    }

    if (autoStop && state.value === 'recording' && autoStop.next(fix, d)) {
      const result = stopInternal();
      opts.onAutoStop?.(result);
    }
  }

  function onError(msg: string): void {
    state.value = 'error';
    errorMessage.value = msg;
  }

  function start(): void {
    state.value = 'acquiring';
    source.start(onFix, onError);
  }

  function stop(): DriveStopResult {
    return stopInternal();
  }

  return {
    state,
    elapsedMs,
    startedAtMs,
    distM,
    lastFix,
    offRoute,
    offRouteM,
    errorMessage,
    deltaMs,
    rawDeltaMs,
    ghostPos,
    acceptedCount,
    rejectedCount,
    trace,
    start,
    stop
  };
}
