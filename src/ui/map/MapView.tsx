import { useEffect, useRef, useState } from 'preact/hooks';
import L from 'leaflet';
import 'leaflet-rotate';
import 'leaflet/dist/leaflet.css';
import { shortestArcDelta } from '../../core/heading';
import type { LatLon, RawFix, TracePoint } from '../../core/types';

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

/** localStorage key persisting the compass orientation preference. */
const HEADING_UP_KEY = 'tomtom.headingUp';

/** How long a bearing ease takes: mode toggles and per-fix follow turns. */
const BEARING_ANIM_MS = 550;

export interface MapViewProps {
  routePolyline?: LatLon[];
  lastFix?: RawFix | null;
  statusText?: string;
  /** Live ghost-car position (best-run comparison). Null/undefined hides it. */
  ghostPos?: LatLon | null;
  /** Current display heading, degrees 0-360 (0 = north). Null/undefined leaves the marker's rotation unchanged. */
  headingDeg?: number | null;
  /**
   * Live trail of the driven path (seed mode only). WARNING: this is the
   * drive controller's live trace array, MUTATED IN PLACE — its identity
   * never changes, so updates must be cued by `lastFix` changing rather than
   * by this array reference.
   */
  trail?: TracePoint[];
}

/**
 * Purely presentational map: draws the route polyline (if given), renders a
 * car marker + accuracy circle from `lastFix` (rotated per `headingDeg`), a
 * translucent ghost marker from `ghostPos`, and shows `statusText` in a
 * status pill. A compass button toggles north-up vs heading-up (map rotated
 * so the direction of travel points up, via leaflet-rotate). Does not touch
 * navigator.geolocation — callers (driveController) own the position stream
 * and pass fixes in as props.
 */
