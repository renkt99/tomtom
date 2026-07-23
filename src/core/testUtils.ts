// Synthetic trace generator for tests. Deterministic (seeded PRNG, no
// Math.random) so tests are reproducible. Lives in src/core because other
// test files (outside src/core) import it, but it has no DOM imports.

import { buildCumDist } from './polyline';
import type { LatLon, RawFix } from './types';

const EARTH_RADIUS_M = 6371000;

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

function positionAtDistance(
  polyline: LatLon[],
  cumDistM: number[],
  distM: number
): LatLon {
  const n = polyline.length;
  const totalDistM = cumDistM[n - 1];

  if (distM <= 0) return polyline[0];
  if (distM >= totalDistM) return polyline[n - 1];

  for (let i = 0; i < n - 1; i++) {
    if (distM >= cumDistM[i] && distM <= cumDistM[i + 1]) {
      const segLenM = cumDistM[i + 1] - cumDistM[i];
      const frac = segLenM > 0 ? (distM - cumDistM[i]) / segLenM : 0;
      return {
        lat: polyline[i].lat + frac * (polyline[i + 1].lat - polyline[i].lat),
        lon: polyline[i].lon + frac * (polyline[i + 1].lon - polyline[i].lon)
      };
    }
  }

  return polyline[n - 1];
}

function addNoise(pos: LatLon, noiseM: number, rand: () => number): LatLon {
  if (noiseM <= 0) return pos;

  const angle = rand() * 2 * Math.PI;
  const radius = rand() * noiseM;
  const dxM = Math.cos(angle) * radius;
  const dyM = Math.sin(angle) * radius;

  const latRad = (pos.lat * Math.PI) / 180;
  const dLat = (dyM / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLon = (dxM / (EARTH_RADIUS_M * Math.cos(latRad))) * (180 / Math.PI);

  return { lat: pos.lat + dLat, lon: pos.lon + dLon };
}

export interface MakeTraceOpts {
  speedMs?: number;
  hz?: number;
  noiseM?: number;
  accM?: number;
  startT?: number;
  seed?: number;
}

/**
 * Generate a synthetic RawFix[] driven along `polyline` at constant speed,
 * with small deterministic noise. Used by tests across core/data/services.
 */
export function makeTrace(
  polyline: LatLon[],
  opts?: MakeTraceOpts
): RawFix[] {
  if (polyline.length < 2) return [];

  const speedMs = opts?.speedMs ?? 12.5;
  const hz = opts?.hz ?? 1;
  const noiseM = opts?.noiseM ?? 3;
  const accM = opts?.accM ?? 10;
  const startT = opts?.startT ?? 1700000000000;
  const seed = opts?.seed ?? 42;

  const { cumDistM, totalDistM } = buildCumDist(polyline);
  const rand = mulberry32(seed);
  const dtMs = 1000 / hz;

  const fixes: RawFix[] = [];
  let i = 0;

  // Safety cap in case of pathological inputs (e.g. zero-length polyline).
  const maxSamples = Math.max(2, Math.ceil((totalDistM / speedMs) * hz) + 4);

  while (i <= maxSamples) {
    const distM = Math.min(speedMs * ((i * dtMs) / 1000), totalDistM);
    const pos = positionAtDistance(polyline, cumDistM, distM);
    const noisy = addNoise(pos, noiseM, rand);

    fixes.push({
      lat: noisy.lat,
      lon: noisy.lon,
      acc: accM,
      spd: speedMs,
      t: startT + i * dtMs
    });

    if (distM >= totalDistM) break;
    i++;
  }

  return fixes;
}
