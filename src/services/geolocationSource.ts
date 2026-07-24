import type { RawFix } from '../core/types';
import type { PositionSource } from './positionSource';

/** Map a GeolocationPositionError to actionable user-facing copy. */
export function describeGeoError(code: number, raw: string): string {
  switch (code) {
    case 1: // PERMISSION_DENIED
      return 'Location access is blocked. Allow location for this site in your browser or system settings, then try again.';
    case 2: // POSITION_UNAVAILABLE
      return 'Your location is currently unavailable. Move somewhere with clearer sky view and try again.';
    case 3: // TIMEOUT
      return 'Getting a location fix timed out. Try again.';
    default:
      return raw || 'Something went wrong getting your location. Try again.';
  }
}

/** Wraps navigator.geolocation.watchPosition as a PositionSource. */
export class GeolocationSource implements PositionSource {
  private watchId: number | null = null;

  start(cb: (fix: RawFix) => void, onError: (msg: string) => void): void {
    if (!('geolocation' in navigator)) {
      onError('geolocation not supported');
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (pos: GeolocationPosition) => {
        cb({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          acc: pos.coords.accuracy,
          spd: pos.coords.speed ?? 0,
          hdg: Number.isFinite(pos.coords.heading) ? (pos.coords.heading as number) : undefined,
          t: pos.timestamp
        });
      },
      (err: GeolocationPositionError) => {
        onError(describeGeoError(err.code, err.message));
      },
      { enableHighAccuracy: true, maximumAge: 0 }
    );
  }

  stop(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }
}

export const geolocationSource = new GeolocationSource();
