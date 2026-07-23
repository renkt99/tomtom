# CQ — Code Quality

`DriveScreen.tsx` is the biggest risk: one component juggling four drive modes
(live/demo/replay/seed) crossed with auto-stop, wake-lock, hold-to-stop, and a
debug panel via ad-hoc boolean combinations (`isReplay`, `isDemo`,
`routeId === null`) rather than an explicit mode model — each new feature
multiplies branch count. Compounding this, there is no lint gate (no ESLint):
`tsc --noEmit` (strict) and Vitest are the only automated gates, so dead code
and complexity that don't produce type errors go uncaught. Ledger prefix: **CQ**.

## Layering & module boundaries

- [ ] Grep `src/core/` for imports outside `core/` and confirm zero hits — the purity rule is enforced only by convention (header comments), not tooling; `tsc` strict does NOT catch a `core/` file importing from `services/`/`ui/`.
- [ ] Confirm `src/services/*.ts` import only from `src/core/`, never `src/ui/`, preserving one-way layering.
- [ ] Confirm `leaflet` (and its CSS) is imported only in `src/ui/map/MapView.tsx` (`grep -rn leaflet src/`).
- [ ] Check for `window`/`document` globals inside `src/core/*.ts` — a stray DOM reference silently violates the "pure, no DOM" contract.

## DriveScreen.tsx mode/state complexity

- [ ] Enumerate every `isReplay`/`isDemo`/`routeId === null` branch in `DriveScreen.tsx` and assess collapsing the four modes into one discriminated-union `mode` value — verify no unreachable-but-undefined combination (e.g. `isReplay && isDemo`) exists.
- [ ] Check whether `finishAndSave`, `finishReplayDrive`, and `performStop` should move out of the view into `driveController.ts` or a hook — they encode business rules (save-vs-discard, the 2-fix minimum) that belong with the service layer.
- [ ] Verify the wake-lock effect and hold-to-stop gesture state in `DriveScreen.tsx` have any test breadth at all (screens currently have zero tests — see TEST checklist) before further complexity lands there.
- [ ] Assess extracting the `simConfig.debug` panel block into a `DebugPanel` component to shrink `DriveScreen.tsx`'s render function.

## Cross-module signal coupling

- [ ] `pendingRouteName` (defined `NewRoute.tsx`, consumed `DriveScreen.tsx`) and `newBestFlashRunId` (defined `RouteDetail.tsx`, set `DriveScreen.tsx`) are module-level signals imported screen-to-screen — verify each keeps its hand-off doc comment and assess a dedicated `src/ui/handoff.ts` to make the coupling explicit.
- [ ] Verify `newBestFlashRunId` is read-and-cleared exactly once per use in `RouteDetail.tsx`, and check for a stale-flash bug when navigating to a *different* route's detail while a flag from a prior route is pending.

## Duplication & repeated patterns

- [ ] `alert()`/`confirm()`/`prompt()` are scattered across `DriveScreen.tsx` and `RouteDetail.tsx` with no shared wrapper — assess a small `ui/dialogs.ts` seam (native dialogs block the main thread and are unstylable/untestable).
- [ ] `createRouteFromSeed` and `saveRun` in `src/data/repo.ts` build near-identical `Run` objects field-by-field — check whether a shared `buildRun()` helper prevents the two sites drifting.
- [ ] Repeated `useState<T | null>` + `useEffect(load)` + null-guard boilerplate across `RouteDetail.tsx`, `DriveScreen.tsx`, `RouteList.tsx` — assess a shared `useLoad` hook once a third repetition appears.

## Lint/type gate gaps

- [ ] Verify `noUnusedLocals`/`noUnusedParameters` are enabled in `tsconfig.json` — without ESLint these tsc flags are the only dead-code detection. Gate: `npm run build` (tsc strict).
- [ ] `// eslint-disable-next-line react-hooks/exhaustive-deps` comments exist in `DriveScreen.tsx` with no ESLint installed — they are inert; either remove them or treat each as a marker that the effect's dependency array needs manual re-verification on change.
