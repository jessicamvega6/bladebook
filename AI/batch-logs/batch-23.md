# Batch 23: Rinkside Week tab

**Built:** 2026-11-16 · merged by PR #51 · back to the [implementation plan](../implementation-plan.md)

This file is a finished record, kept as it was written at the time. What's still open lives in the root
`README.md` (gaps and shortcuts) and `AI/implementation-plan.md` (what's left to build). A section number such as §4
or §6 below means the plan as it was then: its conflicts (§4) and decisions (§6) are now in `AI/plan-history.md`,
and §7 meant these batch logs.

## The plan, as written before it was built

From the plan's batch table. Struck-out text is what was first planned; the text after it is what changed.

**Done** (branch `feature/batch-23-rinkside-week`, 2026-11-16; §7). ~~**The rinkside Week tab** (G-28, MVP features 10 and 12): the week's lessons, cancel on each, and *Cancel rest of week*, which holds everything (S8, already drawn as `week-all-confirm`); with no signal the tab shows only *"The week needs a connection"* (R5, drawn as `week-offline`). The tab is disabled today~~ Cancels one lesson, a whole day, or the rest of the week, nothing in between (owner, 2026-11-16; ADR-009 amended). Closed G-28

**Held back by:** — (owner, 2026-11-13: after Batch 14)

## Log

The full list, with what closes each one, is in the root `README.md`.

- **Rulings applied:** S8 (*Cancel rest of week* holds every booked lesson and open time left, Sunday–Saturday, with no
  release-or-hold question; it sends only its Sunday and the server works out the rest); S9 (one lesson, and each
  lesson of a whole day, asks release or hold on its own); S11 (an unanswered invitation on a cancelled lesson is deleted quietly, as
  `CoachCancelService` already does); R5 (with no signal the tab shows no lessons, only *"The week needs a connection"*).
- **Built:** `core`: `RinksideWeekService` (each day from today to Saturday in the coach's time zone: the lessons that can
  still be cancelled, how many have started, the open times), worked out by `CoachCancelPlan` for the whole week, so the
  tab lists exactly what *Cancel rest of week* would hold. The cancels are Batch 5's `CoachCancelRequest` scopes
  `LESSON`, `DAY` and `WEEK` and its `CoachCancelService`, unchanged. `api-coach`: `GET /api/coach/rinkside/week`; the
  existing `POST /api/coach/rinkside/cancel` takes `DAY` and `WEEK` too (4-hour rinkside session). `web`: the Week tab
  (`web/src/rinkside/WeekTab.tsx`, designs `week`, `week-lesson`, `week-day`, `week-all-confirm`, `week-offline`),
  turned on in the tab bar.
- **Closed:** G-28.
- **Shortcuts:** none new. A whole day and the rest of the week run as they go (SC-14); emails go to the outbox (SC-21).
- **Gaps:** none new.
- **Settled while building (owner may override):**
  - ~~**Lessons picked on several days are one batch**, `batchSource = SELECTION` (new)~~ **Owner ruling (2026-11-16):
    only three cancels — one lesson, a whole day, or the rest of the week.** Lessons on different days are cancelled one
    by one, so `SELECTION` was removed before merging and `batchSource` is unchanged. The tab has no checkboxes: each
    lesson has *Cancel* (the same confirmation as Today's, sent as `LESSON`), and a day with two or more lessons has
    *Cancel whole day* (one confirmation asking release or hold for each lesson, sent as `DAY`). The design's
    `week-confirm` is replaced by `week-lesson` and `week-day`. ADR-009 (amended 2026-11-16), ADR-MASTER §10,
    `architecture.md`, `cancelation.md`, `Coach App` and the Week tab's feature notes say so.
  - **A lesson already marked Present or No-show isn't listed** (Batch 5's rule); it's counted with the started ones
    (*"1 lesson already started and can't be cancelled."*).
  - **The week is read again** each time the tab opens with signal and after every cancel. Nothing about the week is kept on the phone (R5).
  - **A refusal** (*"These lessons have already started or were cancelled."*) stays in the confirmation sheet; a lesson
    left alone is counted in the message afterwards with the website's wording (*"1 lesson had already started or gone, so
    it was left alone."*). The message leaves out *"N families will be emailed"* when no family is.
  - **Owner ruling (2026-11-16): "1:00 PM" everywhere.** Every time on the rinkside page (Today's lesson rows and *Next:*
    line, the Week tab, its confirmations) is written "3:00 PM" / "10:30 AM" with the shared `formatTime`, not "3pm"
    (built first) or the design's "3:00"; the Harbor rinkside design is changed to match. The time columns don't wrap and
    the Week tab's is 74px, checked at a true 390px.
- **Checked in the running app (APIs on :8102 and :8103, Vite on :5191; table `bladebook-b23check`):** a coach with lessons
  Monday to Saturday 3–6 PM and one at 1:00 PM today (checked in early), three families, six lessons booked → the Week tab
  lists Monday to Saturday, today with *"1 lesson already started and can't be cancelled."* and *6 lessons and 12 open
  times* on the rest-of-week card → picks from two weeks refused (400) → Ava's Monday 3 PM held and Wednesday 4 PM released:
  one batch, **one email to the Parks listing both dates** → *Cancel rest of week*: 4 lessons and 13 open times held, one
  email per family (3) → the tab shows nothing left, and the same cancel again answers 409. In headless Chrome (an iframe of
  exactly 390px, and 1280px): the tab, picks with Hold, both confirmations, the messages afterwards from real clicks, and the
  no-signal page. **Not checked:** a real phone at a rink (G-32), real emails (SC-21).
- **After the owner's lesson/day/week ruling (2026-11-16):** that run was of the first build (picks across days, now
  removed). The rework was checked by tests — `RinksideWeekServiceTest` (one lesson is a `LESSON` batch; a whole day is
  one `DAY` batch with each lesson's choice; a lesson that started meanwhile is left and counted), `CoachCancelRequestTest`
  (`SELECTION` refused), `AttendanceApiTest` (lessons on two days refused, 400) and the Week tab's web tests — and by the
  rebuilt design's `week`, `week-day` and `week-lesson` in a 390px-wide iframe (no sideways scroll). It wasn't run again
  in the running app; the lesson and day cancels are Batch 5's, unchanged.
