# PERF — Performance

The biggest risk is the 1 Hz `onFix` + 1 s ticker in `driveController.ts`
running 20–60 min continuously on battery + screen + GPS + Leaflet, inside a
component (`DriveScreen.tsx`) that re-renders on every signal it reads. Second:
`listRoutesWithStats` in `src/data/repo.ts` deserializes every run's full
`trace` from Dexie just to read `durationMs`/counts — a home-screen cost that
grows unbounded with history. Ledger prefix: **PERF**.

## Drive-loop hot path

- [ ] `driveController.ts` `onFix`: confirm `matchProgress`'s window stays bounded (`[segIdx−2, segIdx+20]` in `progress.ts`) and can't degrade to a full-polyline scan on long routes.
- [ ] `ghost.ts` `ghostPositionAt`/`timeAtDistance`: confirm both stay O(log n) and are called at most once per fix plus once per tick.
- [ ] `trace`/`rawFixes` arrays grow ~3600 points/hr in memory — check for GC pauses/dropped frames over a 60-min drive on iPhone Safari; neither array is trimmed or capped.
- [ ] `setInterval(..., 1000)`: verify it's cleared on every exit path (`stopInternal`, error, unmount) — a leaked interval keeps writing signals after navigating away.
- [ ] `geolocationSource.ts` watch options + `wakeLock.ts`: verify GPS options aren't keeping the radio busier than 1 Hz requires; battery over an hour is a named constraint.

## Map rendering

- [ ] `MapView.tsx` car-dot effect: `setLatLng`/`setRadius` must run at most once per `lastFix` change and never re-add layers.
- [ ] Follow-cam behavior: verify whether `setView` pans per fix and measure its 1 Hz cost on Safari's compositor (pan re-render + tile requests per pan).
- [ ] Ghost-marker effect: confirm `ghostRef.current` is reused (moved), not created/destroyed per update.
- [ ] `L.tileLayer` fetch behavior during a moving follow-cam over 20–60 min — check Leaflet `keepBuffer`/cache tuning vs the SW `osm-tiles` cache to avoid re-fetching recently-seen tiles.

## Storage query patterns

- [ ] `listRoutesWithStats`: loads full `Run` rows (incl. traces) per route just for counts + best duration — measure home-screen load as history grows; consider a per-route summary or trimmed projection before it hurts.
- [ ] `recomputeBestRunId`/`getEtaForRoute` also pull full traces — confirm they run only on save/mount, never during a live drive.
- [ ] `DriveScreen.tsx` bestTrace load (`getRun(route.bestRunId)`): confirm one fetch per mount, not per `route` state change (it's also a dependency of the controller-creation effect).

## Bundle / load

- [ ] Verify whether `leaflet` (~150 KB, the main chunk driver) can be code-split so the route-list screen doesn't pay for it on first paint.
- [ ] Review the SW precache manifest (~330 KB) for anything deferrable — e.g. `fixtures/demo-drive.json` shouldn't need precaching for real users.

## Signals / re-render behavior

- [ ] `DriveScreen.tsx` reads ~13 signals directly in the render body, so any single update re-renders the whole tree — measure render frequency during recording and evaluate splitting hot readouts (elapsed, debug panel) into child components that read only their own signal.
