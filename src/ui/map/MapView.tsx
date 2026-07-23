import { useEffect, useRef } from 'preact/hooks';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LatLon, RawFix } from '../../core/types';

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; OpenStreetMap contributors';

// Neutral default view (roughly mid-Atlantic) used until a route/fix arrives.
const DEFAULT_CENTER: L.LatLngTuple = [20, 0];
const DEFAULT_ZOOM = 13;
const FIX_ZOOM = 16;

export interface MapViewProps {
  routePolyline?: LatLon[];
  lastFix?: RawFix | null;
  statusText?: string;
}

/**
 * Purely presentational map: draws the route polyline (if given), renders a
 * car dot + accuracy circle from `lastFix`, and shows `statusText` in a
 * status pill. Does not touch navigator.geolocation — callers (driveController)
 * own the position stream and pass fixes in as props.
 */
export function MapView({ routePolyline, lastFix, statusText }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const dotRef = useRef<L.CircleMarker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const hasFitRef = useRef(false);

  // Mount the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = L.map(container).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    mapRef.current = map;

    L.tileLayer(TILE_URL, {
      attribution: ATTRIBUTION,
      maxZoom: 19
    }).addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      routeLayerRef.current = null;
      dotRef.current = null;
      accuracyCircleRef.current = null;
      hasFitRef.current = false;
    };
  }, []);

  // Draw/update the route polyline and fit the map to it once.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routePolyline || routePolyline.length === 0) return;

    const latlngs: L.LatLngTuple[] = routePolyline.map((p) => [p.lat, p.lon]);

    if (routeLayerRef.current) {
      routeLayerRef.current.setLatLngs(latlngs);
    } else {
      routeLayerRef.current = L.polyline(latlngs, {
        color: '#3b82f6',
        weight: 4,
        opacity: 0.8
      }).addTo(map);
    }

    if (!hasFitRef.current) {
      map.fitBounds(routeLayerRef.current.getBounds(), { padding: [24, 24] });
      hasFitRef.current = true;
    }
  }, [routePolyline]);

  // Render/update the car dot + accuracy circle from lastFix.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !lastFix) return;

    const latlng: L.LatLngTuple = [lastFix.lat, lastFix.lon];

    if (!accuracyCircleRef.current) {
      accuracyCircleRef.current = L.circle(latlng, {
        radius: lastFix.acc,
        color: '#3b82f6',
        weight: 1,
        fillColor: '#3b82f6',
        fillOpacity: 0.15
      }).addTo(map);
    } else {
      accuracyCircleRef.current.setLatLng(latlng);
      accuracyCircleRef.current.setRadius(lastFix.acc);
    }

    if (!dotRef.current) {
      dotRef.current = L.circleMarker(latlng, {
        radius: 7,
        color: '#3b82f6',
        weight: 2,
        fillColor: '#60a5fa',
        fillOpacity: 0.9
      }).addTo(map);
    } else {
      dotRef.current.setLatLng(latlng);
    }

    if (!hasFitRef.current) {
      map.setView(latlng, FIX_ZOOM);
    }
  }, [lastFix]);

  return (
    <div class="map-screen">
      <div ref={containerRef} class="map-container" />
      {statusText ? <div class="status-pill">{statusText}</div> : null}
    </div>
  );
}
