import { useEffect, useRef, useState } from 'preact/hooks';
import { createDriveController, type DriveController } from '../../services/driveController';
import { geolocationSource } from '../../services/geolocationSource';
import { createSimulatedSource } from '../../services/simulatedSource';
import type { PositionSource } from '../../services/positionSource';
import {
  createRouteFromSeed,
  getEtaForRoute,
  getRoute,
  getRun,
  saveRun
} from '../../data/repo';
import type { RawFix, Route, TracePoint } from '../../core/types';
import type { EtaBasis } from '../../core/eta';
import { MapView } from '../map/MapView';
import { navigate } from '../router';
import { simConfig } from '../sim';
import {
  formatClockTime,
  formatDeltaMs,
  formatDurationMs,
  formatEtaBasis
} from '../format';
import { pendingRouteName } from './NewRoute';
import { newBestFlashRunId } from './RouteDetail';

export interface DriveScreenProps {
  /** null means seed mode (#/drive-new): no corridor matching, just record a new route. */
  routeId: string | null;
  /** Non-null means "replay this stored run" instead of recording live GPS. Route mode only. */
  replayRunId: string | null;
}

export function DriveScreen({ routeId, replayRunId }: DriveScreenProps) {
  const isReplay = routeId !== null && replayRunId !== null;
  const isDemo = simConfig.demo && !isReplay;

  // undefined = still loading, null = not found, Route = loaded. Always
  // null (not undefined) in seed mode since there's nothing to load.
  const [route, setRoute] = useState<Route | null | undefined>(
    routeId === null ? null : undefined
  );
  const [controller, setController] = useState<DriveController | null>(null);
  const controllerRef = useRef<DriveController | null>(null);
  const [etaAtMount, setEtaAtMount] = useState<{
    etaMs: number;
    basis: EtaBasis;
    n: number;
  } | null>(null);

  // The best run's trace, loaded whenever the route has a bestRunId (used to
  // drive the live ghost car + delta chip). Null = no best trace applicable
  // (seed mode, or no valid runs yet). bestTraceReady gates controller
  // creation so we don't start a controller before we know its bestTrace.
  const [bestTrace, setBestTrace] = useState<TracePoint[] | null>(null);
  const [bestTraceReady, setBestTraceReady] = useState(false);

  // Fixes to drive a simulated source from, for demo/replay modes.
  const [simFixes, setSimFixes] = useState<RawFix[] | null>(null);
  const [simReady, setSimReady] = useState(!isDemo && !isReplay);

  useEffect(() => {
    if (routeId === null) return;
    let cancelled = false;
    getRoute(routeId).then((r) => {
      if (!cancelled) setRoute(r ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [routeId]);

  useEffect(() => {
    if (routeId === null || route == null) return;
    let cancelled = false;
    getEtaForRoute(routeId).then((eta) => {
      if (!cancelled) setEtaAtMount(eta);
    });
    return () => {
      cancelled = true;
    };
    // Mount-time snapshot only: fetch once when the route becomes available,
    // not on every render.
  }, [routeId, route != null]);

  // Load bestTrace whenever the route is available and has a bestRunId.
  // Always attempted (even during a replay of the best run itself) — keep it
  // simple, still race it.
  useEffect(() => {
    if (routeId === null) {
      setBestTraceReady(true);
      return;
    }
    if (route === undefined) return; // still loading the route
    if (route === null || !route.bestRunId) {
      setBestTraceReady(true);
      return;
    }

    let cancelled = false;
    getRun(route.bestRunId).then((run) => {
      if (cancelled) return;
      setBestTrace(run?.trace ?? null);
      setBestTraceReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [routeId, route]);

  // Load the fixes to drive a simulated source from, for demo/replay modes.
  useEffect(() => {
    if (!isDemo && !isReplay) return;
    let cancelled = false;

    async function load() {
      if (isReplay && replayRunId !== null) {
        const run = await getRun(replayRunId);
        if (cancelled) return;
        const rawFixes: RawFix[] = run
          ? run.trace.map((p) => ({
              lat: p.lat,
              lon: p.lon,
              acc: p.acc,
              spd: p.spd,
              t: run.startedAt + p.t
            }))
          : [];
        setSimFixes(rawFixes);
        setSimReady(true);
      } else if (isDemo) {
        const res = await fetch(`${import.meta.env.BASE_URL}fixtures/demo-drive.json`);
        const fixes: RawFix[] = await res.json();
        if (cancelled) return;
        setSimFixes(fixes);
        setSimReady(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [isDemo, isReplay, replayRunId]);

  useEffect(() => {
    if (routeId !== null && (route === undefined || route === null)) return;
    if (!bestTraceReady) return;
    if ((isDemo || isReplay) && !simReady) return;
    if (controller) return;

    // Safe: the guard above ensures route is a real Route when routeId !== null.
    const routeForController = routeId === null ? null : (route as Route);

    let source: PositionSource;
    if (isReplay) {
      source = createSimulatedSource(simFixes ?? [], {
        speedMult: simConfig.speedMult,
        onDone: finishReplayDrive
      });
    } else if (isDemo) {
      source = createSimulatedSource(simFixes ?? [], {
        speedMult: simConfig.speedMult,
        noiseM: simConfig.noiseM
      });
    } else {
      source = geolocationSource;
    }

    const c = createDriveController(source, routeForController, bestTrace, {
      timeScale: isDemo || isReplay ? simConfig.speedMult : 1
    });
    controllerRef.current = c;
    setController(c);
    c.start();
  }, [routeId, route, controller, bestTraceReady, isDemo, isReplay, simReady, simFixes, bestTrace]);

  /**
   * Replay drives never persist: stop the controller, surface the final
   * delta vs best, and navigate back without saving. Used both for the Stop
   * button (in replay mode) and for natural trace exhaustion (the simulated
   * source running out of fixes).
   */
  function finishReplayDrive(): void {
    const c = controllerRef.current;
    if (!c) return;
    const finalDeltaMs = c.deltaMs.value;
    c.stop();

    if (finalDeltaMs !== null) {
      alert(`Finished ${formatDeltaMs(finalDeltaMs)} vs best`);
    } else {
      alert('Replay finished.');
    }
    navigate(`#/route/${routeId}`);
  }

  async function handleStop() {
    if (!controller) return;
    if (!confirm('Stop recording?')) return;

    if (isReplay) {
      finishReplayDrive();
      return;
    }

    const { rawFixes, startedAt } = controller.stop();

    if (rawFixes.length < 2) {
      alert('No GPS data was recorded — nothing to save.');
      navigate(routeId === null ? '#/' : `#/route/${routeId}`);
      return;
    }

    if (routeId === null) {
      const name = pendingRouteName.value || 'New route';
      const newRoute = await createRouteFromSeed(name, rawFixes);
      navigate(`#/route/${newRoute.id}`);
    } else {
      const { run, isNewBest } = await saveRun(routeId, rawFixes, startedAt, 'manual');
      if (isNewBest) {
        newBestFlashRunId.value = run.id;
      }
      navigate(`#/route/${routeId}`);
    }
  }

  if (routeId !== null && route === undefined) {
    return (
      <div class="screen">
        <p>Loading…</p>
      </div>
    );
  }

  if (routeId !== null && route === null) {
    return (
      <div class="screen">
        <p>Route not found.</p>
      </div>
    );
  }

  const state = controller?.state.value ?? 'acquiring';
  const elapsedMs = controller?.elapsedMs.value ?? 0;
  const offRoute = controller?.offRoute.value ?? false;
  const errorMessage = controller?.errorMessage.value ?? null;
  const lastFix = controller?.lastFix.value ?? null;
  const startedAtMs = controller?.startedAtMs.value ?? null;
  const ghostPos = controller?.ghostPos.value ?? null;
  const deltaMs = controller?.deltaMs.value ?? null;

  let statusText: string;
  if (state === 'error') {
    statusText = errorMessage ?? 'location error';
  } else if (state === 'acquiring') {
    statusText = 'waiting for GPS…';
  } else if (state === 'recording') {
    statusText = offRoute ? 'off route' : 'recording';
  } else {
    statusText = 'finished';
  }
  if (isReplay) statusText += ' (replay)';
  else if (isDemo) statusText += ' (demo)';

  const showEta = routeId !== null && etaAtMount !== null && startedAtMs !== null;
  const arrivalMs = showEta ? startedAtMs! + etaAtMount!.etaMs : null;

  let deltaClass = 'delta-neutral';
  if (deltaMs !== null) {
    if (deltaMs < 0) deltaClass = 'delta-ahead';
    else if (Math.abs(deltaMs) >= 1000) deltaClass = 'delta-behind';
  }

  return (
    <div class="drive-screen">
      <MapView routePolyline={route?.polyline} lastFix={lastFix} ghostPos={ghostPos} />
      <div class="drive-top-bar">
        <div class="drive-timer-col">
          <div class="drive-timer">{formatDurationMs(elapsedMs)}</div>
          {showEta && (
            <div class="drive-eta-basis">
              ETA {formatClockTime(arrivalMs!)} ·{' '}
              {formatEtaBasis(etaAtMount!.basis, etaAtMount!.n)}
            </div>
          )}
        </div>
        <div class="drive-status">{statusText}</div>
        <button class="btn btn-danger btn-small" onClick={handleStop}>
          Stop
        </button>
      </div>
      {deltaMs !== null && (
        <div class={`delta-chip ${deltaClass}`}>{formatDeltaMs(deltaMs)}</div>
      )}
    </div>
  );
}
