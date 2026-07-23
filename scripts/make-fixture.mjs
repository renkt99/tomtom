#!/usr/bin/env node
// Generates a synthetic, fully deterministic demo drive fixture: an L-shaped
// ~2km route near Fremantle, Western Australia, sampled at 1Hz with a speed
// profile varying ~8-15 m/s and two ~10s full stops in the middle. Used by
// the ?sim=demo playback path (see src/ui/screens/DriveScreen.tsx) so the
// ghost/delta feature can be demoed entirely from the desk, no real GPS
// needed.
//
// Plain Node ESM, run manually (not part of build/CI):
//   node scripts/make-fixture.mjs
// Writes public/fixtures/demo-drive.json.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'public', 'fixtures', 'demo-drive.json');

const EARTH_RADIUS_M = 6371000;
const BASE = { lat: -32.05, lon: 115.75 };
const START_T = 1700000000000; // fixed epoch ms, for full determinism
const SEED = 20260723;
const ACC_M = 8;
const HZ = 1;

/** mulberry32: small, fast, deterministic PRNG. Returns a fn producing [0,1). */
function mulberry32(seed) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Offset `base` by (dxM east, dyM north) meters, via a local equirect projection. */
function offsetMeters(base, dxM, dyM) {
  const latRad = (base.lat * Math.PI) / 180;
  const dLat = (dyM / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLon = (dxM / (EARTH_RADIUS_M * Math.cos(latRad))) * (180 / Math.PI);
  return { lat: base.lat + dLat, lon: base.lon + dLon };
}

function haversineM(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_M * c;
}

function buildCumDist(polyline) {
  const cumDistM = [0];
  for (let i = 1; i < polyline.length; i++) {
    cumDistM.push(cumDistM[i - 1] + haversineM(polyline[i - 1], polyline[i]));
  }
  return { cumDistM, totalDistM: cumDistM[cumDistM.length - 1] };
}

function positionAtDistance(polyline, cumDistM, distM) {
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

// L-shaped (with a couple of extra turns) route, ~2.1km total:
//   east 600m -> south 600m -> east 500m -> south 400m
const waypoints = [
  offsetMeters(BASE, 0, 0),
  offsetMeters(BASE, 600, 0),
  offsetMeters(BASE, 600, -600),
  offsetMeters(BASE, 1100, -600),
  offsetMeters(BASE, 1100, -1000)
];

const { cumDistM, totalDistM } = buildCumDist(waypoints);

// Full-stop windows, in sample index (seconds) ranges: two ~10s red lights.
const stopWindows = [
  [85, 94],
  [175, 184]
];

function isStopped(i) {
  return stopWindows.some(([lo, hi]) => i >= lo && i <= hi);
}

function speedAt(i, rand) {
  if (isStopped(i)) return 0;
  // Smooth base oscillation between ~8 and ~15 m/s, plus small seeded jitter.
  const base = 11.5 + 3.3 * Math.sin(i / 27);
  const jitter = (rand() - 0.5) * 1.0;
  return Math.max(8, Math.min(15, base + jitter));
}

function run() {
  const rand = mulberry32(SEED);
  const fixes = [];
  let distM = 0;
  let i = 0;
  const dtS = 1 / HZ;

  // Safety cap in case of pathological inputs.
  const maxSamples = 2000;

  while (i <= maxSamples) {
    const pos = positionAtDistance(waypoints, cumDistM, distM);
    const spd = speedAt(i, rand);

    fixes.push({
      lat: Number(pos.lat.toFixed(7)),
      lon: Number(pos.lon.toFixed(7)),
      acc: ACC_M,
      spd: Number(spd.toFixed(2)),
      t: START_T + i * dtS * 1000
    });

    if (distM >= totalDistM) break;

    distM = Math.min(totalDistM, distM + spd * dtS);
    i++;
  }

  return fixes;
}

async function main() {
  const fixes = run();
  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(fixes, null, 2) + '\n', 'utf8');

  const durationS = (fixes[fixes.length - 1].t - fixes[0].t) / 1000;
  console.log(`Wrote ${fixes.length} fixes (${durationS.toFixed(0)}s, ~${totalDistM.toFixed(0)}m) to ${OUT_PATH}`);
}

main();
