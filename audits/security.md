# SEC — Security

The biggest risk surface is the **user-supplied backup JSON import**
(`src/data/exportImport.ts` → `importAll`, wired from
`src/ui/screens/Settings.tsx`'s file picker): it's the only path where fully
attacker-controlled data reaches IndexedDB and later gets rendered/computed on.
Secondary risks are URL/hash-driven behavior (`src/ui/sim.ts` query params,
`src/ui/router.ts` hash parsing feeding `replayRunId` into a DB lookup) and any
unsanitized-render sink in the Leaflet map or JSX screens. No server, accounts,
or secrets — scope is client-side data/DOM trust boundaries. Ledger prefix: **SEC**.

## Backup import (`src/data/exportImport.ts`)

- [ ] `isValidRoute`/`isValidRun` in `exportImport.ts` only check `typeof`/`Array.isArray` — verify `NaN`, `Infinity`, and negative values pass through unrejected for `totalDistM`, `corridorM`, `durationMs`, `distanceM`, `coveragePct`, `dow`, `hour`, and confirm nothing downstream (ETA calc, corridor matching, rendering) divides by or indexes with one of these unchecked numbers in a way that crashes or misbehaves.
- [ ] `isValidRoute`/`isValidRun` don't cap array lengths — verify `importAll` has no bound on `polyline`, `cumDistM`, or `trace` array sizes, so a crafted backup with e.g. a multi-million-point `trace` can exhaust memory/IndexedDB during `db.runs.add(run)`.
- [ ] `importAll` accepts any string for `Route.id`/`Run.id`/`Run.routeId` (only `typeof === 'string'`, no format/length check) — confirm an oversized or pathological string id can't break Dexie's primary-key indexing or the merge-by-id lookups used for dedup.
- [ ] `Run.reasons` is only checked with `Array.isArray(v.reasons)` (element type unchecked) — verify wherever `reasons` is rendered does not interpolate arbitrary array contents into HTML in a way that bypasses Preact's default text-escaping (i.e. no `dangerouslySetInnerHTML` on that field).
- [ ] `handleFileChosen` in `Settings.tsx` calls `JSON.parse(text)` directly on the picked file's full contents with no size cap — confirm there's no guard against an extremely large file hanging/crashing the tab during parse.
- [ ] Confirm `importAll`'s "validates everything before writing anything" ordering is preserved: all routes and runs are validated in full passes before any `db.*.add` call (regression-guarded by `src/data/exportImport.test.ts` "rejects malformed input" cases).
- [ ] Malformed-input rejection (missing version, non-array `routes`/`runs`, invalid record) is covered by `src/data/exportImport.test.ts` — confirm the tests stay in sync when `isValidRoute`/`isValidRun` gain new required fields. Gate: `npm test`.

## URL / hash-driven behavior

- [ ] `src/ui/sim.ts` reads `sim`, `x`, `noise`, `debug` straight from `location.search` — verify a crafted `?x=` or `?noise=` value (negative, `Infinity`, non-numeric) can't make `createSimulatedSource` (consumer in `DriveScreen.tsx`) spin in a tight loop or produce a degenerate playback rate that hangs the UI.
- [ ] `router.ts` extracts `replayRunId` from the hash query and passes it unvalidated into `getRun(replayRunId)` (`DriveScreen.tsx`) — confirm a crafted `#/drive/<id>?replay=<arbitrary>` only ever results in a graceful "no run found" path, not an unhandled exception, since this is a shareable URL.
- [ ] `parseHash`'s route regexes (`/^\/route\/([^/]+)$/`, `/^\/drive\/([^/]+)$/`) capture the id segment unescaped — verify no code path drops that raw id string into an HTML attribute or the DOM without Preact's normal JSX escaping.

## Rendering / DOM sinks

- [ ] Re-verify on every sweep: no `innerHTML`, `dangerouslySetInnerHTML`, `eval(`, or `new Function(` anywhere under `src/` (zero hits as of 2026-07-23) — a future Leaflet popup (`bindPopup`) would be the natural place for one to appear with imported/URL data flowing into it.
- [ ] `src/ui/map/MapView.tsx` builds `L.polyline`/`L.CircleMarker` from numeric lat/lon only, no `bindPopup`/HTML content — if a popup or label showing `route.name` (free text, potentially attacker-supplied via import) is ever added, confirm it goes through JSX text binding, not `L.popup().setContent()` string concatenation.
- [ ] `prompt()`/`confirm()`/`alert()` call sites (`DriveScreen.tsx`, `RouteDetail.tsx`) pass static or numeric-formatted strings today — verify none start interpolating an imported/untrusted string (route name) directly.

## Build / deploy / PWA surface

- [ ] `vite.config.ts` workbox `runtimeCaching` CacheFirst rule stays scoped to `^https:\/\/tile\.openstreetmap\.org\/.*` — a broader pattern would let the service worker cache arbitrary cross-origin responses.
- [ ] `scripts/deploy.sh` runs `npm test && npm run build` before publishing and force-pushes only `dist/` — confirm no secret/env file can end up in `dist/` before `git add -A` (none exist today; re-check if any are added).
