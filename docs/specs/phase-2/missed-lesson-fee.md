# Spec: Missed-lesson fee — late-cancellation and no-show charges (Phase 2)

**Status:** Draft — 2026-11-16
**Sources:** ADR-015 (decisions 1, 1a, 2, 3, 4, 5, 6 and every amendment), ADR-009 (decisions 1, 3, 11
and their amendments), ADR-031 (decisions 1, 2, 7, 8), ADR-026 (Status amendment 2026-10-13),
ADR-020 (decisions 2, 3), ADR-003 (decision 4 and its amendments of 2026-08-30, 2026-10-09 and
2026-10-12), ADR-018 (decisions 1, 3, 4), ADR-030 (decision 2), ADR-017 (via ADR-MASTER §20),
`FeatureDecriptions/cancelation.md` ("Client cancelation", "Client recurrence management",
"Late-cancellation and missed-lesson fee"), `FeatureDecriptions/Coach Payment Section on Dashboard.md`,
`FeatureDecriptions/Schedule Creater.md` (MF), `FeatureDecriptions/Re-pricing Booked Lessons.md`,
`FeatureDecriptions/Schedule lesson split` ("A skater calls out"), `FeatureDecriptions/Email templates Needed:`
("Unpaid lessons", "Missed-lesson fee reminder"), `FeatureDecriptions/Coach Financial Page.md`
("What counts as gross"), ADR-MASTER §3, §10, §12, §20, §24, §25, `docs/architecture.md` §5 data
model and §6.3.
**Depends on:** Minimum Viable Product (MVP) cancellation by family, coach and schedule change (ADR-MASTER §10); MVP
attendance on the rinkside page (§11); MVP payment dashboard, mark paid, mark waived and weekly
unpaid reminder (§12); the schedule editor (§6); re-pricing (§9); shared lessons (§8).
**Out of scope:** editing the notice period (`notice-period-editing.md`); the coach's manual
*send payment reminder* (`manual-payment-reminder.md`); personal prices (`personal-prices.md`);
a family's own unpaid and cancellation history (`FeatureDecriptions/C_Client Payments.md`,
`FeatureDecriptions/cancelation.md`); text messages (SMS) to families (`FeatureDecriptions/SMS Messages.md`);
in-app payments and refunds (not designed).

## Summary
From Phase 2 a coach can charge a **missed-lesson fee**: one amount, set per block in the schedule
editor, owed for a no-show or for the family's own cancellation inside the coach's notice period.
Families see the fee before they book. A charged late cancellation becomes a payable
`CANCELLED#` line on the coach's payment dashboard beside unpaid lessons, and the coach marks it
paid or waived as for any lesson. BladeBook still never moves money.

## Assumed in every example
- Coach Dana Park teaches in US dollars (USD), time zone `America/Chicago`. Her notice period
  (`requiredNoticeHours`) is 24 hours.
- Her Tuesday and Monday block makes 30-minute private lessons at $50.00 (`priceMinor = 5000`)
  with a missed-lesson fee of $25.00 (`missedLessonFeeMinor = 2500`), up to 2 skaters per lesson.
- Skater Mia R. (family: the Rossi family) and skater Leo T. (family: the Tran family) are
  `ACTIVE` with Dana.
- Now is **Monday 2027-03-01 10:00** in Dana's time zone, unless a scenario says otherwise.
- "Today's lesson" is Monday 2027-03-01 16:00 (6 hours away). "Tomorrow's lesson" is Tuesday
  2027-03-02 16:00 (30 hours away).

## 1. Setting the fee in the schedule editor

**1.1 The fee field sits beside the price on every block**
- **Given** Dana is editing a block on her weekly schedule
- **When** she looks at the block's fields
- **Then** a missed-lesson fee field (MF) is shown beside *Price per lesson*, as an amount in her
  sign-up currency
- **And** its hint reads *"charged for a no-show or a cancellation inside your notice period."*
*(source: FeatureDecriptions/Schedule Creater.md, "(MF) Missed-lesson fee"; ADR-015 d2)*

