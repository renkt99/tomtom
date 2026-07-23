# tomtom

Personal drive-tracking PWA (Preact + TypeScript + Vite + Leaflet + Dexie).
Design doc: `~/.claude/plans/i-want-to-build-tranquil-frost.md`. All user data
is on-device IndexedDB — there is no server; data-loss bugs are unrecoverable.

## Hard constraints

- **No GitHub Actions, ever.** `.github/` must not exist — the account has no
  Actions minutes. There is no CI: the merge gate is running `npm test` and
  `npm run build` locally and only merging when both pass.
- Deploys: `./scripts/deploy.sh` (tests + build, force-push `dist/` to
  `gh-pages`; Pages branch source) → https://renkt99.github.io/tomtom/.
- Layering: `src/core/` is pure (no imports outside core, no DOM);
  `src/services/` imports core only; leaflet only under `src/ui/map/`.
- Timestamps: `RawFix.t` is epoch ms; `TracePoint.t` is run-relative ms;
  `TracePoint.d` is monotonic by construction. Breaking these contracts
  corrupts stored runs — see `audits/correctness.md`.
- GPS features are developed against the simulator (`?sim=demo`, per-run
  Replay, `?x=` speed, `?debug=1` panel), not real drives.

## Audit workflow

`audits/` holds per-category inspection checklists grounded in this repo's
files, plus `audits/FINDINGS.md` — the ledger where every finding lives as
`open / fixed / wontfix`. **Ledger first**: before reporting any finding,
check it isn't already triaged there; resolve entries in place, never delete.
Per-PR `/code-review` + `/security-review` (triaged against the ledger) are
the primary review mechanism; `/audit-sweep <category>` runs a whole-repo
sweep of one category, per-release cadence.
