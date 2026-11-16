# Spec: Saved, named schedule templates (Phase 2)

**Status:** Draft — 2026-11-16
**Sources:** ADR-MASTER §6 ("The editor", "Temporary schedules") and §9, §24; ADR-008 (decision 2 "Name
is stored, not applied", decision 7, Open, Revisit if); ADR-006 (decision 2, Revisit if);
`FeatureDecriptions/Schedule Creater.md` ("Name (optional)", "A saved named schedule is able to be
reloaded and then modified", "Checks before review", "What the review page shows");
`docs/Open-Pending.md` §4; `docs/architecture.md` §10
**Depends on:** Minimum Viable Product (MVP) schedule editor (weekly and special schedules, the review page, the change batch)
**Out of scope:** editing an existing special schedule from the schedule hub (MVP, ADR-008 decision
7a); block names (MVP); rink selection (`rink-selection.md`)

## Summary

A coach saves a schedule under a name ("summer camp", "off-season") and later applies it again
instead of re-entering every block. MVP already stores the schedule's optional Name; Phase 2 adds
saving a schedule for reuse and applying it. It brings back, in a more useful form, the named
temporary-schedule entity that ADR-006 dissolved. Most of how it works is still open.

## Assumed in every example

- Now is Monday 16 November 2026, 10:00, in the coach's time zone.
- Coach Dana signed in 5 minutes ago. Her notice period (`requiredNoticeHours`) is 24 hours.
- Her weekly schedule (`SCHEDULE#DEFAULT`) has one block, Monday to Friday 15:00–18:00, 30-minute
  lessons at $50.

## 1. The name today (what Phase 2 builds on)

**1.1 A special schedule's name is stored on its header**
- **Given** Coach Dana is adding a special schedule for 21–27 December 2026
- **And** she enters the Name "Holiday camp"
- **When** she accepts the review
- **Then** the header `SCHEDULE#TEMP#<tempId>` is stored with `scheduleName = "Holiday camp"`,
  `startDate = 2026-12-21` and `endDate = 2026-12-27`
- **And** one `SCHEDULE#DATE#` item per date carries that `tempId`
*(source: ADR-008 decisions 2 and 7; ADR-MASTER §6, "Temporary schedules"; `Schedule Creater.md`,
"Name (optional)")*

**1.2 The weekly schedule's name is stored on it**
- **Given** Coach Dana is editing her weekly schedule
- **And** she enters the Name "Fall season"
- **When** she accepts the review
- **Then** `SCHEDULE#DEFAULT` is stored with `scheduleName = "Fall season"`
*(source: ADR-008 decision 2 and "Model changes", `scheduleName` on `SCHEDULE#DEFAULT`)*

## 2. Reloading a saved schedule

**2.1 A saved schedule reloads into the editor and nothing is written yet**
- **Given** Coach Dana has a saved schedule named "Holiday camp"
- **When** she reloads it
- **Then** the editor shows its blocks, which she can change
- **And** nothing is written until she reviews the change and accepts it
*(source: `Schedule Creater.md`, "A saved named schedule is able to be reloaded and then modified";
ADR-MASTER §6, "The editor", Next runs validation, then the preview, then needs acceptance)*

## 3. Rules that must always hold

Applying a saved schedule changes the schedule, so every rule for a schedule save holds:

- **Validation first:** blocks in one day don't overlap (touching is fine) and each `endTime` is after
  its `startTime`. *(ADR-MASTER §6, "Shape")*
- **A new special schedule that overlaps an existing one is rejected**, never warned about and
  allowed, with a message naming the one it overlaps, e.g. "This overlaps **August Camp** (Aug 19–25)
  on Aug 21–22. Edit August Camp to change those days, or choose dates outside it." *(ADR-MASTER §6;
  `Schedule Creater.md`, "Checks before review")*
- **The review page comes before anything is written:** every lesson the change cancels or re-prices,
  which lessons an increase won't reach, and a must-acknowledge warning for a price change of 50% or
  more. *(ADR-MASTER §9, "The preview"; `Schedule Creater.md`, "What the review page shows", "Big price
  change warning")*
- **Saving needs a sign-in from the last 15 minutes.** The review doesn't. *(ADR-MASTER §6, "The
  editor")*
- **Cancellations and re-prices go through one change batch**, and each affected family gets one email
  covering the batch. *(ADR-MASTER §9, "Execution"; §13)*
- **Block names are coach-only** and never shown to families; the schedule's name likewise is not a
  family-facing label. *(ADR-MASTER §6, "The editor"; `Schedule Creater.md`, "Block names")*

## Open questions

1. **Is a saved template a third item type, or a header that is not currently in effect?** This
   decides whether "save" and "apply" are one action or two. (ADR-008 Open; `docs/Open-Pending.md` §4;
   ADR-008 Revisit if says a saved-but-not-applied schedule "needs its own item type")
2. **Can a template be applied as the weekly schedule, as a special schedule over a date range, or
   both?** The examples ("summer camp", "off-season") suggest both; nothing decides it.
3. **Where saved schedules are listed** and how the coach picks one. MVP has no saved-schedule list
   (`Schedule Creater.md`, "Design: There is no saved-schedule list to reload").
4. **Does a template remember its dates, or only its blocks?** A special schedule's header holds
   `startDate`/`endDate`; a reusable one presumably needs new dates each time.
5. **Does editing a template change schedules already applied from it?** Not stated.
6. **Do template names have to be unique**, and how long can they be? Block names are capped at 40
   characters with no uniqueness rule; nothing is said for schedule names.
7. **Does a template carry `maxSkaters`, `iceType` (and, from Phase 2, the rink and the missed-lesson
   fee) per block**, and what happens when a stored ice type no longer exists at that rink?
8. **Deleting a template.** Not stated.
