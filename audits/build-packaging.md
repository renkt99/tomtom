# BLD — Build & Packaging

The biggest risk: **nothing outside the developer's own hands enforces the
gate**. There is no CI by hard constraint (`.github/` must never exist — the
account has no Actions minutes), so `npm test` + `npm run build` only run if
someone runs them, and `scripts/deploy.sh` force-pushes `dist/` built from
whatever is checked out — not necessarily merged `main`. Compounding that,
the `autoUpdate` service worker means a bad deploy keeps serving installed
clients until the next visit after a fix. Ledger prefix: **BLD**.

## Gate discipline

- [ ] `package.json` `scripts.build` = `tsc --noEmit && vite build` — confirm the `&&` so a type error blocks `dist/` production.
- [ ] `tsconfig.json` `strict` (+ `noUnusedLocals`/`noUnusedParameters` if enabled) hasn't regressed — a local-only gate is worthless if strictness erodes with no CI to notice.
- [ ] `scripts.test` (`vitest run`) is exactly what `scripts/deploy.sh` invokes — verify no divergent looser config appears (e.g. a vitest.config exclusion).

## Deploy script safety

- [ ] `scripts/deploy.sh` keeps `set -euo pipefail` with `npm test` and `npm run build` BEFORE any git operation — watch for `|| true` or reordering; a failing test must abort before `git push -f`.
- [ ] deploy.sh ships the current checkout, not `origin/main` — verify the discipline (or add a guard: refuse if branch ≠ main or tree dirty) so a force-push can't ship unmerged/uncommitted state.
- [ ] The force-push targets only `gh-pages:gh-pages` with the hardcoded repo URL — confirm no edit can point it at `main`.
- [ ] `touch dist/.nojekyll` survives future edits.
- [ ] `.github/` still does not exist anywhere in the repo (hard constraint: zero Actions usage; see README Deploy section).

## PWA / service-worker update behavior

- [ ] `vite.config.ts` `registerType: 'autoUpdate'` — confirm this remains the intended choice vs `prompt`, given deploy.sh has no rollback path if a broken shell ships.
- [ ] `workbox.runtimeCaching` `osm-tiles` (`CacheFirst`, `maxEntries: 400`, `maxAgeSeconds: 14 d`): bounds still appropriate and `urlPattern` still matches the tile host actually used in `MapView.tsx`.
- [ ] Manifest `start_url`/`scope` match `base: '/tomtom/'` and the deployed path — a mismatch breaks installed-PWA scoping.
- [ ] Post-build `dist/index.html` contains the injected manifest link + `registerSW.js` — re-check after any vite/vite-plugin-pwa major bump.

## Dependency / toolchain pinning

- [ ] `package-lock.json` committed and in sync; deploys/checks use `npm ci`-equivalent state (no CI lockfile-drift check exists).
- [ ] `typescript@^7` (tsgo) is a new major line — confirm `tsc --noEmit` resolves to the intended binary and note behavior changes on upgrades (`src/vite-env.d.ts` was already needed for CSS side-effect imports).

## Generated-asset reproducibility

- [ ] `node scripts/make-icons.mjs` reproduces the committed `public/icons/icon-{180,192,512}.png` byte-identically — catches drift between generator edits and committed output.
- [ ] Icon sizes match every consumer: `index.html` `apple-touch-icon` (180) and manifest `icons[]` (192/512).
- [ ] `node scripts/make-fixture.mjs` is deterministic (fixed seed/start time) and reproduces the committed `public/fixtures/demo-drive.json` byte-identically.
