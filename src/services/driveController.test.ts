import { describe, expect, it, vi } from 'vitest';
import { createDriveController } from './driveController';
import { makeTrace } from '../core/testUtils';
import { buildCumDist } from '../core/polyline';
import type { RawFix, Route } from '../core/types';
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

  it('with a bestTrace, keeps deltaMs small and ghostPos non-null while replaying the same drive', () => {
    vi.useFakeTimers();
    try {
      const polyline = [
        { lat: 40, lon: -74 },
        { lat: 40.001, lon: -74.001 }
      ];
      const fixes = makeTrace(polyline, { speedMs: 10, hz: 1, noiseM: 0 });

      // First pass: drive it once (seed mode, no bestTrace) to get a trace.
      const firstSource = new StubPositionSource();
      const firstController = createDriveController(firstSource, null);
      firstController.start();
      for (const f of fixes) firstSource.push(f);
      firstController.stop();
      const bestTrace = firstController.trace;

      expect(bestTrace.length).toBeGreaterThan(0);

      // Second pass: same fixes, now with bestTrace wired in.
      const source = new StubPositionSource();
      const controller = createDriveController(source, null, bestTrace);

      expect(controller.deltaMs.value).toBeNull();
      expect(controller.ghostPos.value).toBeNull();

      controller.start();
      for (const f of fixes) source.push(f);

      expect(controller.deltaMs.value).not.toBeNull();
      expect(Math.abs(controller.deltaMs.value!)).toBeLessThan(1500);
      expect(controller.ghostPos.value).not.toBeNull();

      controller.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * A "stopped" fix near `center`: reports spd=0 (as a real device would once
 * it estimates you're stationary) but jitters position by ~8m alternating
 * direction each call, so consecutive fixes still clear acceptFix's 5m
 * movement-jitter threshold instead of being silently dropped as duplicates.
 */
function makeDwellFixSeq(center: { lat: number; lon: number }) {
  let i = 0;
  return (t: number): RawFix => {
    i++;
    const sign = i % 2 === 0 ? 1 : -1;
    return { lat: center.lat + sign * 0.00007, lon: center.lon, acc: 5, spd: 0, t };
  };
}

function makeRoute(): Route {
  const polyline = [
    { lat: 40, lon: -74 },
    { lat: 40.002, lon: -74.002 } // ~280 m
  ];
  const { cumDistM, totalDistM } = buildCumDist(polyline);
  return {
    id: 'r1',
    name: 'auto-stop test route',
    polyline,
    cumDistM,
    totalDistM,
    corridorM: 75,
    bestRunId: null,
    createdAt: 0
  };
}

describe('createDriveController auto-stop', () => {
  it('fires onAutoStop, sets state finished, and stops the source once dwelling at the end (route mode, non-replay)', () => {
    const route = makeRoute();
    const source = new StubPositionSource();
    const stopSpy = vi.spyOn(source, 'stop');

    let autoStopResult: { rawFixes: RawFix[]; startedAt: number } | null = null;
    const controller = createDriveController(source, route, null, {
      onAutoStop: (result) => {
        autoStopResult = result;
      }
    });

    controller.start();

    // Drive the whole route quickly.
    const driveFixes = makeTrace(route.polyline, { speedMs: 15, hz: 1, noiseM: 0 });
    for (const f of driveFixes) source.push(f);

    expect(controller.state.value).toBe('recording');
    expect(autoStopResult).toBeNull();

    // Now dwell at the route's end, stopped, for longer than the default
    // dwellMs (5000ms) — one fix per second.
    const end = route.polyline[route.polyline.length - 1];
    const lastT = driveFixes[driveFixes.length - 1].t;
    const dwellFix = makeDwellFixSeq(end);
    for (let i = 1; i <= 8; i++) {
      source.push(dwellFix(lastT + i * 1000));
      if (controller.state.value === 'finished') break;
    }

    expect(controller.state.value).toBe('finished');
    expect(stopSpy).toHaveBeenCalled();
    expect(autoStopResult).not.toBeNull();
    expect(autoStopResult!.rawFixes.length).toBeGreaterThan(0);
  });

  it('does not auto-stop during replay even when dwelling at the end', () => {
    const route = makeRoute();
    const source = new StubPositionSource();

    let autoStopCalled = false;
    const controller = createDriveController(source, route, null, {
      replay: true,
      onAutoStop: () => {
        autoStopCalled = true;
      }
    });

    controller.start();

    const driveFixes = makeTrace(route.polyline, { speedMs: 15, hz: 1, noiseM: 0 });
    for (const f of driveFixes) source.push(f);

    const end = route.polyline[route.polyline.length - 1];
    const lastT = driveFixes[driveFixes.length - 1].t;
    const dwellFix = makeDwellFixSeq(end);
    for (let i = 1; i <= 8; i++) {
      source.push(dwellFix(lastT + i * 1000));
    }

    expect(controller.state.value).toBe('recording');
    expect(autoStopCalled).toBe(false);
  });
});

const HEADING_BASE_T = 1700000000000;

function headingFix(overrides: Partial<RawFix>): RawFix {
  return { lat: 40, lon: -74, acc: 10, spd: 10, t: HEADING_BASE_T, ...overrides };
}

describe('createDriveController headingDeg/speedMs', () => {
  it('exposes the device-reported heading directly when fixes carry hdg', () => {
    vi.useFakeTimers();
    try {
      const source = new StubPositionSource();
      const controller = createDriveController(source, null);
      controller.start();

      source.push(headingFix({ hdg: 90 }));

      expect(controller.headingDeg.value).toBe(90);

      controller.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to a bearing-derived heading when fixes lack hdg but move', () => {
    vi.useFakeTimers();
    try {
      const source = new StubPositionSource();
      const controller = createDriveController(source, null);
      controller.start();

      // First fix: no prior fix to derive a bearing from, so heading stays null.
      source.push(headingFix({ lat: 40, lon: -74, t: HEADING_BASE_T, hdg: undefined }));
      expect(controller.headingDeg.value).toBeNull();

      // Second fix: due east of the first (~40m), no hdg -> bearing fallback ~90.
      source.push(
        headingFix({ lat: 40, lon: -73.9995, t: HEADING_BASE_T + 5000, hdg: undefined })
      );

      expect(controller.headingDeg.value).not.toBeNull();
      expect(controller.headingDeg.value!).toBeCloseTo(90, 0);

      controller.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('speedMs reflects fix.spd when present', () => {
    vi.useFakeTimers();
    try {
      const source = new StubPositionSource();
      const controller = createDriveController(source, null);
      controller.start();

      source.push(headingFix({ spd: 15 }));

      expect(controller.speedMs.value).toBe(15);

      controller.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('derives speedMs from consecutive fixes when spd is 0/undefined but the vehicle is moving', () => {
    vi.useFakeTimers();
    try {
      const source = new StubPositionSource();
      const controller = createDriveController(source, null);
      controller.start();

      source.push(headingFix({ lat: 40, lon: -74, t: HEADING_BASE_T, spd: 0 }));
      expect(controller.speedMs.value).toBe(0); // no prev fix yet to derive from

      // ~40m east, 5s later.
      source.push(
        headingFix({ lat: 40, lon: -73.9995, t: HEADING_BASE_T + 5000, spd: undefined })
      );

      expect(controller.speedMs.value).toBeGreaterThan(0);

      controller.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
