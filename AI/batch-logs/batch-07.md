# Batch 7: Rinkside attendance online, and lesson-list corrections

**Built:** 2026-11-12 · merged by PR #25 · back to the [implementation plan](../implementation-plan.md)

This file is a finished record, kept as it was written at the time. What's still open lives in the root
`README.md` (gaps and shortcuts) and `AI/implementation-plan.md` (what's left to build). A section number such as §4
or §6 below means the plan as it was then: its conflicts (§4) and decisions (§6) are now in `AI/plan-history.md`,
and §7 meant these batch logs.

## The plan, as written before it was built

- **Core (TDD):**
  - Outcome time check: from 1 hour before the start to the end of the day, and not in the future.
  - Capture only while the seat is `BOOKED`.
  - `statusOf` (not recorded).
- **Slice:** rinkside Today (Present / No-show), contact on a tap (logged), then the coach Lessons page with its date range and corrections.
- **Rulings (2026-11-09):**
  - R1: no Undo on the phone; corrections are made on the website's Lessons page.
  - R6: the rinkside cancel dialog names the skater, date and time.
  - R9: the coach website and rinkside text says what the page is for, not that it "can only see today's lessons".
- **Left out:** nothing.

## Log

The full list, with what closes each one, is in the root `README.md`.

- **Rulings applied:** R1 (no Undo on the phone; corrections on the website's Lessons page), R6 (the rinkside cancel
  sheet names the skater, date and time), R9 (the rinkside page says what it's for).
- **Closed:** G-27 (My bookings' *Recent* shows *Attended* or *No-show*); G-6 in part (the Lessons page); G-28 in part
  (the cancel on each lesson in Today's list).
- **Shortcuts:** SC-15 contact-detail reveals go to the application log.
- **Gaps:** G-32 the rinkside page is online only (Batch 10); G-33 the attendance events aren't raised; G-28 narrowed
  to the Week tab.
- **Settled while building (owner may override):**
  - **The tap time may be up to 2 minutes ahead of the server's clock** (the ADR's "small clock-skew allowance").
  - **A tap time outside the lesson's window is refused** with the design's *"The phone’s time didn’t match the
    lesson, so it couldn’t be recorded."*; a tap on a lesson that's gone says *"This lesson was cancelled, so there’s
    nothing to record."*
  - **A second tap answers with what was recorded first**, as a replay does (the condition fails silently).
  - **A correction keeps the first tap time** and sets `recordedAt`; one on a lesson never recorded takes now.
  - **A lesson that hasn't started can't be corrected** on the Lessons page; it lists only lessons that have started.
    Ranges are at most a year.
  - **The rinkside routes are `/api/coach/rinkside/**`**, with the 4-hour session; cancelling from Today uses
    `/api/coach/rinkside/cancel`, the same cancel as the website's, so it keeps that session too.
  - **The rinkside page fills the phone's screen** (up to 480px wide on a desktop). The design's device frame and
    fake status bar are left out; they draw the phone for the demo.
  - **The rinkside sign-in is the coach website's local stand-in** (SC-1), sharing the coach site's sign-in in the
    same browser tab; the password box is shown, as designed, and not checked.
  - **Contact details come from the coach's own `STUDENT#` copy** of the family's details (ADR-MASTER §3).
- **Added after review (owner, 2026-11-12):** Today's *"Heading to the rink?"* card with *Open the rinkside app*, and
  the log-in page's *"Checking in at the rink?"* note, both as designed (no batch had placed them; G-34 the morning
  email they mention). The rinkside page now fits a phone turned sideways: it scrolls as one page, uses the width
  (two lessons a row), and keeps clear of the notch and home bar. Checked in headless Chrome at 390×844 and 844×390.
- **Checked in the running app (APIs only; table `bladebook-b7check`):** a coach's lessons an hour from now, booked
  by a family → rinkside Today lists them → Present records the tap time → a second tap as No-show keeps Present →
  contact details for a tap (one `contact-reveal` log line) → the family can't cancel the checked-in lesson → the
  rinkside cancel holds the other time. **Not checked in a browser.**
