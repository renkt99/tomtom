import { useEffect, useState } from 'preact/hooks';
import { createDriveController, type DriveController } from '../../services/driveController';
import { geolocationSource } from '../../services/geolocationSource';
import { createRouteFromSeed, getRoute, saveRun } from '../../data/repo';
import type { Route } from '../../core/types';
import { MapView } from '../map/MapView';
import { navigate } from '../router';
import { formatDurationMs } from '../format';
import { pendingRouteName } from './NewRoute';
import { newBestFlashRunId } from './RouteDetail';

export interface DriveScreenProps {
  /** null means seed mode (#/drive-new): no corridor matching, just record a new route. */
  routeId: string | null;
}

export function DriveScreen({ routeId }: DriveScreenProps) {
  // undefined = still loading, null = not found, Route = loaded. Always
  // null (not undefined) in seed mode since there's nothing to load.
  const [route, setRoute] = useState<Route | null | undefined>(
    routeId === null ? null : undefined
  );
  const [controller, setController] = useState<DriveController | null>(null);

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
    if (routeId !== null && (route === undefined || route === null)) return;
    if (controller) return;

    // Safe: the guard above ensures route is a real Route when routeId !== null.
    const routeForController = routeId === null ? null : (route as Route);
    const c = createDriveController(geolocationSource, routeForController);
    setController(c);
    c.start();
  }, [routeId, route, controller]);

  async function handleStop() {
    if (!controller) return;
    if (!confirm('Stop recording?')) return;

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

  return (
    <div class="drive-screen">
      <MapView routePolyline={route?.polyline} lastFix={lastFix} />
      <div class="drive-top-bar">
        <div class="drive-timer">{formatDurationMs(elapsedMs)}</div>
        <div class="drive-status">{statusText}</div>
        <button class="btn btn-danger btn-small" onClick={handleStop}>
          Stop
        </button>
      </div>
    </div>
  );
}
