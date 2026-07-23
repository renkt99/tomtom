import { describe, expect, it, vi } from 'vitest';
import { createSimulatedSource } from './simulatedSource';
import type { RawFix } from '../core/types';

function fix(t: number, lat = 40, lon = -74): RawFix {
  return { lat, lon, acc: 8, spd: 10, t };
}

describe('createSimulatedSource', () => {
  it('delivers all fixes in order', () => {
    vi.useFakeTimers();
    try {
      const fixes = [fix(0), fix(1000), fix(3000), fix(4000)];
      const source = createSimulatedSource(fixes, { speedMult: 1 });
      const received: RawFix[] = [];

      source.start((f) => received.push(f), () => {});
      vi.runAllTimers();

      expect(received.length).toBe(fixes.length);
    } finally {
      vi.useRealTimers();
    }
  });

  it('emits the first fix immediately, rebased to the current wall-clock time', () => {
    vi.useFakeTimers();
    try {
      const now = 1_700_000_000_000;
      vi.setSystemTime(now);

      const fixes = [fix(0), fix(1000)];
      const source = createSimulatedSource(fixes, { speedMult: 1 });
      const received: RawFix[] = [];

      source.start((f) => received.push(f), () => {});

      expect(received.length).toBe(1);
      expect(received[0].t).toBe(now);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retimes spacing by dividing the original gaps by speedMult', () => {
    vi.useFakeTimers();
    try {
      const now = 1_700_000_000_000;
      vi.setSystemTime(now);

      const fixes = [fix(0), fix(2000), fix(6000)];
      const source = createSimulatedSource(fixes, { speedMult: 2 });
      const received: RawFix[] = [];

      source.start((f) => received.push(f), () => {});
      expect(received.length).toBe(1);

      // Original gap 0->1 is 2000ms; at speedMult 2, DELIVERED after ~1000ms
      // of wall time, but stamped with the ORIGINAL unscaled offset (+2000)
      // so downstream drive-time math (delta vs ghost, durations, implied
      // speed) is independent of playback rate.
      vi.advanceTimersByTime(999);
      expect(received.length).toBe(1);
      vi.advanceTimersByTime(2);
      expect(received.length).toBe(2);
      expect(received[1].t).toBe(now + 2000);

      // Original gap 1->2 is 4000ms; at speedMult 2, expect ~2000ms more.
      vi.advanceTimersByTime(1998);
      expect(received.length).toBe(2);
      vi.advanceTimersByTime(2);
      expect(received.length).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stop() cancels remaining deliveries', () => {
    vi.useFakeTimers();
    try {
      const fixes = [fix(0), fix(1000), fix(2000), fix(3000)];
      const source = createSimulatedSource(fixes, { speedMult: 1 });
      const received: RawFix[] = [];

      source.start((f) => received.push(f), () => {});
      expect(received.length).toBe(1);

      vi.advanceTimersByTime(1000);
      expect(received.length).toBe(2);

      source.stop();
      vi.advanceTimersByTime(10_000);

      expect(received.length).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('calls onDone once all fixes have been delivered', () => {
    vi.useFakeTimers();
    try {
      const fixes = [fix(0), fix(1000)];
      const onDone = vi.fn();
      const source = createSimulatedSource(fixes, { speedMult: 1, onDone });

      source.start(() => {}, () => {});
      expect(onDone).not.toHaveBeenCalled();

      vi.runAllTimers();
      expect(onDone).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not call onDone if stopped before completion', () => {
    vi.useFakeTimers();
    try {
      const fixes = [fix(0), fix(1000), fix(2000)];
      const onDone = vi.fn();
      const source = createSimulatedSource(fixes, { speedMult: 1, onDone });

      source.start(() => {}, () => {});
      source.stop();
      vi.runAllTimers();

      expect(onDone).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('applies deterministic noise when noiseM > 0 (reproducible given the same seed)', () => {
    vi.useFakeTimers();
    try {
      const fixes = [fix(0), fix(1000)];
      const runOnce = (): RawFix[] => {
        const received: RawFix[] = [];
        const source = createSimulatedSource(fixes, { speedMult: 1, noiseM: 5, seed: 99 });
        source.start((f) => received.push(f), () => {});
        vi.runAllTimers();
        return received;
      };

      const a = runOnce();
      const b = runOnce();

      expect(a[0].lat).toBe(b[0].lat);
      expect(a[0].lon).toBe(b[0].lon);
      expect(a[1].lat).toBe(b[1].lat);
      // Noise should actually move the point (extremely unlikely to be exactly 0 offset).
      expect(a[0].lat === fixes[0].lat && a[0].lon === fixes[0].lon).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
