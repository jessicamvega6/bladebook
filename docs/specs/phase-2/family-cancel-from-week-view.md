# Spec: A family cancels their own lesson from the week view (Phase 2)

**Status:** Draft — 2026-11-16
**Sources:** `FeatureDecriptions/cancelation.md` ("Make note for phase 2", "Client cancelation",
"Shared lessons", "Cancelations cannot happen on bookings in the past or happening now"); ADR-009
(decisions 1, 2, 9, 11); ADR-031 (decisions 2, 5, 8); ADR-033 decision 4; ADR-MASTER §8 ("Leaving",
"Ending an invitation"), §9 ("Change-batch records"), §10 ("General", "By the family"), §13 and §24;
`FeatureDecriptions/Bookings:` (the day view); `docs/architecture.md` §10
**Depends on:** Minimum Viable Product (MVP) per-lesson cancel from My bookings (the same operation from a second place); MVP
family booking calendar
**Out of scope:** charging the missed-lesson fee (Phase 2, its own spec; until it switches on the
wording stays "may"); recurrence management (MVP, My bookings); the coach's week view (MVP)

## Summary

In MVP a family cancels a lesson only from My bookings. In Phase 2 a family can also tap their own
lesson on the calendar's week view and cancel it there, with a cancel confirmation. It is the same
per-lesson cancel, so every rule for cancelling one lesson applies unchanged.

## Assumed in every example

- Now is Monday 16 November 2026, 10:00, in the coach's time zone.
- Coach Dana's notice period (`requiredNoticeHours`) is 24 hours; her lessons are 30 minutes at $50.
- The Reyes family's skater Mia R. has a private lesson with Coach Dana on Wednesday 18 November 2026
  at 16:00 (seat `SEAT#2026-11-18#16:00#<Mia's studentId>`, `seatStatus = BOOKED`).
- Coach Dana has not turned on `smsCancellationAlerts`.

## 1. Where cancel is offered

