import type { RawFix } from '../core/types';
import type { PositionSource } from './positionSource';

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
        onError(err.message);
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
