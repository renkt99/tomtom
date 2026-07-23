# Audit Findings Ledger

Single source of truth for everything the category audits in this folder have
turned up. Before reporting a finding, **check this ledger first** — if it is
already here as `fixed` or `wontfix`, do not re-surface it. Repeat audit runs
should diff their results against this file and only append genuinely new
findings.

## How to record a finding

One entry per finding, appended under the matching category `##` section, using
this exact template. The template doubles as a self-contained work item — see
"Working a finding" below — so fill it in as if the reader has no other context.

```
### <CAT>-NNN — <imperative one-line title>

- **Status:** open · **Severity:** crit|high|med|low · **Date:** YYYY-MM-DD
- **Location:** `path/to/file.ts:line` or `func()`
- **Problem:** The defect/risk and its impact, in one or two sentences.
- **Goal:** The fix as an imperative, self-contained task — exact enough that
  an agent given only this entry knows what to change and where.
- **Done when:** Observable acceptance criteria: behavior, tests, checks.
```

Field rules:

- **ID** — `<CAT>-NNN`, category prefix + zero-padded sequence, never reused
  (e.g. `SEC-001`, `DATA-004`). Prefixes in this project: `SEC` Security,
  `COR` Correctness, `CQ` Code Quality, `TEST` Testing, `DATA` Data/Storage,
  `PERF` Performance, `UX` UX/Accessibility, `BLD` Build/Packaging. Scan the
  section for the highest existing number.
- **Title** — imperative and specific, not a restatement of the problem.
- **Status** — `open` (confirmed, not yet fixed), `fixed`, or `wontfix`
  (deliberately accepted).
- **Severity** — `crit` / `high` / `med` / `low`. Security and data-loss
  findings default to `high` or above (in this app, data-loss = the user's
  entire drive history: there is no server copy).
- **Date** — `YYYY-MM-DD` the entry was last changed (ISO 8601).
- **Goal / Done when** — present on `open` entries. Keep the goal grounded in
  the suggested fix; keep "Done when" observable (a passing test, a check
  output, a behavior), not "code looks better".

When a finding is resolved, edit its entry **in place** — never delete entries;
the history of what was accepted and why is the point. Update Status + Date and
replace the **Goal** and **Done when** lines with a single line:

- fixed → `- **Resolution:** <what was done + commit SHA or PR#>`
- wontfix → `- **Resolution:** <why it is accepted>`

Keep entries tight: Problem in one or two sentences, deep detail in the commit
message. An empty category section holds a single `_none yet._` line until its
first finding.

## Working a finding

Every `open` entry is written to be handed off as-is by its ID — an agent given
only the entry (e.g. "fix DATA-002 from audits/FINDINGS.md") should know what
to change, where, and how to prove it done.

---

## SEC — Security

### SEC-001 — Reject non-finite/negative numeric fields on backup import

- **Status:** open · **Severity:** med · **Date:** 2026-07-23
- **Location:** `src/data/exportImport.ts:46-76` `isValidRoute()`/`isValidRun()`
- **Problem:** Numeric fields are checked only with `typeof === 'number'`, so `NaN`/`Infinity`/negative values pass. A run with negative `durationMs` sorts as "fastest" and silently hijacks `bestRunId` (`repo.ts:65`), `NaN` renders as `"NaN:NaN"` in ETA displays, and a route imported with `corridorM: NaN` makes off-route detection never fire on every future live drive of that route (`x > NaN` is always false at `driveController.ts:155`, `validate.ts:39`).
- **Goal:** In `isValidRoute`/`isValidRun`, require `Number.isFinite` plus sign constraints: `durationMs >= 0`, `totalDistM > 0`, `corridorM > 0`; tighten `distanceM`/`coveragePct`/`startedAt`/`dow`/`hour` the same way while there.
- **Done when:** `exportImport.test.ts` rejects a run with `durationMs: NaN` and `-1`, and a route with `corridorM: NaN`; `npm test` green.

### SEC-002 — Cap backup import size (file bytes and array lengths)

