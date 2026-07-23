# DATA — Data Storage & Persistence

The entire drive history lives in exactly one place: IndexedDB on the phone
(`src/data/db.ts`). No server copy — any bug that loses a record loses it
forever. Safari evicts IndexedDB for non-installed sites unused 7 days, and
`exportImport.ts`'s JSON backup is the *only* restore path: a bug in export
completeness or merge logic silently and permanently destroys history. Also:
`Run.trace` stores full `TracePoint[]` at ~1/s (~2400 points per 40-min
commute) with no pruning — the single copy of the data is growing unbounded.
Ledger prefix: **DATA**.

## Schema & migrations

- [ ] `src/data/db.ts`: verify the `version(1)` → `version(2)` chain stays purely additive (v2 only adds `settings: 'key'`; `routes`/`runs` index strings byte-identical to v1) so Dexie upgrades never fail against a real phone's existing v1 database.
- [ ] Any future schema change must be a **new** `version(3)` block, never an edit to the existing `version(1)`/`version(2)` `stores()` calls — editing history breaks upgrades for phones already past that version.

## Backup / restore integrity

- [ ] `exportAll()` serializes only `db.routes` + `db.runs`, not `db.settings` — verify the omission stays harmless (currently just `lastBackupAt`) and flag if a future settings key becomes restore-worthy.
- [ ] `isValidRoute`/`isValidRun` check top-level field types only — nested shapes (`polyline`/`cumDistM`/`trace` elements, `reasons` elements) are unchecked. `exportImport.test.ts`'s malformed-input test covers only missing top-level fields; treat nested corruption as untested.
- [ ] Merge-by-id in `importAll()`: existing ids are skipped, never overwritten (gate: `exportImport.test.ts` re-import-skips test) — verify skip-never-overwrite remains the intended semantics (an edited route in a backup can never replace a stale local copy).
- [ ] `importAll()`'s `db.*.add` calls run in a plain loop, not one `db.transaction('rw', ...)` — verify what state a mid-loop failure (e.g. quota exceeded) leaves: partial import with no rollback, contradicting the "nothing is written" doc comment (true only for pre-validation failures).
- [ ] `version !== 1` payloads are hard-rejected — confirm no best-effort partial import, and that a migration plan exists before `EXPORT_VERSION` ever bumps.
- [ ] `Settings.tsx` `handleFileChosen`: both `JSON.parse` failures and `importAll` throws must surface via `importMessage` — a failed import must never look like success.

## Eviction & persistence

- [ ] `requestPersistentStorage()` is called from `DriveScreen.tsx` after both `createRouteFromSeed` and `saveRun` — verify these call sites survive refactors; a user who never opens Settings still needs the persist request fired.
- [ ] `Settings.tsx` persistence status + "Request persistent storage" button and the last-backup nudge: verify the messaging prompts an export meaningfully before Safari's 7-day eviction window, not after.

## Growth / pruning

- [ ] Confirm there is genuinely no downsampling/capping of `Run.trace` in `repo.ts` and estimate worst-case growth (runs × ~2400 points) against mobile quotas — the single largest and only unbounded field in the schema.
- [ ] Export flow (`exportAll` Blob + `<a download>` in `Settings.tsx`): verify it doesn't silently fail/truncate once data grows large (iOS Safari Blob/memory limits) — a backup the user believes exists but is truncated is worse than none.

## Transactional integrity

- [ ] `saveRun`/`deleteRun`: the runs write and the `db.routes.update({ bestRunId })` are two separate awaited calls, not one transaction — verify what `bestRunId` looks like if the app dies between them (gates cover only the happy path: `repo.test.ts`).
- [ ] `recomputeBestRunId` after a *partial merge* import: verify an imported faster run displaces the local `bestRunId` exactly as a live `saveRun` would — `exportImport.test.ts` round-trip only checks preservation, not partial-merge recompute.
- [ ] `deleteRoute` (delete runs, then route — un-transacted): verify interrupted-between-deletes behavior; orphaned runs pointing at a deleted `routeId` are anticipated by `importAll`'s own comments but untested.