export function MapView({ routePolyline, lastFix, statusText, ghostPos, headingDeg, trail }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const ghostRef = useRef<L.CircleMarker | null>(null);
  const trailRef = useRef<L.Polyline | null>(null);
  const trailLenRef = useRef(0);
  const hasFitRef = useRef(false);
  // Accumulated rotation degrees (unbounded, not wrapped to 0-360) so the
  // CSS transition always takes the short way around via shortestArcDelta.
  const displayedHeadingRef = useRef(0);

  // --- Orientation (north-up vs heading-up) state ---------------------------
  const [headingUp, setHeadingUp] = useState(
    () => localStorage.getItem(HEADING_UP_KEY) === '1'
  );
  const headingUpRef = useRef(headingUp);
  /** Latest heading prop value, readable from animation callbacks. */
  const lastHeadingRef = useRef<number | null>(null);
  /** Currently displayed map bearing (continuous degrees, not wrapped). */
  const displayedBearingRef = useRef(0);
  const bearingRafRef = useRef(0);
  const needleRef = useRef<SVGSVGElement | null>(null);

  /** Rotate the car's inner div so it points along its heading ON SCREEN.
   * Screen rotation = compass heading + current map bearing (leaflet-rotate
   * keeps the marker root screen-upright; in heading-up mode bearing is
   * -heading, so this settles at 0 = car pointing up). */
  function syncCarRotation(): void {
    const heading = lastHeadingRef.current;
    if (heading === null) return;
    const el = markerRef.current?.getElement()?.firstElementChild as HTMLElement | null;
    if (!el) return;
    const screenDeg = heading + displayedBearingRef.current;
    const cur = displayedHeadingRef.current;
    displayedHeadingRef.current =
      cur + shortestArcDelta(((cur % 360) + 360) % 360, ((screenDeg % 360) + 360) % 360);
    el.style.transform = `rotate(${displayedHeadingRef.current}deg)`;
  }

  /** Set the map bearing + dependent visuals (car counter-rotation, needle). */
  function applyBearing(bearingDeg: number): void {
    displayedBearingRef.current = bearingDeg;
    mapRef.current?.setBearing(bearingDeg);
    syncCarRotation();
    if (needleRef.current) {
      needleRef.current.style.transform = `rotate(${bearingDeg}deg)`;
    }
  }

  /** Ease the map bearing to `target` (shortest arc, easeOutQuad). While the
   * animation runs, the car's CSS transition is suspended so the per-frame
   * counter-rotation doesn't fight it. */
  function animateBearingTo(target: number): void {
    cancelAnimationFrame(bearingRafRef.current);
    const from = displayedBearingRef.current;
    const delta = shortestArcDelta(((from % 360) + 360) % 360, ((target % 360) + 360) % 360);
    if (delta === 0) {
      applyBearing(from);
      return;
    }
    const carEl = markerRef.current?.getElement()?.firstElementChild as HTMLElement | null;
    carEl?.classList.add('car-rotate-live');
    const t0 = performance.now();
    const step = (now: number): void => {
      const k = Math.min(1, (now - t0) / BEARING_ANIM_MS);
      const eased = k * (2 - k);
      applyBearing(from + delta * eased);
      if (k < 1) {
        bearingRafRef.current = requestAnimationFrame(step);
      } else if (!headingUpRef.current) {
        // Animation done and back in north-up: let CSS own car rotation again.
        carEl?.classList.remove('car-rotate-live');
      }
    };
    bearingRafRef.current = requestAnimationFrame(step);
  }

  function toggleHeadingUp(): void {
    const next = !headingUpRef.current;
    headingUpRef.current = next;
    setHeadingUp(next);
    localStorage.setItem(HEADING_UP_KEY, next ? '1' : '0');
    animateBearingTo(next ? -(lastHeadingRef.current ?? 0) : 0);
  }

  // Mount the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = L.map(container, {
      rotate: true,
      bearing: 0,
      touchRotate: false,
      shiftKeyRotate: false,
      rotateControl: false
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    mapRef.current = map;

    L.tileLayer(TILE_URL, {
      attribution: ATTRIBUTION,
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map);

    return () => {
      cancelAnimationFrame(bearingRafRef.current);
      map.remove();
      mapRef.current = null;
      routeLayerRef.current = null;
      markerRef.current = null;
      accuracyCircleRef.current = null;
      ghostRef.current = null;
      trailRef.current = null;
      trailLenRef.current = 0;
      hasFitRef.current = false;
      displayedBearingRef.current = 0;
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

  // Draw the live trail behind the car (seed mode only). `trail` is the
  // controller's trace array, mutated in place, so we cue off `lastFix`
  // changing rather than off `trail`'s (unchanging) identity, and append
  // only the points added since the last render for O(1) work per fix.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !trail) return;

    if (!trailRef.current) {
      trailRef.current = L.polyline([], { color: '#06b6d4', weight: 4, opacity: 0.9 }).addTo(map);
      trailLenRef.current = 0;
    }

    for (let i = trailLenRef.current; i < trail.length; i++) {
      trailRef.current.addLatLng([trail[i].lat, trail[i].lon]);
    }
    trailLenRef.current = trail.length;
  }, [trail, lastFix]);

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

  // React to a new heading: in heading-up mode ease the map bearing so the
  // travel direction points up (the car counter-rotates each frame inside
  // applyBearing); in north-up mode just rotate the car via its CSS
  // transition, accumulating shortest-arc so it never spins the long way.
  useEffect(() => {
    if (headingDeg == null) return;
    lastHeadingRef.current = headingDeg;
    if (headingUpRef.current) {
      animateBearingTo(-headingDeg);
    } else {
      syncCarRotation();
    }
  }, [headingDeg]);

  // Keep the car's CSS transition suspended for as long as heading-up is
  // active (rAF owns its rotation there), and kick the initial rotation if
  // the mode was restored from localStorage before the marker existed.
  useEffect(() => {
    const el = markerRef.current?.getElement()?.firstElementChild as HTMLElement | null;
    el?.classList.toggle('car-rotate-live', headingUp);
  }, [headingUp, lastFix]);

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
      <button
        class={`compass-btn${headingUp ? ' compass-heading-up' : ''}`}
        aria-label={headingUp ? 'Switch to north-up' : 'Switch to heading-up'}
        onClick={toggleHeadingUp}
      >
        {headingUp ? (
          <svg
            ref={needleRef}
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            style={{ transform: `rotate(${displayedBearingRef.current}deg)` }}
          >
            <path d="M12 2 L16 12 L12 10 L8 12 Z" fill="#ef4444" />
            <path d="M12 22 L8 12 L12 14 L16 12 Z" fill="#9aa3ad" />
          </svg>
        ) : (
          <span class="compass-n">N</span>
        )}
      </button>
    </div>
  );
}