**1.1 The family's own lesson offers cancel**
- **Given** the Reyes family is viewing the week of 15–21 November 2026
- **When** they tap Mia's lesson on Wednesday 18 November at 16:00
- **Then** they are offered the option to cancel it
*(source: `cancelation.md`, "Make note for phase 2": "clicking the lesson slot on the Week view if the
booking belongs to the client clicking will give the option to cancel")*

**1.2 A taken time that isn't theirs offers nothing**
- **Given** Wednesday 18 November at 16:30 is booked by another family and shows "Taken"
- **When** the Reyes family taps it
- **Then** no cancel option is offered, and nothing about who holds it is shown
*(source: `cancelation.md`, "Make note for phase 2", "if the booking belongs to the client clicking";
`FeatureDecriptions/Bookings:`, "A taken time says only 'Taken'")*

**1.3 A lesson that has started can't be cancelled**
- **Given** Mia also had a lesson today, Monday 16 November, at 09:30, which shows "Past"
- **When** the Reyes family taps it
- **Then** no cancel option is offered
*(source: `cancelation.md`, "Cancelations cannot happen on bookings in the past or happening now";
`FeatureDecriptions/Bookings:`, every time that has started says "Past")*

## 2. Confirming

**2.1 Cancel asks for confirmation first**
- **Given** the Reyes family has chosen to cancel Mia's Wednesday 18 November 16:00 lesson
- **When** the cancel confirmation opens
- **Then** it shows the lesson (Wednesday 18 November, 16:00, 30 minutes, $50)
- **And** it says the time goes back on the coach's calendar
- **And** its buttons are "Keep lesson" and "Cancel lesson"
*(source: `cancelation.md`, "Make note for phase 2", "also have cancel confirmation"; "Client
cancelation", Design)*

**2.2 Dismissing the confirmation keeps the lesson**
- **Given** the cancel confirmation for Mia's Wednesday lesson is open
- **When** the Reyes family taps "Keep lesson"
- **Then** nothing is written and the lesson stays booked
*(source: `cancelation.md`, "Client cancelation", Design)*

**2.3 A late cancel warns about the fee**
- **Given** Mia has a lesson on Tuesday 17 November 2026 at 08:00, 22 hours away
- **When** the Reyes family opens the cancel confirmation for it
- **Then** it shows the warning "Inside the 24-hour notice period. Coach Dana may charge a late
  cancellation fee."
- **And** it says the coach will be told
*(source: `cancelation.md`, "Client cancelation", Design and the owner's ruling of 2026-11-09)*

**2.4 A repeating lesson says the rest of the series isn't affected**
- **Given** Mia's Wednesday 16:00 lesson is part of a weekly series
- **When** the Reyes family opens the cancel confirmation for 18 November
- **Then** it says the other lessons in the series aren't affected
*(source: `cancelation.md`, "Client cancelation", Design)*

## 3. What cancelling does

**3.1 An in-time cancel releases the time and tells no one but the family**
- **Given** the cancel confirmation for Mia's Wednesday 18 November 16:00 lesson is open (54 hours
  away)
- **When** the Reyes family taps "Cancel lesson"
- **Then** Mia's seat is moved to a `CANCELLED#` line with `cancelledBy = CLIENT`, `cancelledAt` and
  `noticeHours = 54`, in one transaction with a `CHANGEBATCH#` header, both already `EXECUTED`
- **And** the lesson time goes back to `OPEN`
- **And** Coach Dana is not emailed
- **And** no fee is recorded or charged
*(source: ADR-MASTER §9, "Change-batch records"; §10, "General" and "By the family"; ADR-031 decisions 2
and 8; `cancelation.md`, "Coach told about a client cancellation")*

**3.2 A late cancel tells the coach**
- **Given** Mia's lesson on Tuesday 17 November 2026 at 08:00 is 22 hours away
- **When** the Reyes family confirms its cancel from the week view
- **Then** the seat moves to a `CANCELLED#` line with `noticeHours = 22`
- **And** Coach Dana is emailed about the late cancellation, one email for the batch listing the
  lesson
- **And** no text is sent, because `smsCancellationAlerts` is off
*(source: ADR-MASTER §13, "Family cancelled"; ADR-009 decision 9 as amended 2026-10-08; `cancelation.md`,
"Coach told about a client cancellation")*

**3.3 Cancelling never changes the schedule**
- **Given** Mia's Wednesday 18 November lesson is cancelled (3.1)
- **When** another family views Wednesday 18 November
- **Then** 16:00 shows as open and the coach's weekly schedule is unchanged
*(source: ADR-MASTER §10, "Cancelling never changes the schedule"; ADR-031 decision 8, the lesson time
reopens when its last seat goes)*

## 4. Shared lessons

**4.1 The confirmation shows the family's own share**
- **Given** Mia's Wednesday 18 November 16:00 lesson is shared with Ava (joined), `priceMinor` $50,
  `shareCount = 2`
- **When** the Reyes family opens the cancel confirmation from the week view
- **Then** it shows Mia's share, $25
*(source: `cancelation.md`, "Shared lessons": "The pop-up shows their share of the price"; ADR-MASTER §8,
"Price shares")*

**4.2 An in-time leave asks the other family to keep or cancel**
- **Given** the shared lesson in 4.1 is 54 hours away
- **When** the Reyes family confirms the cancel
- **Then** Mia's seat moves to a `CANCELLED#` line and `seatsTaken` drops to 1
- **And** the lesson time records a `pendingLeave` with `answerBy` = Tuesday 17 November 2026, 16:00
  (the start of the notice period, which comes before 7 days after the leave)
- **And** Ava's family is emailed the "keep at full price or cancel" question
*(source: ADR-031 decision 8; ADR-MASTER §8, "Leaving" and "Who sends what"; `cancelation.md`, "Shared
lessons")*

**4.3 Cancelling while the invitation is unanswered ends it**
- **Given** the Reyes family booked Wednesday 18 November 16:00 and invited Ava, whose seat is still
  `INVITED`
- **When** the Reyes family confirms the cancel of Mia's lesson from the week view
- **Then** in the same transaction Ava's invited seat moves to `SEATEND#` as `WITHDRAWN`
- **And** the lesson time goes back to `OPEN`
*(source: ADR-033 decision 4; ADR-MASTER §8, "Ending an invitation")*

**4.4 An invited seat isn't the invited family's to cancel**
- **Given** the Reyes family has been invited to put Mia in another family's lesson on Thursday 19
  November at 16:00, and Mia's seat there is still `INVITED`
- **When** the Reyes family taps that lesson in the week view
- **Then** no cancel option is offered; the invitation is answered by accepting or declining instead
*(source: ADR-031 decision 5, the invited seat is the inviting family's record until accepted;
`cancelation.md`, "Make note for phase 2", "if the booking belongs to the client clicking")*

## 5. Rules that must always hold

- The week view's cancel is the per-lesson cancel: same checks, records, emails and fee rules as the
  Cancel button in My bookings. *(`cancelation.md`, "Client cancelation", "Make note for phase 2")*
- A lesson that has started, is checked in or is marked a no-show can't be cancelled.
  *(`cancelation.md`; ADR-MASTER §10, "General")*
- Every cancellation writes a `CHANGEBATCH#` header and one `CANCELLED#` line per seat, with
  `cancelledAt` and `noticeHours`. *(ADR-MASTER §9, §10)*
- The coach is told about a family's cancellation only when it is inside `requiredNoticeHours`.
  *(ADR-MASTER §10, §13)*
- A family's own cancellation made with enough notice is never charged, in any phase. *(ADR-009
  decision 11; `cancelation.md`, "Who is charged")*
- There is no reschedule: moving a lesson is book the new time, then cancel the old one.
  *(`cancelation.md`, "Business decision"; ADR-MASTER §7, "Rescheduling")*

## Open questions

1. **Which screen is "the week view" for a family?** `cancelation.md` names the family's Week view, and
   `docs/architecture.md` §10 MVP feature 4 gives the client a Sunday–Saturday week view, but since
   2026-11-11 the family's booking calendar has no week links: a family opens a day, and the day
   view's strip shows its week (`FeatureDecriptions/Bookings:`, "Calendar and week view"). Whether
   cancel is offered on the day view's timeline, the week strip, or a separate week view is not
   stated.
2. **Is the confirmation the same pop-up as My bookings'**, word for word? The note says only "also
   have cancel confirmation".
3. **With more than one coach**, does the week view show (and offer cancel on) lessons with every
   coach, or only the coach whose times are on screen? The booking pages show one coach at a time
   (ADR-MASTER §7, "Booking with more than one coach").
4. **Does tapping a family's own lesson keep or clear any picks** made on the booking page? Not stated.
5. **Once the Phase 2 charge switches on**, whether the warning in 2.3 becomes a definite "will incur"
   with an amount is decided with the charge (`cancelation.md`, "What the family is told").
