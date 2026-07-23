# TomTom

A personal drive-tracking PWA: record your own routes, get a live ghost-car comparison against your best-ever run and a history-based ETA before you leave — all data stays on-device (IndexedDB, with JSON export/import as backup). This is a personal project, unaffiliated with TomTom N.V.

## Development

```
npm install
npm run dev
npm test
npm run build
```

The drive screen (`#/drive/:id` and `#/drive-new`) reads a few URL query
params for desk-testing without a phone: `?sim=demo` drives the bundled demo
fixture instead of real GPS (replaying a stored run via "Replay" on a route's
detail page uses the same simulated-source path); `?x=<n>` sets the sim/replay
playback speed multiplier (default 5); `?noise=<n>` adds up to `n` meters of
random position jitter to demo playback (default 0); `?debug=1` shows a small
on-screen panel with the last GPS fix, accepted/rejected fix counts, distance
along route, off-route distance, raw/smoothed delta-vs-best, and the current
drive state. A route drive also auto-stops (no button press needed) once
you're within 60 m of the route's end, under ~2.5 m/s for 5 s, having covered
at least 80% of the route — seed recording and replays never auto-stop.

## Deploy

No GitHub Actions — this repo must not consume Actions minutes. Deploys are
local: `./scripts/deploy.sh` runs tests + build, then force-pushes `dist/` to
the `gh-pages` branch (Pages branch source) →
https://renkt99.github.io/tomtom/. Before merging a PR, run `npm test` and
`npm run build` locally; there is no CI to catch failures.
