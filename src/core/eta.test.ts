import { describe, expect, it } from 'vitest';
import { bucketOf, estimateEtaMs, weightedMedian, type RunSummary } from './eta';

const DAY_MS = 86_400_000;
const NOW = 1_700_000_000_000;

function run(overrides: Partial<RunSummary>): RunSummary {
  return {
    durationMs: 600_000,
    startedAt: NOW,
    dow: 1,
    hour: 8,
    ...overrides
  };
}

describe('bucketOf', () => {
  it('classifies weekday vs weekend', () => {
    expect(bucketOf(1, 8).dayType).toBe('weekday');
    expect(bucketOf(5, 8).dayType).toBe('weekday');
    expect(bucketOf(0, 8).dayType).toBe('weekend');
    expect(bucketOf(6, 8).dayType).toBe('weekend');
  });

  it('classifies hour bands at boundaries', () => {
    expect(bucketOf(1, 0).band).toBe('night');
    expect(bucketOf(1, 5).band).toBe('night');
    expect(bucketOf(1, 6).band).toBe('morning');
    expect(bucketOf(1, 9).band).toBe('morning');
    expect(bucketOf(1, 10).band).toBe('midday');
    expect(bucketOf(1, 14).band).toBe('midday');
    expect(bucketOf(1, 15).band).toBe('evening');
    expect(bucketOf(1, 18).band).toBe('evening');
    expect(bucketOf(1, 19).band).toBe('late');
    expect(bucketOf(1, 23).band).toBe('late');
  });
});

describe('weightedMedian', () => {
  it('odd count with equal weights returns the middle value', () => {
    expect(weightedMedian([1, 2, 3], [1, 1, 1])).toBe(2);
  });

  it('even count with equal weights straddles the middle two values', () => {
    // cumulative weight after values [1,2] is exactly W/2=2, so it straddles
    // with the next value (3): (2+3)/2 = 2.5.
    expect(weightedMedian([1, 2, 3, 4], [1, 1, 1, 1])).toBe(2.5);
  });

  it('heavily skewed weight pulls the median toward the heavy value', () => {
    // total weight 101, half=50.5; cumulative weight at value 1 (weight 100)
    // already exceeds 50.5, so the median is exactly 1.
    expect(weightedMedian([1, 100], [100, 1])).toBe(1);
  });

  it('single value returns itself regardless of weight', () => {
    expect(weightedMedian([42], [0.001])).toBe(42);
  });
});

