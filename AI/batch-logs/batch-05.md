# Batch 5: Cancel one lesson, family and coach

**Built:** 2026-11-12 · merged by PR #23 · back to the [implementation plan](../implementation-plan.md)

This file is a finished record, kept as it was written at the time. What's still open lives in the root
`README.md` (gaps and shortcuts) and `AI/implementation-plan.md` (what's left to build). A section number such as §4
or §6 below means the plan as it was then: its conflicts (§4) and decisions (§6) are now in `AI/plan-history.md`,
and §7 meant these batch logs.

## The plan, as written before it was built

- **Core (TDD):**
  - `Notice.isLate`: strictly under 24 hours, tested at the boundary.
  - Cancellation record (`CANCELLED#`, `cancelledBy`).
  - Release-or-hold.
- **Slice:**
  - My bookings and the family's cancel dialog.
  - Coach cancels one lesson, a day, or the rest of the week from the week view, choosing release or hold per lesson.
- **Rulings (2026-11-08):**
  - B6: the notice period is 24 hours for every coach; `Notice.isLate` uses the lesson's stamped `requiredNoticeHours`.
  - S8: *Cancel rest of week* holds every booked lesson and open time left in the week.
  - S9: release-or-hold is asked per lesson for *this lesson* and *this day*. The rinkside whole-week cancel holds everything, like S8.
  - S11: the coach's cancel deletes an unanswered invited seat with no record or email; a later answer writes nothing.
  - **Redrawn 2026-11-08:** `coach/screens-calendar.js` (no *Release all*; *Cancel rest of week* states the range and count, and its new preview, `cancel-preview-week`, holds everything) and `rinkside/screens-rink.js` (*Cancel rest of week* on the Week tab, `week-all-confirm`).

## Log

The full list, with what closes each one, is in the root `README.md`.

- **Rulings applied:** B6 (late is strictly under the lesson's own `requiredNoticeHours`, 24 for every
  coach, tested at the boundary); S8 (*Cancel rest of week* holds every booked lesson and open time left
  in the week, with no question); S9 (release-or-hold asked per lesson, no *Release all*); S11 (an
  unanswered invitation on a cancelled lesson is deleted with no line; coded, and reachable once sharing
  exists in Batch 11).
- **Closed:** G-11 (Cancel on a booked lesson in the week and day views, *Cancel day*, *Cancel this day*,
  *Cancel rest of week*, and the cancel preview). G-23 (My bookings with its cancel pop-up; *My bookings*
  open in the menu and on Home's *Go to*; *All bookings* on *Coming up*; the price on Home's lesson rows; the
  result page's *View my bookings*).
- **Shortcuts:** SC-13 no cancellation email or late-cancel notice (the pages keep the designed wording, as
  SC-9 and SC-11 do); SC-14 a coach's cancel of several lessons is carried out as it goes, with no resume.
- **Gaps:** G-27 no attendance badge on *Recent* (Batch 7); G-28 cancelling from the rinkside page (Batch 7);
  G-29 nothing lists a cancellation afterwards.
- **Settled while building (owner may override):**
  - **Every coach cancel goes through the preview, one lesson too**, as the design draws it (ADR-MASTER §10
    asks it only for more than one lesson).
  - **A single lesson is one transaction** with its header and line already `EXECUTED`, as §9 says. A day or a
    week writes the header first, then each lesson on its own (SC-14).
  - **Cancel rest of week sends only its Sunday.** The server works out what it closes from the moment it
    runs: every booked lesson and open time that hasn't started, Sunday to Saturday. A time booked between
    the preview and *Cancel* is held too (S8); one that started meanwhile is left.
  - **A lesson that started or was cancelled since the preview is left alone and counted.** The message
    afterwards adds *"1 lesson had already started or gone, so it was left alone."* (not in the design). If
    nothing at all is left, the preview shows *"These lessons have already started or were cancelled."*
  - **A lesson can't be cancelled once it has started, or once the coach has marked it** (checked in or a
    no-show): *"This lesson has already started, so it can't be cancelled."* / *"Coach Dana has already marked
    this lesson, so it can't be cancelled."*, shown inside the pop-up.
  - **Asking to cancel a lesson that's already gone answers `ALREADY_CANCELLED`** and writes nothing, so the
    website resends a family's cancel once after a server error. The coach's cancel isn't resent.
  - **The line's `priceMinor` is the skater's share**; `noticeHours` is whole hours to the start, rounded down.
  - **The family's read of a lesson time now names `requiredNoticeHours`**, so the pop-up's late warning uses
    the lesson's own stamp (B6). Home's lessons now come with their price, the same shape as My bookings.
  - **My bookings' *Recent* looks back a year** (366 days) for the last four lessons.
  - **Headers written by the APIs are `planStatus = COMPLETE`** from the start; only the schedule-change
    consumer plans first.
- **Checked in the running app (APIs only; table `bladebook-b5check`):** a coach signs up and saves a week →
  a family signs up and is approved → three lessons booked → My bookings and Home list them at $50 with 24
  hours' notice → the family cancels one (cancelled, not late) → the same cancel again (already cancelled) →
  the coach cancels a day's lesson, held → *Cancel rest of week* holds the last booked lesson and 12 open
  times → the calendar shows every time held, and My bookings is empty. **Not checked in a browser.**
