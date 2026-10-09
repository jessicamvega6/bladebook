---
name: doc-audit
description: Audit BladeBook's design docs for anything that has gone stale after recent changes — ADR cross-references, counts, architecture.md and its diagrams, Open-Pending, the Kim question list, the glossary, feature notes — then propose a numbered list of exact edits and apply only the ones the owner approves. Use this whenever the owner asks to check, sync, sweep or tidy the docs, asks "does anything else need updating?", "is architecture.md still right?", "what's stale?", or after a new ADR or decision lands, even if they don't say "audit".
---

# doc-audit

BladeBook's design lives in many cross-referencing documents. A single decision usually touches
an ADR, `architecture.md`, `Open-Pending.md`, sometimes the Kim list, the glossary and a feature
note. This skill finds what a recent change left behind and fixes it — **but only with the
owner's explicit approval**.

The owner's standing rule: *fix nothing without explicit say-so.* So the skill has two phases
with a hard stop between them. Phase 1 reads and reports. Phase 2 edits only the items the owner
names. Never commit; the owner commits, or asks for a commit, themselves.

## Phase 1 — Assess (read-only)

### 1. Find what changed

Work out the scope before checking anything, so the report is about recent changes rather than a
re-review of the whole design:

- `git status` and `git diff --stat` for uncommitted work; `git log --oneline -10` for recent
  commits.
- The newest ADRs in `docs/adr/` and any `Amended — <date>` / `Note — <date>` lines dated since the
  last commit.
- Anything the owner mentions in their request.

If the owner asks for a full audit, check everything; otherwise focus on what these changes
touch, and say which scope you used.

### 2. Run the checks with read-only helper agents

Split the checks across three parallel helper agents (the `Explore` type, or `general-purpose`
told it may not edit). Give each the scope from step 1 and ask it to return findings only —
file, line, the stale text quoted, why it's stale, and the source that proves it. They must not
edit anything.

**Agent A — ADRs**
- Every *Amends* / *Supersedes* / *Extends* in an ADR's Status has a matching dated note in the
  target ADR, and the reverse.
- Decisions marked superseded or Phase 2 are marked consistently where they're cited.
- An ADR's *Open* section doesn't still list something a later ADR or decision settled.

**Agent B — the overview documents**
- `docs/architecture.md`: *Last updated* and *Current through* name the newest ADR; every ADR has
  a row in the §11 index; the §3 system diagram shows every function; the §4 data model and §5
  table layout carry every item type and attribute the ADRs add; the event catalog matches;
  §7 security and §10 MVP/Phase 2 lists match the ADRs; §12 costs match.
- `docs/design-rationale.md`: function counts, costs and entries match the ADRs.
- `docs/glossary.md`: every acronym used in `architecture.md` and `docs/adr/` has a row; counts
  (functions, MVP features) match.
- **Counts that drift**: Lambda functions, MVP features, item types. Compare across ADR-001's
  amendments, `architecture.md`, `design-rationale.md` and the glossary.
- `design/architecture-diagrams.html` is older than the last change to a mermaid block in
  `architecture.md` → propose regenerating with `python3 design/render-diagrams.py`.

**Agent C — tracking and feature notes**
- `docs/Open-Pending.md`: items an ADR or owner decision has settled are struck through with
  *Settled <date>*; new ADR *Open* items appear; *As of* date is current.
- `docs/Items to ask Kim About.md`: questions the owner or Kim answered are marked answered.
- `docs/Blockers-Before-Coding.md`: rows that are resolved or changed.
- `FeatureDecriptions/`: anything that contradicts an ADR, or a decided rule not yet in any ADR.
- Retired terms still in live text — e.g. "staging" (ADR-027), `api-checkin` (ADR-023) — outside
  dated historical notes.

### 3. Verify before reporting

Helper agents over-report. Before listing an item, open the cited lines yourself and confirm it's
real. Drop anything that is:

- **historical on purpose** — dated amendment notes, struck-through items, superseded decisions,
  done items in tables. These record what was true then; rewriting them destroys the trail;
- already fixed, or a matter of taste rather than a contradiction.

## Phase 2 — Report, then stop

Use this format. Number items continuously across both groups so the owner can approve by number.

```
## doc-audit — <scope used>

### Mechanical fixes (no decision needed)
1. `docs/architecture.md:7` — *Current through* says ADR-026; ADR-027 exists.
   → `**Current through:** [ADR-027](adr/ADR-027-on-demand-dev-environment.md)`
2. ...

### Needs your decision
7. `docs/adr/ADR-026...md:269` — Consequences says X but decision 5 now says Y.
   Options: (a) ... (b) ... — recommend (a) because ...

### Checked, nothing to change
- one line per area checked clean
```

Rules for the list:
- Give the **exact proposed wording** for every mechanical fix, so approval means approving
  that text.
- Anything that needs a design choice, a guess about intent, or a new decision goes under
  *Needs your decision*, with a recommendation — never in the mechanical list.
- Spell out acronyms on first use in proposed text, and add new ones to the glossary as their
  own item.

Then end with: *Reply with the numbers to apply (e.g. "apply 1–4, 7"), or "all mechanical".* and
**stop**. Don't edit anything in the same turn.

## Phase 3 — Apply only what was approved

- Apply exactly the approved numbers. "All mechanical" means the mechanical group only. If an
  approval is ambiguous, ask.
- Follow the house style:
  - change an ADR by adding a dated `**Amended — <date>.**` or `*Amended <date>:*` note, not by
    rewriting the old decision in place;
  - settle an Open-Pending item by striking it through and adding *Settled <date>*;
  - mark a Kim question answered rather than deleting it, unless the owner says otherwise.
- If applying an item reveals something new, don't fix it — add it to the closing report as a
  new proposed item.
- Regenerate `design/architecture-diagrams.html` only if that item was approved.
- **Never commit.**

Close with a short report: what changed per file, any approved item that couldn't be applied and
why, and any new items found along the way, numbered for a follow-up approval.