**1.2 Each block has its own fee**
- **Given** Dana has a 30-minute block at $50.00 and a 60-minute block at $80.00
- **When** she sets the 30-minute block's fee to $25.00 and the 60-minute block's fee to $40.00 and saves
- **Then** the schedule stores `missedLessonFeeMinor = 2500` on the first block and `4000` on the second
*(source: ADR-015 d2; FeatureDecriptions/cancelation.md, "Where the coach sets it")*

**1.3 A fee of 0 means no charge**
- **Given** Dana is editing her 60-minute block
- **When** she sets its fee to $0.00 and saves
- **Then** the block stores `missedLessonFeeMinor = 0`, and no lesson made from it is ever charged
  for a late cancellation
- **And** no separate on/off setting exists on her profile
*(source: ADR-015 d2; FeatureDecriptions/cancelation.md, "Where the coach sets it")*

**1.4 The fee and the notice period are stamped on each lesson time**
- **Given** the 30-minute block has a $25.00 fee and Dana's profile has `requiredNoticeHours = 24`
- **When** `sched-lesson-roller` makes the lesson time for a date covered by that block
- **Then** the `LESSON#` item carries `missedLessonFeeMinor = 2500`, `requiredNoticeHours = 24`,
  `priceMinor = 5000` and `currency = USD`
*(source: ADR-031 d1; ADR-015 d3 and its 2026-10-13 amendment)*

## 2. Changing a block's fee

**2.1 A lower fee reaches every upcoming lesson at once**
- **Given** today's and tomorrow's lessons are booked with `missedLessonFeeMinor = 2500`
- **When** Dana lowers the block's fee to $15.00 and saves
- **Then** both lesson times are changed to `missedLessonFeeMinor = 1500`, including today's,
  which is inside the notice period
*(source: ADR-020 d2, d3; FeatureDecriptions/Re-pricing Booked Lessons.md, "The missed-lesson fee follows the same rules")*

**2.2 A higher fee reaches only lessons beyond the notice period**
- **Given** today's and tomorrow's lessons are booked with `missedLessonFeeMinor = 2500`
- **When** Dana raises the block's fee to $35.00 and saves
- **Then** tomorrow's lesson time (30 hours away) is changed to `missedLessonFeeMinor = 3500`
- **And** today's lesson time (6 hours away, inside 24 hours) keeps `missedLessonFeeMinor = 2500`
*(source: ADR-020 d2, d3; FeatureDecriptions/Re-pricing Booked Lessons.md)*

**2.3 Past lessons never change**
- **Given** Mia's lesson on Monday 2027-02-22 16:00 is past, with `missedLessonFeeMinor = 2500`
- **When** Dana changes the block's fee to $15.00 and saves
- **Then** that lesson time keeps `missedLessonFeeMinor = 2500`
*(source: ADR-020 d1, d3)*

## 3. What the family is told

**3.1 The fee is shown before the family books**
- **Given** tomorrow's lesson time is open with `missedLessonFeeMinor = 2500`
- **When** the Rossi family opens Dana's booking page
- **Then** the page states the $25.00 fee for that lesson before they commit (wording not yet fixed)
*(source: ADR-015 d6; FeatureDecriptions/cancelation.md, "What the family is told"; ADR-MASTER §24)*

**3.2 A lesson with no fee shows no fee wording**
- **Given** a 60-minute lesson time with `missedLessonFeeMinor = 0`, booked by the Rossi family
- **When** the Rossi family opens the cancel confirmation for it 6 hours before it starts
- **Then** the confirmation carries no late-cancellation fee wording
*(source: FeatureDecriptions/cancelation.md, "Where the coach sets it": "the client-facing wording drops away")*

**3.3 Cancelling inside the notice period is warned about, worked out live**
- **Given** Mia is booked into today's lesson, which is stamped `requiredNoticeHours = 24` and
  `missedLessonFeeMinor = 2500`
- **When** the Rossi family opens the cancel confirmation at 10:00 (6 hours before the start)
- **Then** the confirmation shows the late-cancellation warning, worked out from the 6 hours'
  notice against the lesson's stamped 24 hours (its Phase 2 wording is an open question)
