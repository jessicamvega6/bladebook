# Spec: A coach books a lesson for a family (Phase 2)

**Status:** Draft — 2026-11-16
**Sources:** ADR-MASTER §7 and §24, ADR-031 (decisions 1, 3, 4 and Open), ADR-033 (decision 1,
Alternatives, Revisit if), ADR-025 (decision 5, amendment 2026-10-13 f), `FeatureDecriptions/Bookings:`
(the booking window; "More than one coach"), `FeatureDecriptions/cancelation.md` ("Mark this as a
phase 2 feature"), `FeatureDecriptions/Schedule lesson split` ("Coach acceptance"),
`docs/Open-Pending.md` §4, `docs/architecture.md` §10
**Depends on:** Minimum Viable Product (MVP) booking (lesson times, seats, the booking confirmation email); MVP coach approval
of skaters
**Out of scope:** coach-arranged sharing (a coach adding a second skater to a lesson), which was
considered and not chosen (ADR-033 Alternatives); a coach booking their own skater, which is an open
question in `FeatureDecriptions/Coach Who Is Also a Parent.md`; the family's own booking flow (MVP)

## Summary

A coach books a lesson time for one of their skaters, on the family's behalf, instead of the family
booking it on the family website. Very little of this feature is decided yet: the sources fix only
that it is Phase 2 and that the rules every booking follows still apply. Most of its behaviour is
listed under Open questions.

## Assumed in every example

- Now is Monday 16 November 2026, 10:00, in the coach's time zone.
- Coach Dana teaches at Pelham Civic Center (PCC). Her notice period (`requiredNoticeHours`) is 24
  hours.
- The family website's booking window on 16 November runs to Sunday 31 January 2027.
- Mia R. is a skater in the Reyes family. A lesson time is a stored `LESSON#` record; a seat is one
  skater's place in it (`SEAT#`).

## 1. Who can be booked

**1.1 A skater the coach hasn't accepted can't be booked**
- **Given** Mia is `PENDING` with Coach Dana
- **When** Coach Dana books Mia into the 16:00 lesson time on Tuesday 24 November 2026
- **Then** nothing is booked: no seat is written and the lesson time stays `OPEN`
*(source: `FeatureDecriptions/Schedule lesson split`, "Coach acceptance": "A student must always be
accepted by the coach before any lessons are booked for that student"; ADR-033 decision 1)*

**1.2 A skater the coach has accepted is booked into an open time**
- **Given** Mia is `ACTIVE` with Coach Dana
- **And** the lesson time `LESSON#2026-11-24#16:00` is `OPEN`
- **When** Coach Dana books Mia into it
- **Then** the lesson time becomes `BOOKED`, with `seatsTaken = 1` and `shareCount = 1`
- **And** a seat `SEAT#2026-11-24#16:00#<Mia's studentId>` is stored with `seatStatus = BOOKED` and
  the Reyes family's `clientId`
*(source: ADR-031 decisions 1, 2 and 4; ADR-MASTER §7, "Booking a time")*

## 2. Times that can't be booked

**2.1 A taken time is refused**
- **Given** the lesson time `LESSON#2026-11-24#16:00` is `BOOKED` for another skater
- **When** Coach Dana books Mia into it
- **Then** nothing is booked for Mia, and the other skater's seat is unchanged
*(source: ADR-031 decision 1, the lesson time is the lock; ADR-MASTER §7, "Lesson times")*

**2.2 A held time is refused**
- **Given** Coach Dana cancelled the 16:00 lesson on Tuesday 24 November 2026 earlier and held it,
  so the lesson time is `HELD`
- **When** Coach Dana books Mia into it
- **Then** nothing is booked: a booking needs the lesson time to be `OPEN`
*(source: ADR-031 decision 1; ADR-009 decision 5 as amended by ADR-031)*

**2.3 A lesson that has started is refused**
- **Given** the lesson time `LESSON#2026-11-16#09:30` is `OPEN` and started at 09:30 today
- **When** Coach Dana books Mia into it at 10:00
- **Then** nothing is booked: a booking needs `startsAtUtc` to be in the future
*(source: ADR-MASTER §7, "Booking a time")*

## 3. What the family is told

**3.1 The family gets the ordinary booking confirmation**
- **Given** Coach Dana has booked Mia into the 16:00 lesson on Tuesday 24 November 2026 (1.2)
- **When** the seat becomes `BOOKED`
- **Then** the Reyes family is emailed a booking confirmation, sent once, guarded by
  `confirmationSent` on the seat
- **And** the email's `Reply-To` is Coach Dana's `businessEmail`
*(source: ADR-MASTER §13, "Per message", booking confirmation and "Rules for every email"; ADR-031
decision 14, `LessonBooked` fires per seat)*

## 4. Rules that must always hold

- A lesson is booked only for a skater `ACTIVE` with that coach. *(Schedule lesson split, "Coach
  acceptance"; ADR-033 decision 1)*
- A booking changes the lesson time from `OPEN` to `BOOKED`; one seat per skater per lesson; no
  amount is stored on a seat. *(ADR-031 decisions 1, 2 and 7)*
- Every lesson time is shown in the coach's time zone. *(ADR-MASTER §6, "Calendars")*
- Every family-facing email sets `Reply-To` to the coach's `businessEmail`. *(ADR-MASTER §13)*

## Open questions

1. **Is a coach booking for a family held to the 3-month booking window?** (ADR-031 decision 3 and
   Open; ADR-MASTER §25 "Settings and details"; `docs/Open-Pending.md` §4;
   `FeatureDecriptions/Bookings:`, the booking window)
2. **Is the coach told about a clash** with the skater's lessons with another coach? Today only the
   family is warned, and the warning can miss a clash made a second or two earlier; both are to be
   revisited with this feature. (ADR-025 amendment 2026-10-13 f; `docs/Open-Pending.md` §4;
   `FeatureDecriptions/Bookings:`, "More than one coach")
3. **Can a coach book a repeating series** for a family, and if so with which frequency, end-date cap
   and `RECURRENCE#` header (normally written in the family's own partition)? Not stated.
4. **Does the family agree first?** A family's booking is their own write. Whether a coach's booking
   needs the family's consent, or just informs them, is not stated. ADR-033 turned down
   coach-arranged sharing partly because it "drops the second family's in-app consent".
5. **What the confirmation email says** when the coach made the booking, and whether it differs from
   the family's own confirmation. Not stated.
6. **Which surface the coach books from** (week view, day view, student list) and what it shows. Not
   designed.
7. **Can the coach book a shared lesson** (an invitation or a sibling) for a family? ADR-033 says a
   coach booking for a family "would make coach-arranged sharing cheap" and lists that as a reason to
   revisit (ADR-033 Revisit if); nothing is decided.
8. **Who can cancel a lesson the coach booked**, and is a family's cancellation of it charged and
   notified under the ordinary per-lesson rules? Not stated.
9. **How the write is authorised.** A family's booking runs in the family's session with
   `requireActive`; a coach's would run in `api-coach` in the coach's partition. Which checks and
   gate-test rows it needs is not stated (ADR-021, ADR-022, ADR-024).
10. **A coach who is also a parent booking their own skater** with themselves: open in
    `FeatureDecriptions/Coach Who Is Also a Parent.md`, question 4.