- **Status:** open · **Severity:** low · **Date:** 2026-07-23
- **Location:** `src/ui/screens/Settings.tsx:63` `handleFileChosen()`; `src/data/exportImport.ts` `isValidRoute()`/`isValidRun()`
- **Problem:** No `file.size` check before `await file.text()` + `JSON.parse`, and no bound on `polyline`/`cumDistM`/`trace` array lengths, so a huge crafted backup can hang the tab during parse or exhaust memory/IndexedDB mid-import. Availability-only; the user picks the file themselves.
- **Goal:** Check `file.size` against a cap (e.g. 50 MB) before reading, surfacing the existing friendly import error; reject records whose arrays exceed generous bounds (e.g. trace > 500k points) during validation.
- **Done when:** An oversized file produces the import-failed message without parsing; a test rejects an over-bound trace; `npm test` green.

### SEC-003 — Validate sim URL params with Number.isFinite

- **Status:** open · **Severity:** low · **Date:** 2026-07-23
- **Location:** `src/ui/sim.ts:11`
- **Problem:** `Number(params.get('noise')) || 0` keeps `Infinity` (truthy), so `?noise=Infinity` flows through `addNoise` into non-finite `lat`/`lon` fixes, which reach Leaflet circle markers unvalidated and can throw inside an effect (no error boundary exists), blanking the drive screen. Self-inflicted URL only; `?x=` has the same parsing gap (bounded impact).
- **Goal:** Guard both `speedMult` and `noiseM` with `Number.isFinite` + range checks, falling back to the existing defaults for non-finite or out-of-range values.
- **Done when:** `?noise=Infinity` and `?x=-5` behave as the defaults; verified via a parsing-helper unit test or manual `?sim=demo` check; `npm test` green.

## COR — Correctness

### COR-001 — Validate trace-point shape and monotonicity on backup import

- **Status:** open · **Severity:** med · **Date:** 2026-07-23
- **Location:** `src/data/exportImport.ts:60` `isValidRun()`
- **Problem:** `isValidRun` checks only `Array.isArray(v.trace)` (element shape unchecked) and trusts the imported `valid`/`durationMs`/`coveragePct` fields verbatim, so a corrupted or hand-edited backup with an out-of-order `trace` and `valid: true` can become `route.bestRunId` via `recomputeBestRunId` and feed `ghost.ts`'s binary search, which assumes sorted `t`/`d` and silently returns wrong brackets instead of erroring.
- **Goal:** In `isValidRun` (or a shared validator called from `importAll`), check every trace element has numeric `t`/`lat`/`lon`/`d` and that `t` and `d` are non-decreasing across the array; reject the run otherwise (alternatively recompute `durationMs`/`valid`/`coveragePct`/`distanceM` from the trace at import time).
- **Done when:** `exportImport.test.ts` has cases rejecting a run with malformed trace elements and a run with out-of-order `t`/`d`; `npm test` green.

### COR-002 — Close the startIdx === endIdx hole in trimEnds' ≥2-point floor

- **Status:** open · **Severity:** low · **Date:** 2026-07-23
- **Location:** `src/core/polyline.ts:122` `trimEnds()`
- **Problem:** The floor clamps `startIdx`/`endIdx` independently and only resets to the full trace when `startIdx > endIdx`; when both land on the same index (trace with exactly one moving fix and jitter within the 15 m radius on both sides), `slice` returns 1 point, violating the documented "never drops below 2 points" contract. Masked today only by `createRouteFromSeed`'s own `trimmed.length < 2` throw (`src/data/repo.ts:74`).
- **Goal:** Change the reset condition at `polyline.ts:122` to `startIdx >= endIdx`, and add a `polyline.test.ts` case with a single moving fix surrounded by near-anchor jitter that exercises the floor branch.
- **Done when:** New test asserts `trimEnds` returns ≥2 points for that trace; `npm test` green.

### COR-003 — Stop matchProgress first-fix teleport + auto-stop misfire on loop routes