*(source: ADR-015 d6; FeatureDecriptions/cancelation.md, "Client cancelation")*

**3.4 Recurrence management names each late lesson before the family accepts**
- **Given** Mia has a weekly series on Tuesdays at 16:00 through 2027-06-29, every lesson with a
  $25.00 fee, and now is **Monday 2027-03-01 20:00**
- **When** the Rossi family chooses *Cancel all future lessons*
- **Then** the confirmation names Tuesday 2027-03-02 16:00 (20 hours away, inside the notice
  period) and warns that a late cancellation fee applies to it (wording: open question 2)
- **And** it names no other lesson in the series that way
*(source: ADR-015 d1a; FeatureDecriptions/cancelation.md, "Client recurrence management", "Who is charged")*

## 4. Which cancellations are charged

A cancellation line is chargeable only when all three hold: `cancelledBy = CLIENT`,
`noticeHours < requiredNoticeHours`, and `missedLessonFeeMinor > 0` (ADR-015 d1a).

**4.1 The family's own late cancellation is charged**
- **Given** Mia is booked into today's lesson (16:00), private, with a $25.00 fee
- **When** the Rossi family cancels it from My bookings at 10:00
- **Then** Mia's seat is moved, in one transaction with its delete, to a
  `CANCELLED#<isoTs>#<batchId>#<seatKey>` line with `cancelledBy = CLIENT`, `noticeHours = 6`
  and the $25.00 fee
- **And** the line carries `paymentStatus = UNPAID`
- **And** the line has Global Secondary Index 3 (GSI3) keys (`GSI3PK = COACH#<Dana's coachId>`,
  `GSI3SK = UNPAID#2027-03-01#<Mia's studentId>`)
*(source: ADR-015 d1a, d4; ADR-031 d2; ADR-MASTER §3 Indexes, §12)*

