# TEST — Testing

The 86 colocated Vitest tests are strong on pure logic but stop exactly at the
browser boundary: every Preact screen, `geolocationSource`, `wakeLock`,
`MapView`/Leaflet, and the service-worker layer have zero automated tests —
integration seams a headless unit suite structurally cannot see. There is also
no CI, so the only gate against regressions in that untested surface is human
discipline pre-merge (`npm test` + `npm run build`, also run by
`scripts/deploy.sh`). Ledger prefix: **TEST**.

## Unit coverage gaps

- [ ] `src/services/geolocationSource.ts` has no test — verify the `watchPosition` mapping (`speed ?? 0` fallback, `pos.timestamp` → `RawFix.t`) and the "geolocation not supported" branch are covered, or confirm they're deliberately deferred to the manual on-device checklist.
- [ ] `src/services/wakeLock.ts` has no test — check whether `onVisibilityChange`'s re-acquire guard and the `lost` signal's deliberate-release vs surprise-release distinction are unit-tested (same state-machine subtlety class `driveController.test.ts` covers elsewhere).
- [ ] `driveController.test.ts` never passes `timeScale` (used by `DriveScreen.tsx` for demo/replay) — confirm a test asserts `elapsedMs`/ghost timing scale correctly under `timeScale !== 1`.
- [ ] `scripts/make-fixture.mjs` output feeds the `?sim=demo` path — no test verifies `public/fixtures/demo-drive.json` still matches the `RawFix` shape; a malformed regenerated fixture only surfaces on manual demo load.

## Integration seams (unreachable by the unit suite)

- [ ] `DriveScreen.tsx`'s controller-creation effect branches on `isReplay`/`isDemo`/`bestTraceReady`/`simReady` to pick a `PositionSource` — zero component tests exist, so nothing catches wrong-source wiring or double-construction on re-render. Verify by manual `?sim=demo` + Replay click-through per release.
- [ ] `src/ui/map/MapView.tsx` prop→marker bindings (lastFix/ghostPos/routePolyline) are untested (Leaflet needs real DOM) — confirm this remains a deliberate convention with manual visual verification, not an oversight.
- [ ] The PWA/SW layer (`dist/sw.js`, precache manifest, autoUpdate) has no automated check — confirm "reload picks up the new deploy" is verified manually after each `scripts/deploy.sh` run.

## Manual on-device checklist (iOS)

- [ ] Re-verify the standalone (home-screen) geolocation permission flow after changes to `geolocationSource.ts` or the manifest — permission granted in Safari does NOT carry into the installed app context.
- [ ] Re-run the wake-lock mount test on a physical iPhone per release: full recording session including a notification pull-down / app-switch cycle, exercising `wakeLock.ts`'s visibilitychange re-acquire path.
- [ ] Periodically do a real (non-sim) drive and compare against simulator assumptions — dropped/duplicate fixes, cold-lock delay in `acquiring`, mid-drive backgrounding — none of which `simulatedSource` models.

## Gate discipline (no CI)

- [ ] Confirm `npm test` was run green immediately before each merge (not a stale pass) — there is no CI to catch a skipped run; `scripts/deploy.sh` re-runs it, but merges to main can land without it.
- [ ] For any PR touching `src/ui/screens/`, `MapView.tsx`, `geolocationSource.ts`, or `wakeLock.ts`: a green `npm test` says nothing about that surface — require an explicit manual click-through or the relevant on-device item above before merge.
