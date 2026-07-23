# TomTom

A personal drive-tracking PWA: record your own routes, get a live ghost-car comparison against your best-ever run and a history-based ETA before you leave — all data stays on-device (IndexedDB, with JSON export/import as backup). This is a personal project, unaffiliated with TomTom N.V.

## Development

```
npm install
npm run dev
npm test
npm run build
```

## Deploy

No GitHub Actions — this repo must not consume Actions minutes. Deploys are
local: `./scripts/deploy.sh` runs tests + build, then force-pushes `dist/` to
the `gh-pages` branch (Pages branch source) →
https://renkt99.github.io/tomtom/. Before merging a PR, run `npm test` and
`npm run build` locally; there is no CI to catch failures.
