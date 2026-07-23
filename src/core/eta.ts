// Pure ETA estimation. No DOM imports, no imports outside src/core.

/** Minimal shape of a Run needed for ETA estimation. */
export interface RunSummary {
  durationMs: number;
  startedAt: number; // epoch ms
  dow: number; // 0=Sunday..6=Saturday, matches Run.dow
  hour: number; // 0-23, matches Run.hour
}

export type EtaBasis = 'bucket' | 'daytype' | 'route';

export interface EtaEstimate {
  etaMs: number;
  basis: EtaBasis;
  n: number;
}

/** Minimum number of runs required for a bucket/daytype match to be used. */
export const MIN_BUCKET = 3;
/** Shrinkage constant: weight given to the route-wide median in the blend. */
export const K = 3;

/** Half-open hour bands, in stable index order 0..4. */
const BANDS: Array<{ name: string; startHour: number; endHour: number }> = [
  { name: 'night', startHour: 0, endHour: 6 },
  { name: 'morning', startHour: 6, endHour: 10 },
  { name: 'midday', startHour: 10, endHour: 15 },
  { name: 'evening', startHour: 15, endHour: 19 },
  { name: 'late', startHour: 19, endHour: 24 }
];

function bandIndexOf(hour: number): number {
  for (let i = 0; i < BANDS.length; i++) {
    if (hour >= BANDS[i].startHour && hour < BANDS[i].endHour) return i;
  }
  // Fallback for out-of-range hours (shouldn't happen with valid 0-23 input).
  return BANDS.length - 1;
}

function dayTypeOf(dow: number): 'weekday' | 'weekend' {
  return dow === 0 || dow === 6 ? 'weekend' : 'weekday';
}

/** Compute the (dayType, band) bucket for a given dow/hour. */
export function bucketOf(
  dow: number,
  hour: number
): { dayType: 'weekday' | 'weekend'; band: string } {
  return { dayType: dayTypeOf(dow), band: BANDS[bandIndexOf(hour)].name };
}

/**
 * Weighted median of `values` using parallel `weights`. Ties in cumulative
 * weight landing exactly on the halfway point (within EPSILON) straddle
 * with the next value in sorted order.
 */
const EPSILON = 1e-9;

export function weightedMedian(values: number[], weights: number[]): number {
  if (values.length !== weights.length || values.length === 0) {
    throw new Error('weightedMedian: values and weights must be same non-zero length');
  }
  if (values.length === 1) return values[0];

  const pairs = values.map((v, i) => ({ v, w: weights[i] }));
  pairs.sort((a, b) => a.v - b.v);

  const totalWeight = pairs.reduce((sum, p) => sum + p.w, 0);
  const half = totalWeight / 2;

  let cum = 0;
  for (let i = 0; i < pairs.length; i++) {
    cum += pairs[i].w;
    if (Math.abs(cum - half) <= EPSILON) {
      // Exactly on the boundary: straddle with the next value.
      if (i + 1 < pairs.length) {
        return (pairs[i].v + pairs[i + 1].v) / 2;
      }
      return pairs[i].v;
    }
    if (cum > half) {
      return pairs[i].v;
    }
  }

  return pairs[pairs.length - 1].v;
}

/** Recency weight: exponential decay with a 60-day half-life. */
function recencyWeight(startedAt: number, nowMs: number): number {
  const ageDays = (nowMs - startedAt) / 86_400_000;
  return Math.pow(0.5, ageDays / 60);
}

function weightedMedianDuration(runs: RunSummary[], nowMs: number): number {
  const values = runs.map((r) => r.durationMs);
  const weights = runs.map((r) => recencyWeight(r.startedAt, nowMs));
  return weightedMedian(values, weights);
}

/**
 * Estimate ETA for a route given historical runs and the current dow/hour.
 * Returns null if there are no runs at all. Otherwise selects the most
 * specific bucket with enough data (ladder: exact bucket -> daytype+adjacent
 * bands -> daytype all hours -> route-wide fallback), blending the bucket
 * median with the route-wide median via shrinkage for basis !== 'route'.
 */
export function estimateEtaMs(
  runs: RunSummary[],
  at: { dow: number; hour: number; nowMs: number }
): EtaEstimate | null {
  if (runs.length === 0) return null;

  const routeMedian = weightedMedianDuration(runs, at.nowMs);
  const atDayType = dayTypeOf(at.dow);
  const atBandIdx = bandIndexOf(at.hour);

  function blend(subset: RunSummary[], basis: EtaBasis): EtaEstimate {
    const n = subset.length;
    const basisMedian = weightedMedianDuration(subset, at.nowMs);
    const etaMs = (n * basisMedian + K * routeMedian) / (n + K);
    return { etaMs, basis, n };
  }

  // 1. Exact bucket.
  const exactBucket = runs.filter(
    (r) => dayTypeOf(r.dow) === atDayType && bandIndexOf(r.hour) === atBandIdx
  );
  if (exactBucket.length >= MIN_BUCKET) return blend(exactBucket, 'bucket');

  // 2. Daytype + adjacent bands (clamped, no wraparound).
  const loBand = Math.max(0, atBandIdx - 1);
  const hiBand = Math.min(BANDS.length - 1, atBandIdx + 1);
  const adjacent = runs.filter((r) => {
    if (dayTypeOf(r.dow) !== atDayType) return false;
    const idx = bandIndexOf(r.hour);
    return idx >= loBand && idx <= hiBand;
  });
  if (adjacent.length >= MIN_BUCKET) return blend(adjacent, 'daytype');

  // 3. Daytype, any band.
  const sameDayType = runs.filter((r) => dayTypeOf(r.dow) === atDayType);
  if (sameDayType.length >= MIN_BUCKET) return blend(sameDayType, 'daytype');

  // 4. Route-wide fallback (unconditional, no blending).
  return { etaMs: routeMedian, basis: 'route', n: runs.length };
}
