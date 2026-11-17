# Batch 27: Lessons from before last year are view only

**Built:** 2026-11-16 · branch `feature/batch-27-view-only-old-lessons` · back to the [implementation plan](../implementation-plan.md)

This file is a finished record, kept as it was written at the time. What's still open lives in the root
`README.md` (gaps and shortcuts) and `AI/implementation-plan.md` (what's left to build).

## The plan, as written before it was built

**Lessons from before last year are view only** (G-39; owner, 2026-11-15). On Payments, a lesson dated before
January 1 of last year, in the coach's time zone, can be seen but not changed: no *Mark paid*, no change to how they
paid, no *Waive* and no *Undo*. The server refuses each one (wording settled when built), and the page shows the
lesson's status without its buttons (the Harbor design has no read-only row yet; drawn when built). This year's and
last year's lessons stay editable, so a December lesson paid in January still counts (ADR-030 amendment of
2026-11-13). It closes the one case the financial page leaves out: a lesson from two or more years back marked paid
now, which counts in no year.

## Log

- **Conflict found before building, ruled by the owner 2026-11-16:** with *Waive* blocked too, an old lesson still
  unpaid could never be settled. ADR-017 keeps an unpaid lesson until it's settled, and ADR-018's Monday email lists
  it until it's marked paid or waived, so it would have stayed in every Monday email, in Today's *Unpaid* figure and
  in the table for good. **Ruling: Waive stays allowed** on an old unpaid lesson (it asks first, as always). A waive
  never touches the financial figures, which count paid lessons only. This amends the 2026-11-15 ruling for Waive
  only.
- **Also ruled 2026-11-16:** the row's look (a muted *View only* where *Undo* would be, like *Final* on a waived row)
  and the server's refusal: *"Lessons from before January 1, 2025 can be viewed but not changed."*
- **Built:** `core`: `Payment.viewOnly` and `Payment.checkChangeable` (domain, test first: the line is January 1 of
  last year, so it moves a whole year at New Year), and `PaymentService` marks each row `viewOnly` and refuses
  *Mark paid* (which also changes how they paid) and *Undo* on one, working "today" out in the coach's time zone.
  *Waive* isn't checked. `api-coach`: `viewOnly` on each Payments row. `web`: on a view-only row, a paid lesson shows
  *View only* (its title gives the reason) and how they paid without *Change*; an unpaid one offers *Waive* alone; a
  waived one stays *Final*. Design: `coach/screens-money-profile.js` draws the same, with a new page,
  `payments-view-only`.
- **Docs:** ADR-030 amended (2026-11-16) and decision 4's G-39 note closed; ADR-MASTER §12; the feature notes
  `Coach Payment Section on Dashboard.md` and `Coach Financial Page.md`; `design/harbor/README.md` (57 coach pages).
- **Closed:** G-39.
- **Shortcuts:** none new.
- **Gaps:** none new.
- **Checked:** `core` 935 tests and `api-coach` 73, all passing, including the boundary at 11:30 PM on December 31
  and half past midnight on January 1 in Chicago; `web` type check and 315 tests passing; the design rebuilt, with
  `payments-view-only.html` showing each row as ruled.
- **Not checked:** in the running app in a browser. A lesson from two years back can't be booked locally, so the page
  was checked through its tests and the design only.
