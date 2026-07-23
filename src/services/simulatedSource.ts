import type { RawFix } from '../core/types';
import type { PositionSource } from './positionSource';

const EARTH_RADIUS_M = 6371000;
const DEFAULT_SEED = 1337;

/** mulberry32: small, fast, deterministic PRNG. Returns a fn producing [0,1). */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function random(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Perturb `pos` by up to `noiseM` meters in a random direction (seeded). */
function addNoise(
  lat: number,
  lon: number,
  noiseM: number,
  rand: () => number
): { lat: number; lon: number } {
  if (noiseM <= 0) return { lat, lon };

  const angle = rand() * 2 * Math.PI;
  const radius = rand() * noiseM;
  const dxM = Math.cos(angle) * radius;
  const dyM = Math.sin(angle) * radius;

  const latRad = (lat * Math.PI) / 180;
  const dLat = (dyM / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLon = (dxM / (EARTH_RADIUS_M * Math.cos(latRad))) * (180 / Math.PI);

  return { lat: lat + dLat, lon: lon + dLon };
}

export interface SimulatedSourceOpts {
  /** Playback speed multiplier: gaps between fixes are divided by this. */
  speedMult?: number;
  /** Max random position jitter, meters. 0 (default) disables noise. */
  noiseM?: number;
  /** Seed for the deterministic noise PRNG. */
  seed?: number;
  /** Called once all fixes have been delivered (not called if stop()ed first). */
  onDone?: () => void;
}

/**
 * A PositionSource that replays a fixed list of RawFix[] (e.g. a stored run
 * or a demo fixture) instead of reading navigator.geolocation.
 *
 * Timestamps are synthesized, not wall-clock: fix i is emitted with
 * `t = startWall + (original offset of fix i)`, i.e. the ORIGINAL, unscaled
 * inter-fix intervals — only the delivery schedule is compressed by
 * `speedMult`. This keeps everything downstream (filter's implied-speed
 * check, delta vs best, stored trace times, run durations) in real
 * drive-time regardless of playback speed; a 5× replay races the ghost
 * correctly instead of appearing 5× faster than it.
 */
export function createSimulatedSource(
  fixes: RawFix[],
  opts?: SimulatedSourceOpts
): PositionSource {
  const speedMult = opts?.speedMult ?? 5;
  const noiseM = opts?.noiseM ?? 0;
  const seed = opts?.seed ?? DEFAULT_SEED;
  const onDone = opts?.onDone;

  const rand = mulberry32(seed);
  let timers: ReturnType<typeof setTimeout>[] = [];

  return {
    start(cb: (fix: RawFix) => void): void {
      timers = [];
      if (fixes.length === 0) {
        onDone?.();
        return;
      }

      const startWall = Date.now();
      const baseT = fixes[0].t;
      const emit = (fix: RawFix, isLast: boolean): void => {
        const { lat, lon } = addNoise(fix.lat, fix.lon, noiseM, rand);
        cb({ ...fix, lat, lon, t: startWall + (fix.t - baseT) });
        if (isLast) onDone?.();
      };

      emit(fixes[0], fixes.length === 1);

      let cumulativeDelayMs = 0;
      for (let i = 1; i < fixes.length; i++) {
        const originalGapMs = fixes[i].t - fixes[i - 1].t;
        cumulativeDelayMs += originalGapMs / speedMult;
        const isLast = i === fixes.length - 1;
        const delay = cumulativeDelayMs;
        const timer = setTimeout(() => {
          emit(fixes[i], isLast);
        }, delay);
        timers.push(timer);
      }
    },

    stop(): void {
      for (const timer of timers) clearTimeout(timer);
      timers = [];
    }
  };
}
