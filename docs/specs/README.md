# BladeBook specs

A spec states **what a feature does now**, as scenarios that can each become a test. Two other
kinds of document already exist, and a spec does not replace either:

- **ADRs (Architecture Decision Records)** in `docs/adr/` keep the **why**: the decision, the
  options rejected, the cost. They are append-only, so a current rule often has to be pieced
  together from several amendments.
- **Feature notes** in `FeatureDecriptions/` keep the product rules and the screen design as they
  were decided, with their history.

A spec takes the rules **in force today** from those sources and writes each one once, with no
struck-out text and no history. When a spec and its sources disagree, the sources win. Fix the
spec, or raise the disagreement with the owner.

Specs started on 2026-11-16, for Phase 2 (`docs/specs/phase-2/`). The feature notes are unchanged
for now.

## Shape of a spec

One file per feature, named in kebab-case, for example `missed-lesson-fee.md`.

```markdown
# Spec: <Feature name> (Phase 2)

**Status:** Draft — <date>
**Sources:** ADR-0xx (decisions …), `FeatureDecriptions/<file>`, ADR-MASTER §24, …
**Depends on:** other specs or MVP features that must exist first
**Out of scope:** what this spec deliberately leaves out, and where it lives instead

## Summary
Two to four sentences: what the feature is, and who uses it.

## Assumed in every example
Shared facts, such as "the coach's notice period is 24 hours" and "now is Monday 10:00 in
the coach's time zone".

## 1. <Group of behaviour>

**1.1 <Short scenario name>**
- **Given** <starting state>
- **And** <more starting state>
- **When** <one action, by one actor>
- **Then** <an observable result: what is shown, stored, sent, or refused>
- **And** <more results>
*(source: ADR-0xx dN; FeatureDecriptions/<file>, "<section>")*

## N. Rules that must always hold
Invariants that apply across every scenario, each one cited.

## Open questions
Anything the sources leave undecided, written as a question with where it is tracked
(Open-Pending §, ADR Open section, gap number). **Never guess an answer into a scenario.**
```

## Writing rules

- **One actor and one action per When.** If two things happen, write two scenarios.
- **Then states what can be observed**: what is on screen, what is stored (name the record and
  its fields), which messages are sent and to whom, and what is refused. Write "nothing is
  sent" when that matters.
- **Use concrete values**, such as dates, times, prices and counts, not "a lesson" or "some
  fee".
- **Cite every scenario** with the ADR decision or feature-note section it comes from.
- **Use the glossary's terms** (`docs/glossary.md`) and the data model's names (`SEAT#`,
  `CANCELLED#`, `paymentStatus` …). Spell out an acronym on first use, with the acronym in
  parentheses.
- **Decided only.** A rule that is still open goes under Open questions, not into a scenario.
  A scenario may say a value is configurable without saying what the value is.
- **Write for the families and coaches.** Screen wording is quoted exactly when the sources fix
  it, and otherwise described, not invented.