**4.2 A cancellation with enough notice is never charged**
- **Given** Mia is booked into tomorrow's lesson with a $25.00 fee
- **When** the Rossi family cancels it at 10:00 today (30 hours' notice)
- **Then** the `CANCELLED#` line records `cancelledBy = CLIENT` and `noticeHours = 30`
- **And** it has no payment fields and no GSI3 keys
*(source: ADR-015 d1a; ADR-009 d11)*

**4.3 A late cancellation of a lesson with no fee is not charged**
- **Given** Mia is booked into a 60-minute lesson today at 16:00 with `missedLessonFeeMinor = 0`
- **When** the Rossi family cancels it at 10:00
- **Then** the `CANCELLED#` line records `noticeHours = 6` and has no payment fields and no GSI3 keys
*(source: ADR-015 d1a, d2)*

**4.4 The coach's cancellation is never charged**
- **Given** Mia is booked into today's lesson with a $25.00 fee
- **When** Dana cancels it from her week view at 10:00
- **Then** the line records `cancelledBy = COACH` and `noticeHours = 6`
- **And** it has no payment fields and no GSI3 keys
*(source: ADR-015 d1a; ADR-009 d11; FeatureDecriptions/cancelation.md, "Who is charged")*

**4.5 The coach's cancellation from the rinkside page is never charged**
- **Given** Mia is booked into today's lesson with a $25.00 fee
- **When** Dana cancels it from the check-in list on the rinkside page at 15:30
- **Then** the line records `cancelledBy = COACH` and has no payment fields and no GSI3 keys
*(source: ADR-015 d1a; ADR-MASTER §10, "By the coach"; FeatureDecriptions/cancelation.md, "Who is charged")*

**4.6 A schedule change is never charged**
- **Given** Mia is booked into today's lesson with a $25.00 fee
- **When** Dana saves a schedule at 10:00 that no longer makes the 16:00 lesson
- **Then** the line records `cancelledBy = SCHEDULE_CHANGE` and has no payment fields and no GSI3 keys
*(source: ADR-015 d1a; ADR-009 d11)*

**4.7 Recurrence management charges the late lesson only**
- **Given** Mia has a weekly series on Tuesdays at 16:00 with a $25.00 fee, and now is
  **Monday 2027-03-01 20:00**
- **When** the Rossi family accepts *Cancel all future lessons*
- **Then** the line for Tuesday 2027-03-02 (`noticeHours = 20`) is chargeable, with
  `paymentStatus = UNPAID` and GSI3 keys
- **And** the line for Tuesday 2027-03-09 (`noticeHours = 188`) and every later line has no payment
  fields and no GSI3 keys
*(source: ADR-015 d1a ("Which screen the client used does not matter"); FeatureDecriptions/cancelation.md, "Who is charged")*

**4.8 A keep-or-cancel left unanswered is never charged**
- **Given** Mia and Leo shared tomorrow's lesson, the Tran family cancelled Leo's place in time,
  and the Rossi family's keep-or-cancel question reaches its answer-by time unanswered
- **When** `sched-deadline-sweep` cancels Mia's seat
- **Then** the line records `cancelledBy = NO_ANSWER` and has no payment fields and no GSI3 keys
*(source: ADR-031 d8, d14; architecture.md §5, "Cancellation batch")*

## 5. No-shows

**5.1 A no-show keeps its seat and stays unpaid**
- **Given** Mia is booked into today's lesson
- **When** Dana marks Mia absent on the rinkside page at 16:05
- **Then** Mia's `SEAT#` item stays, with `seatStatus = NO_SHOW` and `paymentStatus = UNPAID`
- **And** it keeps its GSI3 keys, and no amount is written to the seat
- **And** the change stream raises `NoShowRecorded`
*(source: ADR-015 d4, d5; ADR-031 d7; ADR-MASTER §3 Events, §11)*

**5.2 A recorded no-show sends the family a missed-lesson fee reminder**
- **Given** Mia's seat has just become `NO_SHOW` and `NoShowRecorded` has been raised
- **When** the payment-reminder consumer handles the event
- **Then** the Rossi family is emailed a missed-lesson fee reminder, worded differently from the
  ordinary payment reminder (wording and amount not yet fixed)
- **And** no `CheckInRecorded` payment reminder is sent
*(source: ADR-015 d5; ADR-MASTER §3 Events; FeatureDecriptions/Email templates Needed:, "Missed-lesson fee reminder")*

**5.3 A charged late cancellation sends the family a missed-lesson fee reminder**
- **Given** the Rossi family has just cancelled today's lesson late (scenario 4.1)
- **When** the chargeable line is recorded
- **Then** the Rossi family is emailed a missed-lesson fee reminder (wording and amount not yet fixed)
*(source: FeatureDecriptions/Email templates Needed:, "Missed-lesson fee reminder"; ADR-015 d5)*

## 6. Shared lessons

**6.1 A late leaver owes their share of the fee**
- **Given** Mia and Leo share today's lesson (`priceMinor = 5000`, `missedLessonFeeMinor = 2500`,
  `shareCount = 2`)
- **When** the Rossi family cancels Mia's place at 10:00 (6 hours' notice)
- **Then** Mia's `CANCELLED#` line records $12.50 (half of the fee), with `paymentStatus = UNPAID`
  and GSI3 keys
- **And** the lesson time's `shareCount` stays 2 and no `pendingLeave` is written
*(source: ADR-031 d7, d8; ADR-015 amendment 2026-10-13; FeatureDecriptions/Schedule lesson split, "A skater calls out")*

**6.2 The skater who stays isn't charged and isn't asked anything**
- **Given** Mia has just left today's shared lesson late (scenario 6.1)
- **When** the Tran family opens My bookings
- **Then** Leo's lesson shows his share of the price, $25.00, with no fee and no keep-or-cancel question
- **And** Leo's seat is unchanged
*(source: ADR-031 d8; FeatureDecriptions/cancelation.md, "Shared lessons"; FeatureDecriptions/Schedule lesson split)*

**6.3 Each family's charge is marked on its own**
- **Given** Mia's late-cancellation line and Leo's seat in the same lesson are both `UNPAID`
- **When** Dana marks Mia's line paid
- **Then** Leo's seat stays `UNPAID`
*(source: ADR-031 d2, d15; FeatureDecriptions/Coach Payment Section on Dashboard.md, "Added 2026-10-13")*

