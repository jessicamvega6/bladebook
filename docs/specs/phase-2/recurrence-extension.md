# Spec: Recurrence extension (Phase 2)

**Status:** Draft — 2026-11-16
**Sources:** ADR-MASTER §7 ("Recurring bookings", "Booking a time"), §10 ("By the family"), §14 and
§24; ADR-009 (decision 4c "Why extension is excluded", Open "Two recurrences where there should be
one"); ADR-006 (decisions 4, 4a, 4b); ADR-031 (decisions 1, 3, 4, 9, 12); `FeatureDecriptions/Bookings:`
(the confirmation page); `FeatureDecriptions/cancelation.md` ("Client recurrence management");
`docs/Open-Pending.md` §5; `docs/architecture.md` §10
**Depends on:** Minimum Viable Product (MVP) repeating bookings (`recurrenceId`, `RECURRENCE#` header, `bookedIntervalWeeks`);
MVP recurrence management (the "Change" page); `sched-lesson-roller` (the lesson-time roller)
**Out of scope:** increasing a series' frequency, which stays not allowed; moving the end date
earlier, reducing the frequency and cancelling all future lessons (MVP, `cancelation.md`)

## Summary

A family moves the end date of one of their repeating series later, so the series runs longer. The
new dates are booked as real lessons when the family saves, the same way the series' first dates
were: the series is "materialized" again for the added dates. It exists so a family who wants more
lessons doesn't have to book a second series alongside the first.

## Assumed in every example

- Now is Monday 16 November 2026, 10:00, in the coach's time zone.
- Coach Dana's notice period (`requiredNoticeHours`) is 24 hours; her 16:00 Monday lessons are $50.
- The Reyes family's skater Mia R. has a private repeating series with Coach Dana: Mondays at 16:00,
  every week (`intervalWeeks = 1`), from 7 September 2026 to Monday 28 December 2026. Its header is
  `CLIENT#<Reyes clientId>/RECURRENCE#<coachId>#<recurrenceId>` with `endDate = 2026-12-28` and
  `recurrenceStatus = ACTIVE`.
- `sched-lesson-roller` has stored Coach Dana's lesson times about 15 months ahead (the end of the
  booking window plus 12 months), so every Monday 16:00 lesson time up to then exists.

## 1. Extending a series

**1.1 New dates are booked as real lessons**
- **Given** the lesson times for Mondays 4, 11, 18 and 25 January 2027 at 16:00 are all `OPEN`
- **When** the Reyes family moves the series' end date from 28 December 2026 to 25 January 2027
- **Then** each of the four new dates is booked in its own transaction: the lesson time becomes
  `BOOKED` and a `BOOKED` seat is stored for Mia
- **And** the existing lessons from 23 November to 28 December 2026 are unchanged
*(source: `docs/architecture.md` §10, "re-runs materialization"; ADR-009 decision 4c, "Why extension
is excluded"; ADR-006 decision 4; ADR-031 decision 4)*

**1.2 The header records the new end date**
- **Given** the extension in 1.1 has booked at least one new date
- **When** the extension finishes
- **Then** the series' `RECURRENCE#` header has `endDate = 2027-01-25`
*(source: `docs/architecture.md` §10, "moving a recurrence's end date later"; ADR-006 decision 4a, the
header records the requested end date)*

**1.3 Dates that can't be booked are reported, the rest stand**
- **Given** the lesson time for Monday 11 January 2027 at 16:00 is `BOOKED` by another family
- **And** the other three new dates are `OPEN`
- **When** the Reyes family moves the end date to 25 January 2027
- **Then** 4, 18 and 25 January are booked for Mia
- **And** 11 January is listed as not booked with the one reason "That time was taken or no longer
  exists."
- **And** nothing tells the family that another family holds 11 January
*(source: ADR-006 decision 4, partial success and the merged reason; ADR-031 decision 4;
`FeatureDecriptions/Bookings:`, result wording reworded by the owner 2026-11-09)*

**1.4 Each new lesson is confirmed to the family**
- **Given** the extension in 1.1 booked four new dates
- **When** each new seat becomes `BOOKED`
- **Then** the Reyes family gets the booking confirmation for it, sent once per seat and guarded by
  `confirmationSent`
*(source: ADR-MASTER §13, booking confirmation; ADR-031 decision 14)*

## 2. Rules that must always hold

- **The interval never goes up.** A family can't make a series more frequent; wanting more lessons
  per week means booking another series. *(ADR-MASTER §10, "By the family"; ADR-009 decision 4;
  `cancelation.md`, "Client recurrence management")*
- **Each date is its own transaction**, issued in parallel with failures collected, never
  `BatchWriteItem`. *(ADR-006 decision 4; ADR-031 decision 4)*
- **A booking needs an `OPEN` lesson time whose start is in the future.** *(ADR-MASTER §7, "Booking a
  time")*
- **The header is never deleted by the application**, and bookings stay authoritative for what is
  actually scheduled; the header only describes the arrangement. *(ADR-006 decision 4b; ADR-009
  decision 4c)*
- **The two reasons a date can't be booked are always given as one reason.** *(ADR-006 decision 4;
  `FeatureDecriptions/Bookings:`)*

## Open questions

1. **"Twelve months from when?"** A new series' end date is capped at 12 months after its first
   lesson. Whether an extension is capped from the series' first lesson, from today, or from
   somewhere else is unanswered (ADR-009 decision 4c names it as needing "a fresh answer").
2. **Is an extension held to the booking window?** A new series is checked on its first pick only;
   what an extension's added dates are checked against is not stated (ADR-031 decision 3).
3. **Do the new seats keep the series' `recurrenceId`?** ADR-009's Open says the strongest reason to
   build extension is avoiding two `recurrenceId`s for one arrangement, but no rule says the added
   seats share it, or what their `bookedIntervalWeeks` is after a frequency change.
4. **Which dates are added after a frequency change.** After "make it less frequent" the surviving
   dates count from an anchor (ADR-009 decision 4b). Whether the added dates step from the last
   booked date, the anchor or the header's `startedOn` is not stated.
5. **Can a shared series be extended?** While a series is shared, only "cancel one lesson" and
   "cancel the series" are offered (ADR-031 decision 9), a rule written before extension existed.
   Whether extension is hidden too, and whether added dates carry the invitation, is not stated.
6. **Can an `ENDED` series be extended**, or one whose last lesson has passed? Not stated.
7. **What if the new end date is past the roller's horizon?** Lesson times exist only to about 15
   months ahead (ADR-031 decision 1); dates beyond it would have no lesson time. Not stated.
8. **What the "Change" page shows** for an extension (preview of added dates, totals, button wording)
   and what the result page says. Not designed.
9. **Does an extension write a `RECURRENCE#` header update before or after the new dates**, and how a
   retry of a half-finished extension is recognised (idempotency key, `recurrenceId` derivation)?
   ADR-006 decision 4b covers a new series only.
10. **Is the coach told** when a family extends a series? Not stated (the coach is told about a
    family's cancellation only inside the notice period, ADR-MASTER §13).