- **Status:** fixed · **Severity:** high · **Date:** 2026-07-23
- **Location:** `src/core/progress.ts` `matchProgress()`; `src/core/autostop.ts` `createAutoStopDetector()`
- **Problem:** On a route whose start ≈ end (walked block, loop), the first fix ties between segment 0 and the final segment; the later-segment tie preference plus the monotonic clamp teleported `distAlongM` to ~100%, so auto-stop (near end + slow + coverage) fired ~5-12s into every recording, saving a junk run and exiting the drive screen. Same teleport inflated `validateRun` coverage. Field-reported: "recording exits after max 12 seconds".
- **Resolution:** `matchProgress` now takes a `maxAdvanceM` physical-plausibility budget (`matchAdvanceBudgetM(dtMs)`: 70 m/s × gap + 100m slack) excluding implausible forward jumps; wired into driveController, repo.toTracePoints, and validateRun. Auto-stop additionally arms only after a fix outside the end radius, and the end radius scales down to 5% of route length (floor 15m) on short routes. Regression tests in progress.test.ts + autostop.test.ts. PR #6.

## CQ — Code Quality

### CQ-001 — Clear pendingRouteName after it is consumed

- **Status:** open · **Severity:** low · **Date:** 2026-07-23
- **Location:** `src/ui/screens/DriveScreen.tsx:180` (reader), `src/ui/screens/NewRoute.tsx:15` (only setter)
- **Problem:** The module-level `pendingRouteName` signal is set on Start in `NewRoute` and read in seed-mode `finishAndSave`, but never reset — unlike its sibling `newBestFlashRunId`, which clears itself on read. After a seed drive navigates to `#/route/<id>`, one browser Back press remounts `#/drive-new`; a second seed drive then silently reuses the previous route's name instead of falling back to `'New route'`.
- **Goal:** Set `pendingRouteName.value = ''` immediately after consuming it in `finishAndSave`, mirroring the `newBestFlashRunId` read-and-clear pattern.
- **Done when:** Grep shows the reset next to the read; a second seed run without revisiting `NewRoute` gets the default name (manual check or component test).

### CQ-002 — Remove the inert eslint-disable comments in DriveScreen.tsx

- **Status:** open · **Severity:** low · **Date:** 2026-07-23
- **Location:** `src/ui/screens/DriveScreen.tsx:252,272`
- **Problem:** Two `// eslint-disable-next-line react-hooks/exhaustive-deps` comments exist with no ESLint installed — they are inert and imply a lint gate that doesn't exist, while the effects' dependency arrays still need manual re-verification on change.
- **Goal:** Replace both with plain comments stating why the dependency array is intentionally narrower than exhaustive-deps would demand (or delete them if the arrays are actually complete).
- **Done when:** `grep -rn eslint src/` returns zero hits and each affected effect carries an accurate human-readable comment.

### CQ-003 — Add a load-cancellation guard to RouteDetail's data effects

- **Status:** open · **Severity:** low · **Date:** 2026-07-23
- **Location:** `src/ui/screens/RouteDetail.tsx:24-44`
- **Problem:** `RouteDetail`'s load effects lack the `cancelled` cleanup guard that `RouteList.tsx:18-26` and `DriveScreen.tsx:77-86` both have, so rapid navigation between route details can apply a stale async result after unmount/param change. This is also the third repetition of the `useState<T|null>` + effect-load boilerplate — the checklist's own threshold for extracting a shared `useLoad` hook.
- **Goal:** Extract a shared `useLoad` hook (with cancellation) and use it in all three screens, or minimally add the `cancelled` guard to `RouteDetail`'s effects.
- **Done when:** All three screens guard against post-unmount/stale application of async loads; `npm test` and `npm run build` green.

## TEST — Testing

### TEST-001 — Add an off-corridor-and-return coverage case to validate.test.ts

- **Status:** open · **Severity:** low · **Date:** 2026-07-23
- **Location:** `src/core/validate.test.ts` (gap; guards `src/core/validate.ts:37` `validateRun()`)
- **Problem:** The correctness checklist cites the half-coverage test as the gate for coverage accumulation across an off-corridor excursion, but no test constructs a trace that leaves the corridor mid-route and returns — the code is correct today (running max over a monotonic `distAlongM`), but a regression in the `matchProgress`-clamp/`maxInCorridorDistM` interaction would go undetected.
- **Goal:** Add a `validate.test.ts` case: trace in-corridor to distance X, off-corridor (`offRouteM > corridorM`) for a stretch, then back in-corridor further along; assert `coveragePct` reflects the furthest in-corridor distance (neither summed nor reset).
- **Done when:** The new case exists and passes in `npm test`.