## 7. The coach's payment dashboard and reminders

**7.1 A charged late cancellation is listed among unpaid lessons**
- **Given** Mia's late-cancellation line for Monday 2027-03-01 16:00 is `UNPAID`, and now is
  Monday 2027-03-08
- **When** Dana opens Payments for 2027-03-01 to 2027-03-07 with *Unpaid* selected
- **Then** the line is listed with Mia R., the Rossi family, Mon 1 Mar 4:00 PM and $25.00,
  marked as a late-cancellation fee (label wording not yet fixed)
*(source: ADR-015 d4 ("or the coach is owed money by a screen that never mentions it"); FeatureDecriptions/cancelation.md, "No-shows on the coach's payment page")*

**7.2 The coach marks a late-cancellation fee paid**
- **Given** Mia's late-cancellation line is `UNPAID`, and Dana has Venmo switched on
- **When** Dana marks it paid, choosing Venmo
- **Then** the line stores `paymentStatus = PAID`, `paidAt`, `markedPaidBy` and `paidVia = VENMO`
- **And** its GSI3 keys are removed
*(source: ADR-015 d4 and its 2026-10-09 amendment; ADR-003 d4, d5)*

**7.3 The coach waives a late-cancellation fee**
- **Given** Mia's late-cancellation line is `UNPAID`
- **When** Dana chooses *Waive* on it
- **Then** she is asked first: *"Waive this lesson? … This can't be undone."*
*(source: FeatureDecriptions/Coach Payment Section on Dashboard.md (R7, 2026-11-09))*

**7.4 A waived fee carries no amount and no how-paid**
- **Given** Dana has been asked to confirm waiving Mia's late-cancellation line
- **When** she confirms
- **Then** the line stores `paymentStatus = WAIVED`, `waivedAt` and `waivedBy`, and no `paidVia`
- **And** its GSI3 keys are removed, and no *Undo* is offered
*(source: ADR-003 d4 amendment 2026-08-30; ADR-015 Open ("Whether a coach can waive a charge"); FeatureDecriptions/Coach Payment Section on Dashboard.md)*

**7.5 The weekly unpaid reminder lists a charged late cancellation as a late fee**
- **Given** Mia's late-cancellation line for Monday 2027-03-01 is still `UNPAID`
- **When** `sched-unpaid-reminder` runs on Monday 2027-03-15
- **Then** Dana's weekly email to her login email lists it, labelled as a late fee
- **And** it is listed again every Monday until Dana marks it paid or waived
*(source: ADR-018 d1, d3, d4; FeatureDecriptions/Email templates Needed:, "Unpaid lessons")*

**7.6 A collected fee counts in gross**
- **Given** Mia's late-cancellation line for Monday 2027-03-01 is marked paid on 2027-03-10
- **When** Dana opens the financial page in 2027
- **Then** March 2027's gross includes the $25.00
*(source: ADR-030 d2; ADR-MASTER §12, "Financial page"; FeatureDecriptions/Coach Financial Page.md, "What counts as gross")*

**7.7 A waived fee doesn't count in gross**
- **Given** Mia's late-cancellation line for Monday 2027-03-01 is `WAIVED`
- **When** Dana opens the financial page in 2027
- **Then** March 2027's gross doesn't include it
*(source: ADR-030 d2; FeatureDecriptions/Coach Financial Page.md)*

## 8. Retention

**8.1 An unpaid fee is never expired**
- **Given** Mia's late-cancellation line is `UNPAID`
- **When** it is written
- **Then** it gets no `expiresAt`
*(source: ADR-MASTER §20, table ("Cancellation line (chargeable, Phase 2)", "Seat, `UNPAID`"))*

**8.2 A settled fee expires after the cancellation window**
- **Given** Mia's late-cancellation line is `UNPAID`
- **When** Dana marks it paid
- **Then** the line's `expiresAt` is set to the settlement time plus the cancellation window
  (at least 16 months)
*(source: ADR-MASTER §20; ADR-017)*

