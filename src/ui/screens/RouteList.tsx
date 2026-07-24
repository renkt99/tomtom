import { useEffect, useState } from 'preact/hooks';
import { listRoutesWithStats } from '../../data/repo';
import type { Route } from '../../core/types';
import type { EtaBasis } from '../../core/eta';
import { navigate } from '../router';
import { formatDurationMs, formatEtaMinutes } from '../format';
import { GearIcon } from '../components/icons';

interface StatsRow {
  route: Route;
  bestDurationMs: number | null;
  runCount: number;
  eta: { etaMs: number; basis: EtaBasis; n: number } | null;
}

export function RouteList() {
  const [rows, setRows] = useState<StatsRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listRoutesWithStats().then((r) => {
      if (!cancelled) setRows(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div class="screen">
      <div class="screen-header">
        <h1>TomTom</h1>
        <a class="link settings-link" href="#/settings" aria-label="Settings" title="Settings">
          <GearIcon />
        </a>
      </div>
      {rows === null ? (
        <p>Loading…</p>
      ) : rows.length === 0 ? (
        <p>No routes yet. Add one to start tracking drives.</p>
      ) : (
        <div class="route-list">
          {rows.map(({ route, bestDurationMs, runCount, eta }) => (
            <div class="route-card" key={route.id}>
              <div
                class="route-card-main"
                onClick={() => navigate(`#/route/${route.id}`)}
              >
                <div class="route-card-name">{route.name}</div>
                <div class="route-card-meta">
                  {bestDurationMs !== null
                    ? formatDurationMs(bestDurationMs)
                    : 'no valid runs'}
                  {' · '}
                  {runCount} run{runCount === 1 ? '' : 's'}
                  {eta !== null && (
                    <>
                      {' · '}
                      {formatEtaMinutes(eta.etaMs)}
                    </>
                  )}
                </div>
              </div>
              <button
                class="btn btn-secondary"
                onClick={() => navigate(`#/drive/${route.id}`)}
              >
                Drive
              </button>
            </div>
          ))}
        </div>
      )}
      <button class="btn btn-primary fab" onClick={() => navigate('#/new')}>
        ＋ New route
      </button>
    </div>
  );
}
