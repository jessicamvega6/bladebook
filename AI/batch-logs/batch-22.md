# Batch 22: Today's lessons and figures

**Built:** 2026-11-16 · merged by PR #53 · back to the [implementation plan](../implementation-plan.md)

This file is a finished record, kept as it was written at the time. What's still open lives in the root
`README.md` (gaps and shortcuts) and `AI/implementation-plan.md` (what's left to build). A section number such as §4
or §6 below means the plan as it was then: its conflicts (§4) and decisions (§6) are now in `AI/plan-history.md`,
and §7 meant these batch logs.

## The plan, as written before it was built

From the plan's batch table. Struck-out text is what was first planned; the text after it is what changed.

**Done** (branch `feature/batch-22-today`, 2026-11-16; §7). **Today's lessons and figures** (G-6, MVP feature 9's home page): the coach's Today list of today's lessons, and the week, unpaid and waiting figures, as designed. Reads only what Batches 4–8 already write. Closed G-6

**Held back by:** — (owner, 2026-11-13: after Batch 14)

## Log

The full list, with what closes each one, is in the root `README.md`.

- **Rulings applied:** the owner's 2026-11-13 order (Batch 22 straight after 14); the 2026-11-09 ruling that the rink card
  comes first, then the figures, as designed. No new ruling was needed: the design (`coach/static/today.html`), the feature
  note and ADR-MASTER agree, and the page reads only what Batches 4–8 write.
- **Built:** `core`: `TodayBoard` (domain, test-driven: today's booked and held times in order, each skater's full name,
  share and attendance, *Next* on the first booked lesson not yet started; the lessons booked in a range; every lesson
  that has started and is still unpaid; the next date with a lesson) and `TodayService` (the coach's time zone; lesson
  times and seats from the earlier of this week's Sunday and the oldest unpaid lesson to Saturday; when today is empty
  and nothing follows this week, the seats to the end of what's stored, once). `PaymentRepository.oldestUnpaid` reads one
  sort key from GSI3 (access pattern 11), which ADR-MASTER §2 and §16 already give `api-coach` through `coach-tenant`.
  `api-coach`: `GET /api/coach/today`. `web`: Today as designed: *Open week view*; the *not working yet* banner (Batch 14)
  and the rink card (Batch 7) kept; the three figures; *Today's lessons* with *Day view*, each row's time, avatar, names,
  length and shares (*"$25 + $25 · shared lesson"*), *Next* and each skater's attendance badge (named per skater when
  shared), lessons already started greyed, a held time as *Held slot · not bookable*, and the note to fix mistakes on
  Lessons; *New families to approve*; and *Go to* with a link to every page (*Email templates* shown as Phase 2).
- **Closed:** G-6.
- **Shortcuts:** none new.
- **Gaps:** none new. Nothing in the design conflicted with an ADR.
- **Owner rulings (2026-11-16)**, on the four questions in PR #53:
  1. **The coach code card goes back on Today, under the three figures**, over the design. It is the same card as on
     Profile → Details (`CodeCard`), so it says *Not working yet* until the business email is confirmed. The Harbor
     Today design (`coach/app.js`, both Today pages) now draws it too, and the root `README.md` names Today first.
  2. **This week counts lesson times, not skaters' lessons:** a shared lesson counts once, and a held or empty time
     not at all (only times with at least one skater booked). The amount is still every skater's share, so a shared
     lesson adds its whole price. Changed test first in `core` (`TodayBoard.booked`); the design's figure counts the
     same way. The page's wording (*"5 lessons, $250 booked"*) didn't mention skaters, so it stays.
  3. **Unpaid stays as built:** every lesson that has started and is still unpaid, the Payments page's rule.
  4. **Times are written "1:00 PM" everywhere** on the coach and family websites (ADR-MASTER §6, amended
     2026-11-16). `formatTime` replaces `formatClock` ("6:30") and `formatShort` ("3pm") in `coach/pages/Today.tsx`,
     `Calendar.tsx` (the week grid), `Schedule.tsx` (each slot in the week view, each block's *"3:00 PM – 7:00 PM"*
     and the *Break* note) and `family/pages/Book.tsx` (a slot's end time) and `Home.tsx`; the Harbor coach and
     client designs the same (`fmtT` for `fmtShortT`, and `schedule.html`'s own short forms). The rinkside page
     (`web/src/rinkside/`, `design/harbor/rinkside/`) was left to its own branch (Batch 23, which made the same
     change); once it merged, `formatClock` and `formatShort` were removed from `schedule.ts`. To fit at 390px:
     Today's time column is 66px and doesn't wrap; Home's *Coming up* time column stays 64px on a phone; the *Break*
     note keeps each time on one line. **Book's *Pick your times* had no phone layout** (the 340px picks column left
     the times about 24px at 390px, whatever the format): it now stacks below 980px, times first, in the app
     (`family.css`) and the design (`screens-booking.css`).
     **Not changed:** the schedule editor's overlap message (*"Morning ice (6–8 AM) and Block 2 (7–9 AM) overlap in
     time."*), which `core` words (`ScheduleRules.range`) and the website repeats; and the emails' times.
  5. **The Calendar week page no longer scrolls sideways on a phone** (owner, 2026-11-16): at 760px and under, a page
     head's buttons wrap their text (`.phead__actions .btn` in `web/src/coach/coach.css` and the design's
     `coach/app.css`, rebuilt), so *Cancel rest of week: …* takes two lines instead of pushing the page to 543px. The
     week grid still scrolls inside its card, as designed. The schedule's overlap error keeps its short times
     (*"6–8 AM"*), and email times weren't checked (owner, 2026-11-16).
