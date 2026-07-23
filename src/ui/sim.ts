// Simulator query-string config, parsed ONCE at module load (ES modules are
// cached, so this is effectively a singleton — no need to re-parse per render).
//
// - `?sim=demo` — drive using the bundled demo fixture instead of real GPS.
// - `?x=<n>` — playback speed multiplier (default 5).
// - `?noise=<n>` — position jitter in meters (default 0).
// - `?debug=1` — show the on-screen GPS/state debug panel on DriveScreen.
export const simConfig = {
  demo: new URLSearchParams(location.search).get('sim') === 'demo',
  speedMult: Number(new URLSearchParams(location.search).get('x')) || 5,
  noiseM: Number(new URLSearchParams(location.search).get('noise')) || 0,
  debug: new URLSearchParams(location.search).get('debug') === '1'
};
