import type { EtaBasis } from '../core/eta';

/** Format a duration in ms as mm:ss (or h:mm:ss for runs over an hour). */
export function formatDurationMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  const ss = String(seconds).padStart(2, '0');

  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Format an epoch ms timestamp as a short local date/time string. */
export function formatDateTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

/** Format an epoch ms timestamp as a short local clock time, e.g. "8:42". */
export function formatClockTime(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Describe the basis of an ETA estimate for display, e.g. "based on 5 similar runs". */
export function formatEtaBasis(basis: EtaBasis, n: number): string {
  if (basis === 'bucket') return `based on ${n} similar runs`;
  if (basis === 'daytype') return `based on ${n} same-day-type runs`;
  return `based on ${n} runs of this route`;
}

/** Format an ETA duration in ms as rounded minutes, e.g. "~19 min" or "<1 min". */
export function formatEtaMinutes(ms: number): string {
  if (ms < 60_000) return '<1 min';
  return `~${Math.round(ms / 60_000)} min`;
}