describe('estimateEtaMs', () => {
  it('returns null when there are no runs', () => {
    expect(estimateEtaMs([], { dow: 1, hour: 8, nowMs: NOW })).toBeNull();
  });

  it('single run: basis route, n=1, etaMs equals that run duration', () => {
    const runs = [run({ durationMs: 555_000 })];
    const result = estimateEtaMs(runs, { dow: 1, hour: 8, nowMs: NOW });
    expect(result).not.toBeNull();
    expect(result!.basis).toBe('route');
    expect(result!.n).toBe(1);
    expect(result!.etaMs).toBe(555_000);
  });

  it('exact bucket match with enough runs blends bucket median with route median', () => {
    // All runs at the same age (startedAt === nowMs) so recency weights are
    // all exactly 1 and the arithmetic is exact.
    const bucketRuns = [
      run({ durationMs: 600_000, dow: 1, hour: 8 }),
      run({ durationMs: 600_000, dow: 1, hour: 8 }),
      run({ durationMs: 600_000, dow: 1, hour: 8 })
    ];
    const outsideRuns = [
      run({ durationMs: 1_200_000, dow: 1, hour: 20 }),
      run({ durationMs: 1_200_000, dow: 1, hour: 20 }),
      run({ durationMs: 1_200_000, dow: 1, hour: 20 })
    ];
    const runs = [...bucketRuns, ...outsideRuns];

    const result = estimateEtaMs(runs, { dow: 1, hour: 8, nowMs: NOW });
    expect(result).not.toBeNull();
    expect(result!.basis).toBe('bucket');
    expect(result!.n).toBe(3);

    // routeMedian over all 6 values [600k,600k,600k,1200k,1200k,1200k]
    // (equal weights): cumulative weight lands exactly on the boundary
    // after the 3rd value -> straddle -> (600k+1200k)/2 = 900k.
    // basisMedian over the 3 bucket runs (all equal) = 600k.
    // blend: (3*600k + 3*900k) / 6 = 750k.
    expect(result!.etaMs).toBeCloseTo(750_000, 6);
  });

  it('adjacent-band inclusion: exact bucket under threshold, adjacent band pushes to daytype basis', () => {
    const exactBucket = [
      run({ durationMs: 400_000, dow: 1, hour: 8 }), // morning, idx 1
      run({ durationMs: 400_000, dow: 2, hour: 9 }) // morning, idx 1
    ];
    const adjacentBand = [
      run({ durationMs: 500_000, dow: 3, hour: 11 }) // midday, idx 2 (adjacent to idx1)
    ];
    const runs = [...exactBucket, ...adjacentBand];

    const result = estimateEtaMs(runs, { dow: 1, hour: 8, nowMs: NOW });
    expect(result).not.toBeNull();
    expect(result!.basis).toBe('daytype');
    expect(result!.n).toBe(3);
  });

  it('weekend runs are fully excluded from a weekday query resolved at daytype-all-hours', () => {
    // Weekday runs all in the "late" band (idx 4) — far from the query's
    // "morning" band (idx 1), so they don't satisfy exact-bucket or
    // adjacent-band steps, only the daytype-all-hours step.
    const weekdayRuns = [
      run({ durationMs: 800_000, dow: 2, hour: 20 }),
      run({ durationMs: 800_000, dow: 3, hour: 21 }),
      run({ durationMs: 800_000, dow: 4, hour: 22 })
    ];
    // Weekend runs deliberately placed in the query's own exact bucket
    // (morning) to prove they don't leak into bucket/daytype matching for
    // a weekday query.
    const weekendRuns = [
      run({ durationMs: 100_000, dow: 6, hour: 8 }),
      run({ durationMs: 100_000, dow: 0, hour: 8 }),
      run({ durationMs: 100_000, dow: 6, hour: 9 }),
      run({ durationMs: 100_000, dow: 0, hour: 8 }),
      run({ durationMs: 100_000, dow: 6, hour: 9 })
    ];
    const runs = [...weekdayRuns, ...weekendRuns];

    const result = estimateEtaMs(runs, { dow: 1, hour: 8, nowMs: NOW });
    expect(result).not.toBeNull();
    expect(result!.basis).toBe('daytype');
    // n must be 3 (weekday runs only) -- proves the 5 weekend runs, despite
    // sitting in the exact query bucket, were excluded.
    expect(result!.n).toBe(3);

    // routeMedian over all 8 values (5x100k, 3x800k), equal weights:
    // sorted [100k,100k,100k,100k,100k,800k,800k,800k], total weight 8,
    // half=4, cumulative weight hits exactly 4 after the 4th value (100k)
    // -> straddle with the 5th value (100k) -> (100k+100k)/2 = 100k.
    // basisMedian over the 3 weekday runs (all equal) = 800k.
    // blend: (3*800k + 3*100k) / 6 = 450k.
    expect(result!.etaMs).toBeCloseTo(450_000, 6);
  });

  it('shrinkage: a minimal-size bucket (n=MIN_BUCKET) is pulled halfway toward the route median', () => {
    // MIN_BUCKET=3 and K=3 means the smallest n reachable for a non-route
    // basis (n=3) always yields an exact 50/50 blend: n/(n+K) = 3/6 = 0.5.
    // This demonstrates the shrinkage effect concretely: a small bucket that
    // differs a lot from the rest of the route is pulled substantially
    // toward the route-wide median rather than being taken at face value.
    const bucketRuns = [
      run({ durationMs: 2_000_000, dow: 1, hour: 8 }),
      run({ durationMs: 2_000_000, dow: 1, hour: 8 }),
      run({ durationMs: 2_000_000, dow: 1, hour: 8 })
    ];
    const otherRuns = [
      run({ durationMs: 200_000, dow: 1, hour: 20 }),
      run({ durationMs: 200_000, dow: 1, hour: 20 }),
      run({ durationMs: 200_000, dow: 1, hour: 20 }),
      run({ durationMs: 200_000, dow: 1, hour: 20 }),
      run({ durationMs: 200_000, dow: 1, hour: 20 }),
      run({ durationMs: 200_000, dow: 1, hour: 20 }),
      run({ durationMs: 200_000, dow: 1, hour: 20 })
    ];
    const runs = [...bucketRuns, ...otherRuns];

    const result = estimateEtaMs(runs, { dow: 1, hour: 8, nowMs: NOW });
    expect(result).not.toBeNull();
    expect(result!.basis).toBe('bucket');
    expect(result!.n).toBe(3);

    // routeMedian over 10 equal-weight values (3x2,000,000 + 7x200,000):
    // sorted ascending, the 200,000s occupy the first 7 slots; total weight
    // 10, half=5, cumulative weight reaches 5 partway through the 200,000
    // run of values (at index 4, i.e. the 5th value), which is > half only
    // once we hit index 4 (cum=5) -- 5 == half exactly -> straddle with the
    // 6th value, also 200,000 -> routeMedian = 200,000.
    // basisMedian (bucket) = 2,000,000.
    // blend: (3*2,000,000 + 3*200,000) / 6 = 1,100,000.
    expect(result!.etaMs).toBeCloseTo(1_100_000, 6);
    // Confirms real shrinkage: pulled far below the raw bucket median.
    expect(result!.etaMs).toBeLessThan(2_000_000);
    expect(result!.etaMs).toBeGreaterThan(200_000);
  });

  it('recency weighting: recent run dominates an old, larger majority', () => {
    const runs = [
      run({ durationMs: 1000, startedAt: NOW - 120 * DAY_MS, dow: 1, hour: 8 }),
      run({ durationMs: 1000, startedAt: NOW - 120 * DAY_MS, dow: 1, hour: 8 }),
      run({ durationMs: 500, startedAt: NOW - 1 * DAY_MS, dow: 1, hour: 8 })
    ];

    const result = estimateEtaMs(runs, { dow: 1, hour: 8, nowMs: NOW });
    expect(result).not.toBeNull();
    expect(result!.basis).toBe('bucket');
    expect(result!.n).toBe(3);

    // Unweighted median of [1000,1000,500] is 1000. The recent run's weight
    // (~0.5^(1/60) ≈ 0.9885) alone exceeds half the total weight
    // (0.9885 + 0.25 + 0.25 = 1.4885, half = 0.74425), so the weighted
    // median collapses to the recent value, 500 -- far below the naive
    // unweighted median.
    expect(result!.etaMs).toBeLessThan(1000);
    expect(result!.etaMs).toBeCloseTo(500, 6);
  });
});
