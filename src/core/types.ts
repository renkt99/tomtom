// Shared data types for the core algorithms, data layer, and UI.
// This module has no imports — keep it dependency-free.

export interface LatLon {
  lat: number;
  lon: number;
}

/** A single raw GPS reading as it comes off a PositionSource. */
export interface RawFix {
  lat: number;
  lon: number;
  /** Reported accuracy radius, meters. */
  acc: number;
  /** Reported speed, m/s. Browsers may report NaN or omit it. */
  spd?: number;
  /** Epoch ms. */
  t: number;
}

/** A fix that has been accepted into a run's trace. */
export interface TracePoint {
  /** ms relative to run start. */
  t: number;
  lat: number;
  lon: number;
  acc: number;
  spd: number;
  /** Distance-along-route (route mode) or cumulative distance (seed mode), meters. */
  d: number;
}

export interface Route {
  id: string;
  name: string;
  polyline: LatLon[];
  cumDistM: number[];
  totalDistM: number;
  corridorM: number;
  bestRunId: string | null;
  createdAt: number;
}

export interface Run {
  id: string;
  routeId: string;
  startedAt: number;
  durationMs: number;
  dow: number;
  hour: number;
  trace: TracePoint[];
  distanceM: number;
  coveragePct: number;
  valid: boolean;
  reasons: string[];
  endedBy: 'manual' | 'seed';
}