### TEST-002 — Cover timeScale !== 1 in driveController.test.ts

- **Status:** open · **Severity:** low · **Date:** 2026-07-23
- **Location:** `src/services/driveController.test.ts` (gap; guards `src/services/driveController.ts:142`)
- **Problem:** No test passes `timeScale` — every controller instantiation omits it, leaving the demo/replay wall-clock smoothing line `(Date.now() - startedAt) * timeScale` unexercised, though `DriveScreen.tsx:245` relies on it for demo/replay speed.
- **Goal:** Add a `driveController.test.ts` case constructing the controller with `timeScale: 4` (fake timers), asserting `elapsedMs`/ghost position between fixes advance at the scaled rate and stay consistent with the fix-driven authoritative path.
- **Done when:** The new case passes in `npm test`.

### TEST-003 — Add a shape test for public/fixtures/demo-drive.json

- **Status:** open · **Severity:** low · **Date:** 2026-07-23
- **Location:** `public/fixtures/demo-drive.json` (no guarding test); generator `scripts/make-fixture.mjs`
- **Problem:** The `?sim=demo` path loads the committed fixture with no automated check that it matches the `RawFix` shape (numeric `t`/`lat`/`lon`, sorted `t`), so a bad regeneration only surfaces on a manual demo load. The current fixture is valid (200 elements, well-formed).
- **Goal:** Add a small Vitest case that imports/reads the fixture and asserts every element has finite numeric `t`/`lat`/`lon` (plus `acc`/`spd` when present) and strictly increasing `t`.
- **Done when:** The new case passes in `npm test` and fails if the fixture is corrupted.

### TEST-004 — Cover bestRunId displacement by a partial-merge import

- **Status:** open · **Severity:** low · **Date:** 2026-07-23
- **Location:** `src/data/exportImport.test.ts` (gap; guards `src/data/exportImport.ts:130-148`)
- **Problem:** The recompute logic correctly lets a faster imported run displace an existing route's `bestRunId` (it reuses `recomputeBestRunId`), but no test exercises "existing local route + imported faster run" — the round-trip test only checks preservation and the merge test only adds a brand-new route.
- **Goal:** Add an `exportImport.test.ts` case: create a route with a slow run locally, import a payload containing a faster run for that same `routeId`, assert `bestRunId` becomes the imported run's id.
- **Done when:** The new case passes in `npm test`.

## DATA — Data/Storage

### DATA-001 — Validate polyline/cumDistM elements on backup import

- **Status:** open · **Severity:** med · **Date:** 2026-07-23
- **Location:** `src/data/exportImport.ts:46-58` `isValidRoute()`
- **Problem:** `polyline`/`cumDistM` are checked only with `Array.isArray` — a corrupted backup element (non-numeric `lat`/`lon`/`cumDistM` entry) passes validation and makes `matchProgress`'s arithmetic `NaN`, so off-route detection never fires for that route on every future drive, and `MapView` feeds the same garbage into `L.polyline`. Element-level sibling of [[SEC-001]] (top-level fields) and COR-001 (trace elements) — fix them together.
- **Goal:** In `isValidRoute`, require every `polyline` element to be a plain object with finite `lat`/`lon`, and every `cumDistM` element to be a finite number.
- **Done when:** `exportImport.test.ts` rejects a route with a bad `polyline` element and a bad `cumDistM` element; `npm test` green.

### DATA-002 — Wrap importAll's writes in one Dexie transaction

- **Status:** open · **Severity:** med · **Date:** 2026-07-23
- **Location:** `src/data/exportImport.ts:114-148` `importAll()`
- **Problem:** The route/run `add` loops and the `bestRunId` recompute run as separate awaited calls; a mid-loop failure (e.g. IndexedDB quota) commits a partial import with no rollback and skips the `bestRunId` recompute, while the UI's "Import failed" message and the function's own "nothing is written" doc comment claim otherwise. Merge-by-id makes a re-import mostly self-healing, but the stated guarantee is false for write-phase failures.
- **Goal:** Wrap the write loops plus the recompute loop in a single `db.transaction('rw', db.routes, db.runs, ...)` so any write failure rolls back atomically.
- **Done when:** A test injecting a failing `add` mid-import (fake-indexeddb or a Dexie hook) leaves the DB unchanged; `npm test` green.

