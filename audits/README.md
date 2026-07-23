# Audits

Reusable audit workflow for tomtom: one inspection checklist per category,
grounded in this repo's actual files, plus [FINDINGS.md](FINDINGS.md) — the
ledger every finding lives in as `open / fixed / wontfix` until resolved.

| Category | File | Focus (this repo's hot spots) |
|---|---|---|
| SEC | [security.md](security.md) | Backup-import JSON, URL params, DOM sinks |
| COR | [correctness.md](correctness.md) | Epoch/relative timestamp contracts, monotonic d |
| CQ | [code-quality.md](code-quality.md) | DriveScreen mode sprawl, layering rules |
| TEST | [testing.md](testing.md) | Browser-boundary seams, no-CI gate discipline |
| DATA | [data-storage.md](data-storage.md) | Single-copy IndexedDB, backup integrity, growth |
| PERF | [performance.md](performance.md) | Hour-long 1 Hz drive loop, full-trace queries |
| UX | [ux-accessibility.md](ux-accessibility.md) | Driver glanceability, permission dead ends |
| BLD | [build-packaging.md](build-packaging.md) | No-CI gates, deploy.sh force-push, SW updates |

Dropped: FEAT (no spec docs to diff against — the plan file lives outside the
repo), DOC (README is a paragraph; fold doc issues into CQ).

## Running an audit

1. **Read the ledger first** (`FINDINGS.md`) so known/triaged findings aren't
   re-surfaced.
2. Work the category checklist top to bottom; every item names the exact
   files/functions to inspect.
3. Record genuinely new findings in the ledger under the category section,
   using the template there.
4. Resolve in place — never delete ledger entries.

## The three tiers

1. **Deterministic gates** (cheapest, every change): `npm test` (Vitest, 86+)
   and `npm run build` (tsc strict + vite). No CI exists — these run locally
   pre-merge and again inside `scripts/deploy.sh`. Checklist items covered by
   a gate say so.
2. **Per-PR review** (primary mechanism): `/code-review` + `/security-review`
   on each PR, triaged against the ledger; only confirmed new findings get
   logged.
3. **Whole-repo sweeps** (most expensive, per-release): `/audit-sweep
   <category>` — one category per run, per release cadence.
