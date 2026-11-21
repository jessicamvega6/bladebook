# Batch 6: Time off, special schedules and the save impact preview

**Built:** 2026-11-12 · merged by PR #24 · back to the [implementation plan](../implementation-plan.md)

This file is a finished record, kept as it was written at the time. What's still open lives in the root
`README.md` (gaps and shortcuts) and `AI/implementation-plan.md` (what's left to build). A section number such as §4
or §6 below means the plan as it was then: its conflicts (§4) and decisions (§6) are now in `AI/plan-history.md`,
and §7 meant these batch logs.

## The plan, as written before it was built

- **Core (TDD):**
  - The one schedule-change evaluator (add / remove / cancel / re-price; past lessons untouched; a default save skips temp dates).
  - Re-pricing rules (an increase only outside the notice period).
  - The 50% large-change warning, including old price = 0.
  - Odd cents.
  - Temp-overlap ranges.
- **Slice:** time off and special-schedule forms, then review (with the must-acknowledge warning), then save status.
- **Rulings (2026-11-12):**
  - The evaluator doesn't need to cover a change of `iceType` or `maxSkaters` on an `OPEN` time (owner).
  - Signing in again before a save works locally as shortcut SC-7 (Batch 2): the token stub gives a fresh sign-in, and the real 15-minute `auth_time` check runs against it. Time off and special-schedule saves use the same flow.

## Log

The full list, with what closes each one, is in the root `README.md`.

- **Rulings applied:** the owner's 2026-11-12 ruling (the evaluator leaves a booked lesson's ice type and skaters
  per lesson alone; signing in again before a save is SC-7, unchanged).
- **Closed:** SC-6 (the review before every save: lessons cancelled, re-priced and kept, the families emailed, and
  the big price change to tick); G-8 (time off and special schedules: the hub's card and list, *Add dates*, the
  time off form, the special schedule editor); G-10 (a save cancels and re-prices booked lessons through a change
  batch); G-12 (the save status page); G-24 (the family's day view: *"Dana is away (Fall break)"* and the special
  hours banner).
- **Shortcuts:** SC-5 now also covers the change batch, which nothing resumes after a failure; SC-13 widened to the
  schedule review and save status's email wording; SC-14 stays open (it needs the retried event, not this batch).
- **Gaps:** G-30 time off can't be edited (not in the design); G-31 the review doesn't report a skaters-per-lesson
  change.
- **Added by the owner (2026-11-12, not in the design):** *Delete* on every time off and special schedule in the
  hub's list, through the review page and the save status (`FeatureDecriptions/C_Coach Schedule Hub.md`). Phase 2
  note there, and question 14 for Kim: if coaches often add the wrong special schedule, stop emailing families
  automatically after a schedule change.
- **Settled while building (owner may override):**
  - **The 50% warning doesn't fire for a block that was $0**, as the design draws it (there's no percentage of
    nothing). Exactly 50% warns. Blocks are matched by their number; a new block has nothing to compare.
  - **A price increase reaches only lessons starting *later* than the notice period**, so one exactly 24 hours
    away keeps its price (ADR-020's "later than"). Batch 2's open-time rule was the same except at that exact
    instant; both now agree.
  - **A booked lesson the new schedule makes with a different length is cancelled**, and the new open time takes
    its place in the same transaction.
  - **A special schedule runs at most 31 days** (the editor shows one column per date); **time off at most 366**.
    A new one can't start in the past; an edit may keep a start that has passed (a camp that's running) but can't
    move it there.
  - **A special schedule's times switched off are kept per date**, as the design's editor does; its header stores
    its blocks so it can be opened again. Time off can't become a special schedule or the reverse.
  - **The review lists skaters by the seat's display name** ("Mia R."), as the design does.
  - **The weekly review doesn't report dates under time off or a special schedule**: a weekly change doesn't
    reach them. A dated change reports only its own dates, old and new.
  - **The save writes no change batch when no booking is touched**; the save status then says *"No families
    needed telling."* from the review's figures.
  - **The month view's chip for a special schedule shows its name** (the design's demo says *"Camp"*).
  - **Unnamed ones are called *"Time off"* and *"Special schedule"*** wherever they're named, as the design saves them.
- **Checked in the running app (APIs only; table `bladebook-b6check`):** a coach saves a week and a family books two
  lessons → the weekly preview of a $50 → $5 cut (2 re-priced, 1 family, the 90% warning) → time off on the first
  lesson's date previews that lesson (*"Ava P."*) → saving it cancels the lesson; the status is `EXECUTED`, 1
  lesson, 1 family → the calendar and the family's booking page name *"Fall break"* → My bookings shows one lesson
  at $50 → a weekly save at $40 re-prices it to $40. **Not checked in a browser.**
