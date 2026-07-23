import { useEffect, useRef } from 'preact/hooks';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { shortestArcDelta } from '../../core/heading';
import type { LatLon, RawFix } from '../../core/types';

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

// Neutral default view (roughly mid-Atlantic) used until a route/fix arrives.
const DEFAULT_CENTER: L.LatLngTuple = [20, 0];
const DEFAULT_ZOOM = 13;
const FIX_ZOOM = 16;

// Simple top-down car silhouette, nose pointing up (rotated via CSS transform
// to match heading). Rounded body with a darker windshield/rear-window
// detail and a white outline for contrast against light Voyager tiles.
const CAR_SVG =
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
  '<rect x="6" y="2" width="12" height="20" rx="5" fill="#3b82f6" stroke="#ffffff" stroke-width="1.2"/>' +
  '<rect x="8.2" y="5" width="7.6" height="5" rx="1.8" fill="#1d4ed8"/>' +
  '<rect x="8.6" y="15.5" width="6.8" height="3.5" rx="1.5" fill="#1d4ed8" opacity="0.55"/>' +
  '</svg>';

// Created once at module scope: the icon itself is static, only the inner
// div's CSS transform changes per fix (see the headingDeg effect below).
const CAR_ICON = L.divIcon({
  className: 'car-marker',
  html: `<div class="car-marker-inner">${CAR_SVG}</div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

export interface MapViewProps {
  routePolyline?: LatLon[];
  lastFix?: RawFix | null;
  statusText?: string;
  /** Live ghost-car position (best-run comparison). Null/undefined hides it. */
  ghostPos?: LatLon | null;
  /** Current display heading, degrees 0-360 (0 = north). Null/undefined leaves the marker's rotation unchanged. */
  headingDeg?: number | null;
}

/**
 * Purely presentational map: draws the route polyline (if given), renders a
 * car marker + accuracy circle from `lastFix` (rotated per `headingDeg`), a
 * translucent ghost marker from `ghostPos`, and shows `statusText` in a
 * status pill. Does not touch navigator.geolocation — callers
 * (driveController) own the position stream and pass fixes in as props.
 */
export function MapView({ routePolyline, lastFix, statusText, ghostPos, headingDeg }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const ghostRef = useRef<L.CircleMarker | null>(null);
  const hasFitRef = useRef(false);
  // Accumulated rotation degrees (unbounded, not wrapped to 0-360) so the
  // CSS transition always takes the short way around via shortestArcDelta.
  const displayedHeadingRef = useRef(0);

  // Mount the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = L.map(container).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    mapRef.current = map;

    L.tileLayer(TILE_URL, {
      attribution: ATTRIBUTION,
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      routeLayerRef.current = null;
      markerRef.current = null;
      accuracyCircleRef.current = null;
      ghostRef.current = null;
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

  // Render/update the car marker + accuracy circle from lastFix.
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

    if (!markerRef.current) {
      markerRef.current = L.marker(latlng, { icon: CAR_ICON }).addTo(map);
    } else {
      markerRef.current.setLatLng(latlng);
    }

    if (!hasFitRef.current) {
      map.setView(latlng, FIX_ZOOM);
    }
  }, [lastFix]);

  // Rotate the car marker's inner div to face headingDeg, accumulating via
  // shortest-arc so the CSS transition never spins the long way around.
  useEffect(() => {
    if (headingDeg == null) return;
    const marker = markerRef.current;
    if (!marker) return;
    const el = marker.getElement()?.firstElementChild as HTMLElement | null;
    if (!el) return;

    const cur = displayedHeadingRef.current;
    displayedHeadingRef.current = cur + shortestArcDelta(((cur % 360) + 360) % 360, headingDeg);
    el.style.transform = `rotate(${displayedHeadingRef.current}deg)`;
  }, [headingDeg]);

  // Render/move/remove the translucent ghost marker from ghostPos.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!ghostPos) {
      if (ghostRef.current) {
        ghostRef.current.remove();
        ghostRef.current = null;
      }
      return;
    }

    const latlng: L.LatLngTuple = [ghostPos.lat, ghostPos.lon];

    if (!ghostRef.current) {
      ghostRef.current = L.circleMarker(latlng, {
        radius: 7,
        color: '#a78bfa',
        weight: 2,
        fillColor: '#8b5cf6',
        fillOpacity: 0.6
      }).addTo(map);
    } else {
      ghostRef.current.setLatLng(latlng);
    }
  }, [ghostPos]);

  return (
    <div class="map-screen">
      <div ref={containerRef} class="map-container" />
      {statusText ? <div class="status-pill">{statusText}</div> : null}
    </div>
  );
}
