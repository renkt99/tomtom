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

_none yet._

## COR — Correctness

_none yet._

## CQ — Code Quality

_none yet._

## TEST — Testing

_none yet._

## DATA — Data/Storage

_none yet._

## PERF — Performance

_none yet._

## UX — UX/Accessibility

_none yet._

## BLD — Build/Packaging

_none yet._
