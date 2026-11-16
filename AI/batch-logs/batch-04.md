# Batch 4: Book one lesson

**Built:** 2026-11-11 · merged by PR #22 · back to the [implementation plan](../implementation-plan.md)

This file is a finished record, kept as it was written at the time. What's still open lives in the root
`README.md` (gaps and shortcuts) and `AI/implementation-plan.md` (what's left to build). A section number such as §4
or §6 below means the plan as it was then: its conflicts (§4) and decisions (§6) are now in `AI/plan-history.md`,
and §7 meant these batch logs.

## The plan, as written before it was built

- **Core (TDD):**
  - `BookingWindow`: today through the end of the month two months ahead, in the coach's time zone, with the edges tested.
  - Seat capacity.
  - Idempotency-key outcome classification (booked / already yours / unavailable).
  - Price share for one skater.
- **Slice:** pick a day, pick times, confirm, then results.
  - The coach's week view shows the skater's name.
- **Rulings (2026-11-08):**
  - B1: the results page gives one merged message for a failed date, never a separate reason.
  - B5: the day view shows only days inside the booking window.
  - **Redrawn 2026-11-08:** `client/screens-booking.js` (one message on the results page; the day strip stops at the window's edges) and `client/app.js` (every coach's notice is 24 hours).

## Log

The full list, with what closes each one, is in the root `README.md`.

- **Rulings applied:** B1 (one message for every date that couldn't be booked, *"That time was taken or
  no longer exists."*), B5 (the day view and its arrows stay inside the booking window), B6 (the page
  shows the lesson's stamped notice, 24 hours for every coach).
- **Closed:** G-16 (the approved family's Home: *Book a lesson*, Today, Coming up, *Go to*; *Book a
  lesson* open in the menu). G-11 in part: the calendars name who is booked; the cancel buttons are
  Batch 5.
- **Shortcuts:** SC-11 no confirmation email (the result page keeps the designed wording, as SC-9 does);
  SC-12 the never-linked security event goes to the application log, with no access-log group or alarms.
- **Gaps:** G-20 repeating bookings (Batch 9); G-21 sharing at booking (Batch 11); G-22 the clash warning
  across coaches (not yet placed); G-23 My bookings (Batch 5); G-24 special schedules and time off on the
  family's pages (Batch 6); G-25 GSI2, GSI3 and `paymentStatus` on seats (Batches 8 and 13); G-26 ADR-022's
  allowlist for lesson-time and seat attributes.
- **Settled while building (owner may override):**
  - **The family website now gets the family's own IDs:** each skater's `studentId`, and the `coachId` of
    each coach who has approved one of its skaters. Batch 3 sent none; booking has to name both, and
    `ClientLinks.requireActive` checks them against the family's links (ADR-MASTER §16). A waiting
    family still gets no coach ID, so it reads nothing of a coach but the name.
  - **`ClientLinks.requireActive(caller, coachId, studentId)`** takes the coach as well as the skater
    (ADR-MASTER §16 names only the skater): a skater has one link per coach, and booking needs the one
    for that coach.
  - **A never-linked skater answers `404 NOT_FOUND`**, a new error kind (`NO_SUCH_ITEM`), so the website
    can't mistake it for a family with no account (`NO_ACCOUNT`, which sends it to sign-up).
  - **One booking page call returns the whole window** (about three months of one coach's times), so the
    months' counts, the calendar and the day views need no further reads.
  - **The booking transaction also checks the start and length the family read**, so the seat's copies of
    them are right; a time that changed since the read is *unavailable*. A time already taken skips the
    write and goes straight to the seat read.
  - **Limits:** up to 50 picks in one request; a repeated pick is dropped. A pick before today is refused
    with *"That date has already passed."* (the window's *"further ahead"* wording didn't fit).
  - **The seat's `studentName` is the display form, "Ava P."** (first name, last name's initial), as
    ADR-031 says; the coach's week view shows it, and the day view shows the full name and the family
    contact from the coach's own `STUDENT#` record.
  - **Home's Today uses each lesson's coach's time zone**, like every other date.
  - **Both booking pages name the time zone:** *"Times are in Coach Dana's time zone, Central — Chicago."*
  - **The result page's second button is *Back to home*** until My bookings exists (Batch 5); the design's is
    *View my bookings*.
  - **A booking request that fails is resent once by the website with the same key**, then offers
    *Try again*, which resends it again with that key; a refusal (409, 400) offers no *Try again*.
- **Found while building:** `CalendarService` needed a `StudentRepository` bean in `api-coach`, which
  Batch 3 had built inline; it is now a bean of its own.
- **Checked in the running app (APIs only; table `bladebook-b4check`):** a coach signs up and saves two
  blocks, one unnamed → a guardian signs up two skaters (no coach ID while waiting) → the coach approves
  one → the booking page (the coach's zone, today, the window, 100 times) → booking a real time and a time
  with no lesson (booked, and the one message) → the same request again (booked, nothing twice) → a new
  request for the same time (already booked) → the waiting skater (409, the product wording) → someone
  else's skater (404) → Home's lessons → the coach's calendar naming "Ava P.", "Ava Park", "Sarah Park".
  **Not checked in a browser**: no browser was available to this session.
