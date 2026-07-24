import { signal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import { deleteRoute, deleteRun, getRoute, getRuns, renameRoute } from '../../data/repo';
import type { Route, Run } from '../../core/types';
import { navigate } from '../router';
import { formatDateTime, formatDurationMs } from '../format';
import { ScreenHeader } from '../components/ScreenHeader';
import { WarningIcon } from '../components/icons';

/**
 * Transient in-memory flag: DriveScreen sets this to the just-saved run's id
 * right before navigating here when saveRun() reported isNewBest. Consumed
 * (and cleared) on mount, so it only flashes once.
 */
export const newBestFlashRunId = signal<string | null>(null);

export interface RouteDetailProps {
  id: string;
}

export function RouteDetail({ id }: RouteDetailProps) {
  const [route, setRoute] = useState<Route | null>(null);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [showNewBest, setShowNewBest] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  async function load() {
    const [r, rs] = await Promise.all([getRoute(id), getRuns(id)]);
    setRoute(r ?? null);
    setRuns(rs);
  }

  useEffect(() => {
    load();
    if (newBestFlashRunId.value) {
      setShowNewBest(true);
      newBestFlashRunId.value = null;
    }
  }, [id]);

  if (!route || !runs) {
    return (
      <div class="screen">
        <p>Loading…</p>
      </div>
    );
  }

  const currentRoute = route;
  const bestRun = runs.find((r) => r.id === currentRoute.bestRunId) ?? null;

  async function handleRename() {
    const next = prompt('Rename route', currentRoute.name);
    if (next && next.trim().length > 0) {
      await renameRoute(currentRoute.id, next.trim());
      load();
    }
  }

  async function handleDeleteRun(runId: string) {
    if (!confirm('Delete this run?')) return;
    await deleteRun(runId);
    load();
  }

  async function handleDeleteRoute() {
    if (!confirm('Delete this route and all its runs?')) return;
    await deleteRoute(currentRoute.id);
    navigate('#/');
  }

  return (
    <div class="screen">
      {showNewBest ? <div class="banner banner-success">New best!</div> : null}

      <ScreenHeader backHash="#/" title={currentRoute.name} onTitleClick={handleRename} />

      <div class="route-detail-meta">
        {bestRun
          ? `Best: ${formatDurationMs(bestRun.durationMs)} on ${formatDateTime(bestRun.startedAt)}`
          : 'No valid runs yet'}
      </div>

      <button class="btn btn-primary" onClick={() => navigate(`#/drive/${currentRoute.id}`)}>
        Drive
      </button>

      <h2>Runs</h2>
      {runs.length === 0 ? (
        <p>No runs yet.</p>
      ) : (
        <div class="run-list">
          {runs.map((run) => (
            <div class="run-item" key={run.id}>
              <div class="run-row">
                <div class="run-row-main">
                  <span>{formatDateTime(run.startedAt)}</span>
                  <span>{formatDurationMs(run.durationMs)}</span>
                  {!run.valid ? (
                    <button
                      class="icon-btn warning-icon"
                      aria-label="Run invalid — show reasons"
                      onClick={() =>
                        setExpandedRunId(expandedRunId === run.id ? null : run.id)
                      }
                    >
                      <WarningIcon />
                    </button>
                  ) : null}
                </div>
                <button
                  class="btn btn-secondary btn-small"
                  onClick={() => navigate(`#/drive/${currentRoute.id}?replay=${run.id}`)}
                >
                  Replay
                </button>
                <button class="btn btn-danger btn-small" onClick={() => handleDeleteRun(run.id)}>
                  Delete
                </button>
              </div>
              {expandedRunId === run.id && !run.valid ? (
                <div class="run-reasons">{run.reasons.join(', ')}</div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <button class="btn btn-danger" onClick={handleDeleteRoute}>
        Delete route
      </button>
    </div>
  );
}
