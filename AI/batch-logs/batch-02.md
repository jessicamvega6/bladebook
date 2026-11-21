# Batch 2: Weekly schedule and the coach's week and month views

**Built:** 2026-11-08 · merged by PR #10 · back to the [implementation plan](../implementation-plan.md)

This file is a finished record, kept as it was written at the time. What's still open lives in the root
`README.md` (gaps and shortcuts) and `AI/implementation-plan.md` (what's left to build). A section number such as §4
or §6 below means the plan as it was then: its conflicts (§4) and decisions (§6) are now in `AI/plan-history.md`,
and §7 meant these batch logs.

## The plan, as written before it was built

- **Core (TDD), shared fixture at the repo root, tested in Java and TypeScript:**
  - Slot expansion, including the daylight-saving, uneven-block and abutting-block cases.
  - Schedule-for-date resolution (an override, an empty override, or the default).
  - Block validation: end after start, at least one day, ice type required, no overlaps, lesson length from {30, 45, 60, 90, 120}.
  - Sunday–Saturday week arithmetic.
- **Slice:** the schedule hub, then the weekly editor, then save, then lesson times written for the window.
  - The coach's month view (previous/next) and week view showing Open.
  - With no bookings yet, save skips the impact preview. Shown as a shortcut until Batch 6.
- **Rulings (2026-11-08):** S1–S7 and S10 are all ruled (§4). S10 is in the save preview, which this batch skips until Batch 6. S12 (the day view) was ruled **Screen** when Batch 2 started, because S7 opens it.

## Log

The full list, with what closes each one, is in the root `README.md`.

- **Shortcuts:** SC-5 the schedule-change consumer runs in-process after the save; SC-6 no impact
  preview before saving; SC-7 "Sign in again and save" uses the token stub.
- **Gaps:** G-8 time off and special schedules; G-9 no nightly lesson roller; G-10 booked lesson
  times left alone by a save; G-11 no names or cancel buttons on the calendars; G-12 no change-batch
  progress; G-13 a time-zone change doesn't move existing lesson times.
- **Settled while building (owner may override):**
  - **Reopening a saved week:** every block a template makes keeps the template's `seq`, so the
    editor regroups blocks by `seq` to rebuild each template. Its days, start, end and
    switched-off slots come back from the blocks. No new stored attributes. An uneven end is shown
    trimmed (6:00–11:30 at 45 minutes reopens as 6:00–11:15).
  - **Daylight saving:** a lesson time is made only if its start exists that day and it really
    lasts its length. So on the spring-forward day 2:00–2:59 AM makes nothing, and on the fall-back
    day the first 1:00 AM hour is used and a lesson that would run across the change isn't made.
  - **A new block** starts 5:00 AM to 7:00 PM with 1 skater per lesson; length, days, price and ice
    type start blank (S4 as amended 2026-11-09). A saved block with no end reopens showing 7:00 PM.
  - **Validation additions** the ADRs don't word: "needs a start time", "needs a lesson length",
    "needs an end time" (blank end from 7:00 PM on), "needs a price", "price must be under
    $10,000", "can have 1 or 2 skaters per lesson", and "Every time in … is switched off".
    Overlap messages use ADR-008's wording.
  - **Open lesson times are re-priced like booked ones:** a decrease at once, an increase only
    beyond the notice period.
  - **Ice types** are stored as `BFSC_FREESTYLE`, `STICK_AND_PUCK` and `PUBLIC`.
  - The `SCHEDULE#DEFAULT` item stores `days` as a map keyed `SUN` to `SAT`.
  - Save needs a sign-in within 15 minutes (`bladebook.auth.schedule-save-minutes`); refused with
    401 `SIGN_IN_TO_SAVE`, which the editor handles without losing edits.
  - Week view copy drops "Tap a booked lesson to cancel" until cancelling exists.
- **Checked in the running app:** sign-up → build two blocks (one slot switched off, odd cents
  shown, a clash shown) → review → save → week, month and day views, at desktop and phone width.
