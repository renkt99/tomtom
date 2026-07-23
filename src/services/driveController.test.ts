import { describe, expect, it, vi } from 'vitest';
import { createDriveController } from './driveController';
import { makeTrace } from '../core/testUtils';
import type { RawFix } from '../core/types';
import type { PositionSource } from './positionSource';

class StubPositionSource implements PositionSource {
  private cb: ((fix: RawFix) => void) | null = null;

  start(cb: (fix: RawFix) => void): void {
    this.cb = cb;
  }

  stop(): void {
    this.cb = null;
  }

  /** Test helper: manually feed a fix as if it came from the device. */
  push(fix: RawFix): void {
    this.cb?.(fix);
  }
}

describe('createDriveController', () => {
  it('goes idle -> acquiring -> recording, accumulates trace/distM, and stop() returns a non-empty trace', () => {
    vi.useFakeTimers();
    try {
      const polyline = [
        { lat: 40, lon: -74 },
        { lat: 40.001, lon: -74.001 }
      ];
      const fixes = makeTrace(polyline, { speedMs: 10, hz: 1, noiseM: 0 });

      const source = new StubPositionSource();
      const controller = createDriveController(source, null);

      expect(controller.state.value).toBe('idle');

      controller.start();
      expect(controller.state.value).toBe('acquiring');

      source.push(fixes[0]);
      expect(controller.state.value).toBe('recording');
      expect(controller.trace.length).toBe(1);

      for (let i = 1; i < fixes.length; i++) {
        source.push(fixes[i]);
      }

      expect(controller.trace.length).toBeGreaterThan(1);
      expect(controller.distM.value).toBeGreaterThan(0);
      expect(controller.lastFix.value).not.toBeNull();

      const result = controller.stop();
      expect(controller.state.value).toBe('finished');
      expect(result.rawFixes.length).toBe(controller.trace.length);
      expect(result.rawFixes.length).toBeGreaterThan(0);
      // Contract with the repo layer: stop() returns fixes with their
      // ORIGINAL epoch timestamps (not run-relative ones), so that
      // saveRun/createRouteFromSeed derive correct startedAt/dow/hour
      // and non-negative TracePoint.t values.
      expect(result.startedAt).toBe(fixes[0].t);
      expect(result.rawFixes[0].t).toBe(fixes[0].t);
      for (const f of result.rawFixes) {
        expect(f.t).toBeGreaterThanOrEqual(result.startedAt);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('goes to the error state and exposes the error message on source error', () => {
    const source: PositionSource = {
      start(_cb, onError) {
        onError('permission denied');
      },
      stop() {}
    };

    const controller = createDriveController(source, null);
    controller.start();

    expect(controller.state.value).toBe('error');
    expect(controller.errorMessage.value).toBe('permission denied');
  });
});