- **Settled while building (owner may override):**
  - *(Ruled otherwise 2026-11-16: the card is back on Today.)* **The coach code card leaves Today**, as the design draws it (Batch 1 had put it there while Today had little else).
    The code stays on Profile → Details, sign-up's last steps and the empty *Waiting for approval* tab; the root `README.md`
    now points to Profile → Details.
  - *(Ruled otherwise 2026-11-16: it counts lesson times.)* **This week** is Sunday to Saturday in the coach's time zone and counts each skater's lesson, whatever happened at it
    (the design's `flatMap(skatersIn)`): a shared lesson is two lessons, each at that skater's share, and the amount is
    what they come to. A cancelled lesson isn't counted; a held time has no skater, so isn't either.
  - **Unpaid** counts every lesson that has **started** and is still unpaid, however old, no-shows included, at each
    skater's share: the Payments page's rule, so the two pages agree (the design's demo uses lessons that have ended). It
    isn't limited to this year: it reads back to the oldest unpaid lesson on GSI3.
  - **Waiting for approval** counts skaters and names their families (*"Sarah Park, Olivia Grant"*), or *Nobody waiting*.
    It counts the Students list the app already loads for the nav, so `/api/coach/today` doesn't read it again.
  - *(Ruled otherwise 2026-11-16: "6:00 AM".)* **The time column is the design's `6:00`, with no AM or PM** (the design's `fmtShortT`).
  - **A day with no lessons** says *"Your next lesson is on Wednesday, Nov 18."* (the design's *"…on Friday."*, with the date
    added, as the next lesson can be weeks away), or *"Nothing is booked after today yet."*. Only a coach with no lessons
    today pays for that read.
  - **The greeting and date are the coach's own** (time zone from the profile), not the browser's.
  - **A failed load** shows *"Couldn't load today's lessons"* on the page and leaves the banner, the rink card, the sign-ups
    card and *Go to* working; an expired sign-in goes back to sign in, as on every page.
  - **A booked time with no skater left** (it shouldn't happen) is left out rather than shown empty. A seat still `INVITED`
    isn't in the lesson yet: it isn't listed or counted.
  - **"Time off or special schedule"** opens the schedule hub, where both start; **"Month"** opens this month.
  - **The empty state's spacing:** the design's `.pempty` sits inside the card with room above only; the website adds
    room below (`web/src/coach/coach.css`).
- **Checked in the running app (APIs on :8100 and :8101, Vite on :5190; table `bladebook-b22check`, deleted afterwards):**
  a coach saves Monday, Wednesday and Friday afternoons (30 minutes, $50, two skaters a lesson) → two families sign up and
  are approved, a third is left waiting → the Parks book Ava at 1:00 PM today and invite Leo Martin, who accepts; Jack at
  1:30, Ava at 4:00, Leo at 5:00, Jack at 6:00 (then cancelled by the coach and held), Ava on Wednesday and Leo next
  Monday → at 12:30 Today read *6 lessons, $250 booked* (next Monday's left out), *$0, 0 past lessons*, *1 skater, Wen
  Chen*, and 1:00 (*Ava Park & Leo Martin*, *$25 + $25 · shared lesson*, *Next*), 1:30, 4:00, 5:00 and *Held slot* at
  6:00 → after 1:00, Ava checked in and Leo a no-show on the rinkside page: the 1:00 row greyed with *Ava Attended · Leo
  No-show*, *Next* moved to 1:30, and *Unpaid $50, 2 past lessons*, the same as the Payments page's totals for the same
  lessons → Ava marked paid on Payments: *$25, 1 past lesson*. A second coach with one lesson on Wednesday: *No lessons
  today · Your next lesson is on Wednesday, Nov 18.* Headless Chrome at 1280px and inside a 390px frame: both coaches'
  Today; no sideways scroll. **Not checked:** a lesson from before this week still unpaid (it can't be booked in the
  past locally; `TodayServiceTest` covers it against DynamoDB Local), and a coach with more than one currency.