### DATA-003 — Handle export failures in Settings.handleExport

- **Status:** open · **Severity:** high · **Date:** 2026-07-23
- **Location:** `src/ui/screens/Settings.tsx:35-49` `handleExport()`
- **Problem:** No try/catch: if `exportAll()` throws (e.g. `JSON.stringify` `RangeError` or Blob allocation failure once history grows to hundreds of MB — realistic per DATA-006's growth math), the rejection is unhandled and the user gets zero feedback that their only backup path silently failed. The backup is the sole restore mechanism for the entire drive history.
- **Goal:** Wrap `handleExport` in try/catch and surface failures via an on-screen message (mirroring `handleFileChosen`'s `importMessage` pattern); keep `lastBackupAt` updated only on success (already ordered correctly).
- **Done when:** A forced `exportAll` throw shows a visible error and leaves `lastBackupAt` unchanged; `npm test` green.

### DATA-004 — Surface backup staleness and eviction risk outside Settings

- **Status:** open · **Severity:** high · **Date:** 2026-07-23
- **Location:** `src/ui/screens/RouteList.tsx` (no indicator); `src/ui/screens/Settings.tsx:91,107-119`
- **Problem:** Backup age and best-effort-storage status render only as passive text inside Settings; the home screen has no signal at all. A user who never opens Settings gets no warning before Safari's 7-day non-installed-site eviction can wipe the only copy of their history. (Overlaps the UX checklist's "requestPersistentStorage is silent" item — this entry is the canonical one.)
- **Goal:** Add a dismissible banner/nudge on `RouteList` when `lastBackupAt` is null or older than ~5 days (or storage is non-persisted), linking to Settings export; escalate the Settings backup-age line visually as it approaches 7 days.
- **Done when:** With `lastBackupAt` null/stale, the home screen shows the nudge; with a fresh backup and persisted storage it doesn't; verified by component test or manual check.

### DATA-005 — Make saveRun/deleteRun's run-write + bestRunId update atomic

- **Status:** open · **Severity:** med · **Date:** 2026-07-23
- **Location:** `src/data/repo.ts:157-163` `saveRun()`, `:246-249` `deleteRun()`
- **Problem:** The runs write and `db.routes.update({ bestRunId })` are two separate awaited calls. Dying between them leaves `bestRunId` stale (saveRun: a faster new run isn't reflected) or dangling (deleteRun: points at a deleted run, silently disabling the ghost/best-time display) until the next successful write to that route — `listRoutesWithStats` and `DriveScreen` trust `bestRunId` without recomputation.
- **Goal:** Wrap each pair in `db.transaction('rw', db.runs, db.routes, ...)`.
- **Done when:** Both call sites are transacted; existing `repo.test.ts` still green; `npm test` green.

### DATA-006 — Decide and bound Run.trace growth

- **Status:** open · **Severity:** med · **Date:** 2026-07-23
- **Location:** `src/data/repo.ts:16-47` `toTracePoints()` (1:1 mapping, no decimation)
- **Problem:** Confirmed: `run.trace` is never downsampled or capped (only `route.polyline` is simplified). At ~1 Hz a 40-min commute is ~2400 points (~220 KB compact per run); a twice-daily commuter accrues ~160 MB/yr in IndexedDB and ~260 MB/yr of export blob — on a multi-year trajectory toward iOS Safari quota/eviction pressure and export failure (see [[DATA-003]]), with no in-app size awareness.
- **Goal:** Make an explicit product decision: either document unbounded growth as accepted (relying on persistent storage + backups) as a wontfix here, or add trace decimation (e.g. `simplifyM`-style or every-Nth thinning) above a point-count threshold, preserving `t`/`d` monotonicity.
- **Done when:** Decision recorded in this entry (wontfix) or decimation implemented with tests proving monotonicity and bounded size; `npm test` green.

### DATA-007 — Transact deleteRoute and clean up orphaned runs

- **Status:** open · **Severity:** low · **Date:** 2026-07-23
- **Location:** `src/data/repo.ts:252-254` `deleteRoute()`
- **Problem:** Runs are deleted before the route with no transaction; interruption leaves a zombie route with a dangling `bestRunId` (recoverable by retrying delete). Separately, orphaned runs (`routeId` with no matching route — a case `importAll` itself anticipates) are never queried or cleaned by anything, becoming invisible full-trace dead storage.
- **Goal:** Wrap `deleteRoute` in `db.transaction('rw', db.runs, db.routes, ...)`; add an orphan sweep (startup or Settings) that deletes runs whose `routeId` has no route.
- **Done when:** deleteRoute is atomic; an orphaned-run fixture is removed by the sweep in a test; `npm test` green.

### DATA-008 — Merge-by-id import never propagates edits to existing records

- **Status:** wontfix · **Severity:** low · **Date:** 2026-07-23
- **Location:** `src/data/exportImport.ts:78-85,119-128` `importAll()`
- **Problem:** Import skips any record whose id exists locally, so an edit (e.g. a route rename) carried in a backup can never update a stale local copy, silently and without signal — even though `Route.name`/`bestRunId` are mutable.
- **Resolution:** Deliberate design: skip-never-overwrite is simple, predictable, and tested; the realistic restore scenario (fresh/empty DB after data loss) has no conflicts, and bestRunId is recomputed for routes gaining runs. Revisit only if multi-device use becomes a goal.

## PERF — Performance

### PERF-001 — Stop the controller on DriveScreen unmount and on geolocation error

- **Status:** open · **Severity:** high · **Date:** 2026-07-23
- **Location:** `src/ui/screens/DriveScreen.tsx:268-273` (unmount cleanup releases only the wake lock); `src/services/driveController.ts:195-198` `onError()`
- **Problem:** Navigating away mid-recording (back gesture, hash edit) unmounts `DriveScreen` without calling `controller.stop()`, leaving the 1-second `setInterval` and the `navigator.geolocation.watchPosition` watch running indefinitely — a battery/GPS-radio leak — while the in-progress run is silently discarded. `onError` likewise sets `state = 'error'` without clearing the interval or stopping the source, so an error mid-drive leaks the same resources.
- **Goal:** Add an unmount cleanup in `DriveScreen` that stops the active controller (discarding is fine, leaking isn't — or prompt/save, see the UX checklist's abandonment item); make `onError` perform `stopInternal`-equivalent cleanup (`source.stop()` + `clearInterval`) before setting the error state.
- **Done when:** A `driveController.test.ts` case asserts no further signal writes/timer ticks after an error; unmount-while-recording verified to clear the watch (test or manual); `npm test` green.

### PERF-002 — Stop loading full traces (twice) for the home-screen route list

- **Status:** open · **Severity:** med · **Date:** 2026-07-23
- **Location:** `src/data/repo.ts:187,196` `listRoutesWithStats()`; `:214` `getEtaForRoute()`
- **Problem:** Per route, `listRoutesWithStats` fetches all full `Run` rows (including complete `trace` arrays) and then calls `getEtaForRoute`, which re-runs the identical query — every route's traces are deserialized twice on every home-screen mount, with cost growing linearly with total history (see [[DATA-006]] for the growth math).
- **Goal:** Fetch runs once per route and compute the ETA from the in-memory rows; longer-term, keep a lightweight run-summary projection (durationMs, valid, dow, hour, startedAt) so list/stat views (and `recomputeBestRunId`) never load `trace` at all.
- **Done when:** One query per route per mount (verified by test or a Dexie hook counter); `repo.test.ts` green; home-screen behavior unchanged.

### PERF-003 — Make the seed-mode follow-cam deliberate instead of accidental

- **Status:** open · **Severity:** med · **Date:** 2026-07-23
- **Location:** `src/ui/map/MapView.tsx:117-119` (fix-effect `setView` guarded by a latch that is only ever set in the route-polyline effect at `:79-82`)
- **Problem:** In route mode `fitBounds` sets `hasFitRef` and the map correctly stays on the full-route view; in seed mode (`#/drive-new`, no polyline) the latch is never set, so `map.setView(latlng, FIX_ZOOM)` re-fires on every ~1 Hz fix for the entire recording — an unthrottled accidental follow-cam that also snaps zoom back to 16 every second (fighting any user pinch/pan) and churns tile DOM against Leaflet's default `keepBuffer`.
- **Goal:** Decide the seed-mode behavior explicitly: keep a follow-cam but make it deliberate — `map.panTo` only when the dot nears the viewport edge (or throttled), preserving user zoom — or center once on the first fix and set the latch. If a continuous follow-cam stays, raise `keepBuffer` (e.g. 4-6) to cut tile churn.
- **Done when:** Seed-mode recording no longer resets zoom per fix; behavior documented in a comment; manual `?sim=demo` seed-drive check.

### PERF-004 — Code-split Leaflet out of the first-paint bundle

- **Status:** open · **Severity:** low · **Date:** 2026-07-23
- **Location:** `src/ui/app.tsx:2-6` (all screens statically imported); `src/ui/screens/DriveScreen.tsx:17` → `src/ui/map/MapView.tsx:2-3`
- **Problem:** Everything lands in one 288 KB chunk (`dist/assets/index-*.js`), with Leaflet (~150 KB) the dominant contributor, so the map-free route-list first paint pays for the whole map stack. Mitigated after first visit by SW precache; the fixture-precache concern in the checklist is unfounded (demo-drive.json is not precached).
- **Goal:** Dynamically `import()` `MapView` (the whole Leaflet chain) from `DriveScreen` behind a small loading state, producing a separate lazy chunk.
- **Done when:** `dist/assets` shows a distinct map/leaflet chunk not loaded on `#/`; `npm run build` and `npm test` green; demo drive still renders the map.

### PERF-005 — Split 1 Hz signal readouts out of DriveScreen's render body

- **Status:** open · **Severity:** low · **Date:** 2026-07-23
- **Location:** `src/ui/screens/DriveScreen.tsx:259,327-339` (14 direct signal reads in the render body)
- **Problem:** `elapsedMs` (1 Hz tick) and `lastFix` (~1 Hz) each re-render the entire component tree — including the always-mounted `MapView` element and, when enabled, the debug panel — roughly twice per second for the whole drive. Correct but wasteful; actual jank cost requires on-device profiling.
- **Goal:** Move hot readouts (elapsed/delta chips, debug panel) into child components that read only their own signals so a single-signal update re-renders only its widget.
- **Done when:** Top-level `DriveScreen` no longer reads per-second signals directly in its render body; behavior unchanged in a manual `?sim=demo` drive.

## UX — UX/Accessibility

### UX-001 — Give the geolocation-denied state actionable copy and a labeled exit

- **Status:** open · **Severity:** med · **Date:** 2026-07-23
- **Location:** `src/services/geolocationSource.ts:24-26` (raw `err.message` passed through); `src/ui/screens/DriveScreen.tsx:342-343` (status pill)
- **Problem:** A denied permission surfaces the browser's raw non-localized error text in the status pill with no guidance and no retry path; the only escape is the hold-to-stop button, which reads as "stop recording", then alerts "No GPS data was recorded". First-run users hitting the iOS permission prompt wrong get a dead end.
- **Goal:** Branch on `err.code`: for `PERMISSION_DENIED` show actionable copy (enable in iOS Settings → Privacy → Location Services) and a clearly labeled "Go back" affordance in the error state; keep raw text only as a fallback detail.
- **Done when:** Simulated `PERMISSION_DENIED` shows the guidance and a labeled exit; `npm test` green (error-copy mapping unit-testable).

### UX-002 — Make invalid-run reasons reachable on touch devices

- **Status:** open · **Severity:** med · **Date:** 2026-07-23
- **Location:** `src/ui/screens/RouteDetail.tsx:98-100` `.warning-icon`
- **Problem:** The ⚠ icon exposes `run.reasons` only via a `title` attribute; `title` tooltips never fire on tap in mobile Safari, so on the app's target platform the reason a run was flagged invalid is unreachable.
- **Goal:** Make the icon tappable (inline expand or small popover showing `reasons`), or render the reasons as always-visible secondary text on the run row; include an `aria-label`.
- **Done when:** Reasons are readable by tap (or always visible) on a touch device; verified manually or by component test.

### UX-003 — Raise the run-row Replay/Delete touch targets to 44px

- **Status:** open · **Severity:** low · **Date:** 2026-07-23
- **Location:** `src/ui/styles.css:148-152` `.btn-small`; used at `src/ui/screens/RouteDetail.tsx:103-111`
- **Problem:** `.btn-small` is `min-height: 36px` while every other interactive element in the app uses 44px; Replay and Delete sit adjacent with the standard 12px gap, so miss-tolerance is worst exactly where a destructive action lives. Mitigated by the `confirm()` gate on delete.
- **Goal:** Raise `.btn-small` to `min-height: 44px` (adjust padding/typography to keep the row compact) or widen the gap between Replay and Delete.
- **Done when:** Both buttons measure ≥44px tall; visual check of the run rows.

### UX-004 — Give the wake-lock warning visual weight matching its urgency

- **Status:** open · **Severity:** low · **Date:** 2026-07-23
- **Location:** `src/ui/styles.css:313-317` `.wake-lock-warning`; rendered `src/ui/screens/DriveScreen.tsx:378-380`
- **Problem:** "screen may sleep — keep the app open" demands driver action but renders as a single static 12px amber line with no icon, pulse, or haptic cue, nested under the primary status word. Contrast is fine (7.75–9:1); weight is the issue.
- **Goal:** Add a small icon and a brief one-time pulse/highlight when the warning first appears (no persistent animation — driver distraction).
- **Done when:** The warning visibly announces itself on first appearance in a manual check; copy and calm styling otherwise unchanged.

## BLD — Build/Packaging

### BLD-001 — Guard deploy.sh against shipping non-main or dirty state

- **Status:** open · **Severity:** med · **Date:** 2026-07-23
- **Location:** `scripts/deploy.sh` (before the `npm test` at line 8)
- **Problem:** The script builds and force-pushes whatever is currently on disk — uncommitted edits or a non-`main` branch ship straight to production `gh-pages` with no guard. Tests/build gate quality but not provenance.
- **Goal:** Before `npm test`, refuse to proceed unless `git rev-parse --abbrev-ref HEAD` is `main` and `git diff-index --quiet HEAD --` reports a clean tree (a non-checkout directory then also fails safely under `set -e`).
- **Done when:** Running deploy.sh on a branch or with local edits aborts with a clear message; a clean `main` deploys as before.

### BLD-002 — autoUpdate service worker with no deploy rollback path

- **Status:** wontfix · **Severity:** low · **Date:** 2026-07-23
- **Location:** `vite.config.ts:10` `registerType: 'autoUpdate'`
- **Problem:** A broken shell that slips past the local test+build gate auto-activates on installed clients at next visit, and deploy.sh has no rollback; `prompt` mode would add a consent gate.
- **Resolution:** Accepted: single-user app where the developer is the user; deploy.sh's `npm test && npm run build` gate plus redeploy-to-fix keeps recovery one command away, and prompt-mode update UI isn't worth the complexity. Revisit if the app gains other users.

### BLD-003 — Defer service-worker update reload while a recording is live

- **Status:** open · **Severity:** med · **Date:** 2026-07-23
- **Location:** `vite.config.ts:12` `registerType: 'autoUpdate'`
- **Problem:** Distinct from [[BLD-002]] (rollback): `autoUpdate`'s injected registration reloads the page as soon as a newly-deployed SW activates. If that happens mid-recording (deploy landed between app launch and the drive), the reload discards the in-progress run — unrecoverable data loss in an app whose whole point is the recording.
- **Goal:** Keep autoUpdate semantics but gate the reload on recording state: use `registerSW`'s manual wiring (or `onNeedRefresh`) so the update is applied/reloaded only when no drive controller is in `acquiring`/`recording` (e.g. defer until navigation back to the route list).
- **Done when:** A deploy while a (simulated `?sim=demo`) recording is live does not interrupt it, and the update applies after the run ends; `npm test` + `npm run build` green.
