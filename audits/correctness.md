# COR — Correctness

The biggest correctness risk is timestamp handling across the recording
boundary: `RawFix.t` is epoch ms, `TracePoint.t` is run-relative ms, and
`simulatedSource.ts` synthesizes a third form (compressed-delivery wall time
carrying original-interval offsets). A mismatch silently corrupts
`startedAt`/`dow`/`hour`/`durationMs` in `repo.ts` or produces negative
`TracePoint.t` — this exact bug class has already occurred once. Second-order
risk: breaks in the monotonicity invariants (`TracePoint.d` non-decreasing,
`trace[].t` sorted) that `progress.ts`/`ghost.ts`/`delta.ts` assume without
re-checking. Ledger prefix: **COR**.

## Timestamp contract (controller / simulator / repo boundary)

- [ ] `src/services/driveController.ts`: confirm `stop()`/`stopInternal()` returns `{ rawFixes, startedAt }` with **epoch**-ms values (not `trace[].t`, which is run-relative). Gate: `driveController.test.ts` asserts `result.startedAt === fixes[0].t` and every `rawFixes[i].t >= startedAt` — verify the assertion still targets `rawFixes`/`startedAt` if the test is edited.
- [ ] `src/services/simulatedSource.ts` `emit()`: verify `t: startWall + (fix.t - baseT)` reproduces the *original* inter-fix gaps regardless of `speedMult` (only delivery scheduling is compressed), so `filter.ts`'s implied-speed gate and `delta.ts` see real drive-time. Gate: `simulatedSource.test.ts` "retimes spacing…" (asserts `received[1].t === now + 2000`).
- [ ] `src/data/repo.ts` `toTracePoints()`: verify `t: f.t - startedAt` is computed against the same epoch `startedAt` passed into `saveRun`/`createRouteFromSeed` — a caller passing relative-time fixes would produce valid-looking but wrong `Run.durationMs`/`dow`/`hour`.
- [ ] `driveController.ts` `onFix()`: confirm `elapsedMs`/`ghostPos`/`deltaMs` are driven by `fix.t - startedAt` (authoritative) with the `setInterval` wall-clock tick (`(Date.now() - startedAt) * timeScale`) only as the between-fixes display smoother — mixing them under `timeScale !== 1` desyncs the ghost.

## progress.ts — map matching (everything downstream depends on this)

- [ ] `matchProgress` in `src/core/progress.ts`: verify `distAlongM` never regresses — `Math.max(hint.distAlongM, candidateDistAlongM)` on the accept path, and the off-corridor early return preserves `hint.distAlongM` unchanged. Gate: `progress.test.ts` monotonic-clamp test.
- [ ] The window `[hint.segIdx - 2, hint.segIdx + 20]` and the `offsetM <= bestOffsetM` tie-break (prefers higher index): verify an out-and-back route's return leg can't be matched before genuinely finishing the outbound leg, and window clamping at polyline ends can't strand `bestIdx`. Gate: `progress.test.ts` out-and-back test.
- [ ] `segCount < 1` (degenerate polyline) returns `{ ...hint }` unchanged — confirm no caller (`validateRun`, `driveController`, `repo.toTracePoints`) dereferences `route.cumDistM[...]` before this guard.

## ghost.ts / delta.ts — time↔distance interpolation

- [ ] `timeAtDistance` in `src/core/ghost.ts`: verify the lower-bound binary search returns the **earliest** `t` on a `d`-plateau (stopped car), with `frac` resolving to `a.t` when `span === 0`. Gates: `ghost.test.ts` plateau test + `delta.test.ts` stopped-plateau test.
- [ ] `ghostPositionAt`/`timeAtDistance` assume `trace[].t` and `trace[].d` are sorted ascending "by construction" — verify every producer of a `bestTrace` (`repo.toTracePoints`, replay path) actually guarantees this; a corrupted/imported best run would make the binary search silently return a wrong bracket rather than erroring.
- [ ] `computeDeltaMs` in `src/core/delta.ts`: sign convention (positive = behind) must match the UI's green/red + −/+ labeling in `DriveScreen.tsx`/`formatDeltaMs`. Gate: `delta.test.ts` slower-second-half test.

## polyline.ts — route geometry from the seed run

- [ ] `trimEnds`: verify the ≥2-point floor and the `startIdx > endIdx` fallback can't produce a 1-point trimmed trace that `createRouteFromSeed`'s `trimmed.length < 2` throw must then catch. Gate: `polyline.test.ts` "keeps at least 2 points…".
- [ ] `simplifyM` Douglas-Peucker: epsilon comparison must use metric `offsetM` via `projectOntoSegment`, not raw degrees, so 10 m means 10 m at any latitude. Gate: `polyline.test.ts` within-epsilon test.
- [ ] `buildCumDist`: `cumDistM` must always be exactly `polyline.length` long (including the empty case) since `matchProgress` indexes `cumDistM[bestIdx + 1]`.

## eta.ts — bucket ladder and weighted median

- [ ] `estimateEtaMs` ladder (exact bucket ≥ `MIN_BUCKET` → daytype±adjacent bands → daytype all-hours → route-wide): verify boundary behavior — weekend runs fully excluded from weekday fallbacks. Gate: `eta.test.ts` weekend-exclusion test.
- [ ] `weightedMedian`: verify the exactly-on-half straddle case (`Math.abs(cum - half) <= EPSILON`) and the shrinkage blend `(n·basisMedian + K·routeMedian)/(n + K)` at `n === MIN_BUCKET`. Gates: `eta.test.ts` straddle + shrinkage tests.

## repo.ts — bestRunId and dow/hour derivation

- [ ] `recomputeBestRunId` (sort by `durationMs` then `startedAt`, filter `valid`): verify `saveRun` AND `deleteRun` both call it so deleting the current best promotes the next-fastest instead of dangling. Gate: `repo.test.ts` deleteRun test.
- [ ] `dowAndHour` uses local-timezone `getDay()`/`getHours()` on epoch `startedAt` — verify every call site passes epoch (not relative) ms; a relative value silently misclassifies the run's ETA bucket.

## validate.ts / autostop.ts — end-of-run gating

- [ ] `validateRun` coverage accumulation vs `matchProgress`'s monotonic clamp: verify a trace going off-corridor mid-route and returning is neither double- nor under-counted in `coveragePct`. Gate: `validate.test.ts` half-coverage rejection.
- [ ] `createAutoStopDetector`: verify `dwellStartT` resets the instant any of nearEnd/slow/coverageOk goes false, and `driveController.ts` never wires it during `opts.replay`. Gates: `autostop.test.ts` dwell-reset test + `driveController.test.ts` no-auto-stop-in-replay test.