## 9. Rules that must always hold
- **Only the family pays, for their own late cancellation or a no-show.** A line with
  `cancelledBy = COACH`, `SCHEDULE_CHANGE` or `NO_ANSWER`, or one made with enough notice, is never
  owed, in any phase. *(ADR-015 d1a; ADR-009 d11; ADR-031 d14)*
- **The rule reads `cancelledBy`, `noticeHours`, `requiredNoticeHours` and `missedLessonFeeMinor`
  only, never `batchSource`.** Which screen the family used doesn't matter. *(ADR-015 d1a)*
- **The decision is made once, at cancellation, per line**, against the values stamped on the
  lesson time, so it can be checked from the record alone. Only a chargeable line has payment
  fields and GSI3 keys. *(ADR-015 d1a, d3)*
- **One fee covers both a no-show and a late cancellation.** A change to one that isn't made to
  the other is refused. *(ADR-015 d1, Revisit if; FeatureDecriptions/cancelation.md, "Why one fee covers both")*
- **Only the coach sets `paymentStatus`.** No ledger, no balance, no credit, no partial payment;
  waiving carries no amount. *(ADR-003 d4; ADR-MASTER §12)*
- **No amount is ever copied onto a seat.** A no-show's amount is worked out from its lesson time.
  *(ADR-031 d7)*
- **Money is an integer in minor units and is never summed across currencies.** *(ADR-MASTER §3)*

## Open questions
1. **What the fee is charged against when it differs from the lesson's price**, and so what a
   Phase 2 no-show owes: its share of the price (the MVP amount), the fee, or both. ADR-018 d1
   says a no-show "is charged the lesson's `missedLessonFeeMinor`" and its 2026-11-12 note calls the
   fee "an extra charge". What the dashboard, weekly reminder and family reminder show for a
   no-show waits on this. *(Open-Pending §3; ADR-015 Open; ADR-MASTER §25 Product;
   FeatureDecriptions/cancelation.md, "Open and revisit")*
2. **"May incur" or "will incur", with the amount?** Whether the cancel confirmation and
   recurrence management's confirmation become definite, and their wording. *(Open-Pending §3;
   FeatureDecriptions/cancelation.md, "What the family is told")*
3. **Where else the fee is shown, and how it's worded:** on the booking page, and whether the
   booking confirmation email carries it (ADR-MASTER §24 says "in confirmations"; see the report's
   note on the conflict).
4. **The missed-lesson fee reminder:** its wording, the amount it states (question 1), which
   consumer sends it for a late cancellation, whether it goes out for a no-show whose lesson has
   no fee, and whether it has a text-message form. *(FeatureDecriptions/Email templates Needed:)*
5. **An automatic settle for a zero fee** was deferred, to be revisited with the Phase 2 charge.
   *(FeatureDecriptions/cancelation.md, "No-shows on the coach's payment page")*
6. **The fee field on the `CANCELLED#` line:** its name, and whether the line carries `currency`
   (today it carries `priceMinor` but no `currency`). *(architecture.md §5, `CANCELLED_LESSON`)*
7. **Odd cents in a shared fee:** how a $25.01 fee splits between two late leavers or one late
   leaver and a stayer. ADR-031 d7's odd-cent rule is written for the price.
8. **Attendance corrected after a no-show reminder**, from `NO_SHOW` to `CHECKED_IN` or back on the
   lesson list: what the family is sent and whether the charge changes.
9. ***Undo* on a paid late-cancellation line:** the dashboard's *Undo* is described for paid
   lessons; whether and how it applies to a `CANCELLED#` line isn't stated.
10. **When a late cancellation for later today shows on Payments**, since upcoming lessons aren't
    listed until they've happened. *(FeatureDecriptions/Coach Payment Section on Dashboard.md, design)*
11. **A fee-only change:** whether a block's fee change alone writes `REPRICED#` lines and emails
    families. *(ADR-020 d3, d5; FeatureDecriptions/Re-pricing Booked Lessons.md)*
12. **The weekly reminder's re-run guard on a line:** whether `settleReminderSentOn` is stamped on
    a `CANCELLED#` line as on a seat. *(ADR-018 d3, d4)*
