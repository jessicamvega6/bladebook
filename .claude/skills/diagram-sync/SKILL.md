---
name: diagram-sync
description: Sync every BladeBook diagram with the current design — the Mermaid diagrams in architecture.md and the ADRs, the rendered architecture-diagrams page, the C4 map, and the student-erasure SVG pages. Finds stale boxes, arrows, attributes and participants, cross-diagram disagreements, flows no diagram shows yet, and diagrams that fail to render; shows each proposed change as a before/after picture in a private review artifact; applies only what the owner approves; then rebuilds and republishes. Use whenever the owner runs /diagram-sync, asks whether the diagrams are current, "update the diagrams", "is the C4 map right?", or after an ADR or decision changes something a diagram shows. doc-audit hands all diagram work to this skill.
---

# diagram-sync

BladeBook's diagrams restate decisions that live in prose: the ADRs in `docs/adr/` and the text
of `docs/architecture.md`. When a decision changes, the prose usually gets updated and the
diagrams don't. This skill finds those gaps and fixes them **only with the owner's explicit
approval, given after seeing each change as a picture**.

The owner's standing rule: *fix nothing without explicit say-so.* So there are two phases with a
hard stop between them. Phase 1 reads, renders and reports. Phase 2 edits only the items the owner
names. Never commit; the owner commits, or asks for a commit, themselves.

## The diagrams

### Known set

| # | Diagram | Source | Kind | Checked against |
|---|---------|--------|------|-----------------|
| D1 | System diagrams | `docs/architecture.md` Mermaid `flowchart` blocks: §3 (overview), §3.1 (the event consumers, one by one), §7 *Lower environments* (production and dev accounts) | hand-written | ADRs, §3 and §7 text, event catalog |
| D2 | Data model (§4) | `docs/architecture.md` Mermaid `erDiagram` | hand-written | §4/§5 text, ADR item types and attributes |
| D3 | Sequence diagrams | `docs/architecture.md` Mermaid `sequenceDiagram` blocks (§6.1–§6.11 plus two in §7, 14 today) | hand-written | the ADR that defines each flow, event catalog |
| D4 | ADR diagrams | Mermaid blocks inside `docs/adr/*.md` (ADR-006 and ADR-031 today) | hand-written | later ADRs that amend that ADR |
| D5 | Rendered diagrams page | `design/architecture-diagrams.html` | **generated** by `python3 design/render-diagrams.py` from D1–D3 — never edit by hand | its source |
| D6 | C4 map | `design/c4-map.html` — data in the `Q`, `E`, `FOUNDATION`, `SETTLED`, `VIEWS` objects | hand-written; published | see *C4 map checks* below |
| D7 | Student-erasure options | `docs/deletion/erasure-by-token.html`, `docs/deletion/erasure-by-constant.html` (inline SVG) | hand-written | `architecture.md` §7 and any ADR on student deletion |

Published artifacts kept in sync:
- **C4 Map** — https://claude.ai/artifact/NwTPtAWeFF63c4k4obdMhq (from D6)
- **Architecture Diagrams** — https://claude.ai/artifact/JVjHRjxzQb7ZumNqbVLqR3 (from D5;
  publish `design/architecture-diagrams.html` to this URL after every rebuild)
- **Diagram Sync Review** — https://claude.ai/artifact/BkDrY7iXT3JkD4GnQWDX2A — the private
  review page this skill republishes each run (replace its contents; its images go up as
  supporting files under `img/`)

### Discovery

After the known set, scan for diagrams added since this list was written:

