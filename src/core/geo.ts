// Pure geo math. Only depends on ./types — keep this module DOM-free.

import type { LatLon } from './types';

export type { LatLon } from './types';

const EARTH_RADIUS_M = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Great-circle distance between two points, in meters. */
export function haversineM(a: LatLon, b: LatLon): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);

  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return EARTH_RADIUS_M * c;
}

/** Initial bearing from a to b, in degrees, 0-360 where 0 is north. */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  const theta = Math.atan2(y, x);

  return (toDeg(theta) + 360) % 360;
}

export interface SegmentProjection {
  point: LatLon;
  tFrac: number;
  offsetM: number;
}

/**
 * Project point p onto segment a→b using a local equirectangular projection
 * centered near p (here: at a's coordinates), accurate for the short segment
 * lengths a route polyline is simplified to.
 */
export function projectOntoSegment(
  p: LatLon,
  a: LatLon,
  b: LatLon
): SegmentProjection {
  const lat0 = toRad(a.lat);
  const lon0 = toRad(a.lon);
  const cosLat0 = Math.cos(lat0);

  const toLocal = (q: LatLon): { x: number; y: number } => ({
    x: (toRad(q.lon) - lon0) * cosLat0 * EARTH_RADIUS_M,
    y: (toRad(q.lat) - lat0) * EARTH_RADIUS_M
  });

  const pl = toLocal(p);
  const al = toLocal(a);
  const bl = toLocal(b);

  const abx = bl.x - al.x;
  const aby = bl.y - al.y;
  const lenSq = abx * abx + aby * aby;

  let tFrac: number;
  if (lenSq === 0) {
    tFrac = 0;
  } else {
    const apx = pl.x - al.x;
    const apy = pl.y - al.y;
    tFrac = (apx * abx + apy * aby) / lenSq;
  }
  tFrac = Math.max(0, Math.min(1, tFrac));

  const projX = al.x + tFrac * abx;
  const projY = al.y + tFrac * aby;

  const point: LatLon = {
    lat: toDeg(projY / EARTH_RADIUS_M + lat0),
    lon: toDeg(projX / (cosLat0 * EARTH_RADIUS_M) + lon0)
  };

  const offsetM = haversineM(p, point);

  return { point, tFrac, offsetM };
}
