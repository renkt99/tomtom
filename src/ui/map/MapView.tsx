import { useEffect, useRef } from 'preact/hooks';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; OpenStreetMap contributors';

// Neutral default view (roughly mid-Atlantic) used until a GPS fix arrives.
const DEFAULT_CENTER: L.LatLngTuple = [20, 0];
const DEFAULT_ZOOM = 13;
const FIX_ZOOM = 16;

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = L.map(container).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    L.tileLayer(TILE_URL, {
      attribution: ATTRIBUTION,
      maxZoom: 19
    }).addTo(map);

    let hasFix = false;
    let dot: L.CircleMarker | null = null;
    let accuracyCircle: L.Circle | null = null;

    const setStatus = (text: string) => {
      if (statusRef.current) {
        statusRef.current.textContent = text;
      }
    };

    setStatus('waiting for GPS…');

    const onPosition = (pos: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const latlng: L.LatLngTuple = [latitude, longitude];

      if (!hasFix) {
        hasFix = true;
        map.setView(latlng, FIX_ZOOM);
      }

      if (!accuracyCircle) {
        accuracyCircle = L.circle(latlng, {
          radius: accuracy,
          color: '#3b82f6',
          weight: 1,
          fillColor: '#3b82f6',
          fillOpacity: 0.15
        }).addTo(map);
      } else {
        accuracyCircle.setLatLng(latlng);
        accuracyCircle.setRadius(accuracy);
      }

      if (!dot) {
        dot = L.circleMarker(latlng, {
          radius: 7,
          color: '#3b82f6',
          weight: 2,
          fillColor: '#60a5fa',
          fillOpacity: 0.9
        }).addTo(map);
      } else {
        dot.setLatLng(latlng);
      }

      setStatus(`±${Math.round(accuracy)}m`);
    };

    const onError = (err: GeolocationPositionError) => {
      setStatus(err.message || 'location unavailable');
    };

    let watchId: number | null = null;
    if ('geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(onPosition, onError, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000
      });
    } else {
      setStatus('geolocation not supported');
    }

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
      map.remove();
    };
  }, []);

  return (
    <div class="map-screen">
      <div ref={containerRef} class="map-container" />
      <div ref={statusRef} class="status-pill" />
    </div>
  );
}