- Mermaid blocks (lines that are exactly ` ```mermaid `) in any `.md` under `docs/` and
  `FeatureDecriptions/`.
- `.html` / `.svg` files under `docs/` and `design/` that contain `<svg` or `class="mermaid"`.
- **Skip** UI mockups and archives: `design/harbor/`, `design/redesign/`, `redesign/`,
  `design/DecidedAgainst/`, `design/.backup-*`, and `*.dc.html`.

List any new find in the report under *New diagrams found*, saying what it shows and what it
should be checked against. Check it in this run only if the owner says so, and offer to add it to
the known set (the owner approves edits to this file too).

## Phase 1 — Assess (read-only)

### 1. Find what changed

- `git status`, `git diff --stat`, `git log --oneline -10`.
- The newest ADRs and any `Amended — <date>` / `Note — <date>` lines since the last commit.
- Anything the owner names in the request.

Map each change to the diagrams it could affect (a new Lambda function → D1, D3, D6; a new item
type or attribute → D2; a retired feature → every diagram). If the owner asks for a full sync,
check every diagram. Say which scope you used.

### 2. Run the checks with read-only helper agents

Run these in parallel with read-only helpers (`Explore`, or `general-purpose` told it may not
edit). Give each the scope from step 1. Each returns findings only: diagram ID, file and line,
the stale element quoted, why it's stale, and the source that proves it (file:line).

**Agent A — stale content (D1–D4, D7)**
- Every node, edge, participant, message, entity and attribute matches the current ADRs and
  `architecture.md` text. Look for retired pieces still drawn (e.g. `api-checkin`, ADR-023;
  "staging", ADR-027; Phase 2 features drawn as MVP), and current pieces missing (every Lambda
  function, consumer, EventBridge rule and schedule, every item type and attribute).
- Labels: event names, function names, and times (e.g. the 7:00am and 9:00pm schedulers) match
  the event catalog and ADRs exactly.
- D7: the zones, record keys and fields match what §7 and the deletion ADR say, and the page
  correctly says which option was chosen (or that neither has been chosen yet).

**Agent B — C4 map (D6)**
- **Questions (`Q`)**: every open item matches a live row in `Blockers-Before-Coding.md`,
  `Open-Pending.md`, `Items to ask Kim About.md` or an ADR *Open* section. Anything since settled
  or moved to Phase 2 leaves `Q` and every `refs` list, and gains a line in `SETTLED`. New open
  items that block a part are added.
- **Boxes (`E`, `VIEWS`)**: containers and components match `architecture.md` §3 and the ADRs:
  every Lambda function and consumer, nothing retired, no description contradicting a later
  decision.
- **`FOUNDATION`** matches `Blockers-Before-Coding.md` §1, and the *Design status as of* line
  names the newest ADR and today's date.

**Agent C — consistency and gaps (all diagrams)**
- **Cross-diagram consistency**: the same component has the same name everywhere; D1, D3 and the
  C4 `E` boxes list the same functions; D2 and the C4 data boxes list the same item types;
  function and item-type counts agree with each other and with `architecture.md`, ADR-001's
  amendments, `design-rationale.md` and the glossary.
- **Missing diagrams**: flows an ADR describes step by step that no sequence diagram shows (new
  events, schedulers, multi-step client/coach flows), and data relationships the ADRs add that
  D2 lacks. Suggest where each would go (which section of `architecture.md`) and what it would
  show. Don't draft it yet.
- **Discovery**: run the scan in *Discovery* above and return new finds.

### 3. Render check (do this yourself)

- Run `python3 design/render-diagrams.py` into the scratchpad, not over D5: copy the script to
  the scratchpad and change `OUT` there, or otherwise send its output somewhere other than
  `design/`. Note any block that fails to parse.
- Check every Mermaid block (D1–D4 and any new finds) for syntax errors. Where Mermaid's command
  line tool (`npx -y @mermaid-js/mermaid-cli`) is available, render each block to SVG in the
  scratchpad. Otherwise, render them in a browser.
- Look at each rendered diagram (D1–D7) for problems a parser won't catch: overlapping or
  clipped labels, arrows crossing into unreadable tangles, text too small to read, a diagram so
  wide it's unusable on a phone. For D6, also check that every `refs` id exists in `Q` (a missing
  one breaks the page).
- Mark whether D5 is stale: it's stale if any D1–D3 block differs from what D5 contains.

### 4. Verify before reporting

Helpers over-report. Open every cited line yourself and confirm. Drop anything that is:
- **historical on purpose**: a diagram inside a dated amendment, a superseded ADR's original
  diagram already followed by an amended version, the `SETTLED` list, or D7's description of the
  option that wasn't chosen;
- already fixed, or taste rather than a contradiction. Layout nitpicks only count if they hurt
  readability.

### 5. Draft the changes and build the review artifact

For every confirmed finding, draft the exact change (the full replacement Mermaid block, the
`Q`/`E`/... object edit, or the SVG change), then build one review page in the scratchpad
(`<scratchpad>/diagram-sync-review.html`):

- One numbered section per proposed item, matching the report numbers.
- **Current** and **Proposed** rendered side by side (stacked on narrow screens), with the
  changed elements called out in a short caption ("adds `notify-reminder` consumer; removes
  `api-checkin`"). Load Mermaid from a pinned cdnjs version so the page renders outside
  Artifacts too.
- For C4 data edits and SVG edits, show the before/after picture where it changes, plus the
  data diff for edits that aren't visible.
- For *Missing diagram* items, show a proposed draft so the owner can approve the picture.
- For render-only issues, show the broken or cluttered rendering and the fixed one.

Load the `artifact-design` skill before writing the page. Publish it as a **private** artifact.
Reuse the URL in *The diagrams* section if one is recorded there (read it first, then republish);
otherwise publish a new one and include *record the review URL in the skill* as an item in the
report.

## Phase 2 — Report, then stop

```
## diagram-sync — <scope used>
Review page: <artifact link>

### Proposed changes (see the matching number on the review page)
1. D1 `docs/architecture.md:66` — §3 flowchart still draws `api-checkin` (retired, ADR-023).
   → remove node and its 2 edges.
2. D6 `design/c4-map.html` — `Q.B14` settled in ADR-028 → move to `SETTLED`, drop from refs on
   `E.api`, `E.db`.
...

### Needs your decision
7. Missing diagram — ADR-026's lesson-sharing flow has no sequence diagram. Draft on the review
   page (§7). Options: (a) add to architecture.md §6 as drafted (b) skip. Recommend (a) because ...

### Rebuild and publish (happen only if you approve them)
9. Rebuild `design/architecture-diagrams.html` (needed if any of D1–D3 is approved).
10. Republish the C4 Map artifact.
11. Publish / republish the Architecture Diagrams artifact.

### New diagrams found
- `docs/...` — what it shows; check it and add it to the known set?

### Checked, nothing to change
- one line per diagram checked clean (including render checks that passed)
```

Rules:
- Every proposed change is shown on the review page. If something can't be drawn (a C4
  description string, say), quote the exact new text instead.
- Anything that needs a design choice or a guess about intent goes under *Needs your decision*
  with a recommendation.
- Spell out acronyms on first use in any new diagram label or note, and add new ones to
  `docs/glossary.md` as their own item.
- Non-diagram staleness you notice (prose, Open-Pending, glossary) isn't this skill's job. List it
  in one line at the end: *"Outside diagrams: run /doc-audit for …"*.

End with: *Look over the review page, then reply with the numbers to apply (e.g. "apply 1–4,
9–10").* Then **stop**. Don't edit anything in the same turn.

## Phase 3 — Apply only what was approved

- Apply exactly the approved numbers. If an approval is ambiguous, ask.
- **Diagrams in `architecture.md`**: edit the Mermaid block in place, and update *Last updated*
  if the doc uses it.
- **ADR diagrams**: edit the Mermaid block in place **and** add a dated note directly under it:
  `*Amended <date>: diagram updated to <what changed> (<source ADR>).*` Never delete the note
  trail.
- **C4 map**: edit the data objects, update the *Design status as of* line, then confirm every
  `refs` id still exists in `Q`.
- **Erasure SVGs**: edit the SVG and any matching caption text together.
- **Rebuild D5** with `python3 design/render-diagrams.py` (only if approved), after the source
  edits. Never hand-edit D5.
- **Publish** (only if approved): read the artifact first, then republish to its recorded URL
  with the Artifact tool's `url`. For a first publish of Architecture Diagrams, publish fresh and
  report the new URL so it can be recorded.
- Re-render every diagram you changed and check it once more. If an applied change no longer
  renders or looks wrong, say so; don't quietly fix it beyond what was approved.
- If applying something reveals a new problem, don't fix it. Add it to the closing report as a
  new numbered item.
- **Never commit.**

Close with a short report: what changed per file, what was rebuilt or published (with links),
anything approved that couldn't be applied and why, and new numbered items for follow-up.
