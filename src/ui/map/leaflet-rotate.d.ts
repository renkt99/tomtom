// Type shim for leaflet-rotate@0.2.8, which ships no TypeScript types.
// Only the options/methods this app uses are declared.
import 'leaflet';

declare module 'leaflet' {
  interface MapOptions {
    /** Enable the leaflet-rotate machinery for this map. */
    rotate?: boolean;
    /** Initial bearing, degrees (CSS-clockwise rotation of the map content). */
    bearing?: number;
    /** Two-finger rotation gesture (plugin default: false). */
    touchRotate?: boolean;
    /** Shift + mouse-wheel rotation (plugin default: true). */
    shiftKeyRotate?: boolean;
    /** The plugin's built-in rotate control (plugin default: true). */
    rotateControl?: boolean;
  }

  interface Map {
    /** Rotate the map content to `theta` degrees (wrapped to 0-360). */
    setBearing(theta: number): void;
    getBearing(): number;
  }
}

declare module 'leaflet-rotate';
