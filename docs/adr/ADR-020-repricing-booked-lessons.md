# ADR-020: Booked Lessons Follow the Coach's Current Price

## Status

**Accepted** — 2026-09-30.

**Amends [ADR-003](ADR-003-lesson-pricing-and-payment.md) decision 2.** A price stamped on a
booking at creation now protects **past** lessons only. A lesson that has not happened yet
follows the coach's current price, and the family is told. Amends
[ADR-015](ADR-015-late-cancellation-and-no-show-charges.md) decision 3 the same way for the
missed-lesson fee.

**Extends the schedule-change path** of [ADR-006](ADR-006-open-booking-recurring-lessons-and-cancellation.md)
decisions 5–7, [ADR-008](ADR-008-schedule-editor.md) decision 8 and
[ADR-010](ADR-010-availability-and-reliability.md) decision 5: the same preview, the same
background consumer and the same notifier now re-price as well as cancel.

**Renames five things** so their names still describe what they hold (decision 7).

**Amended — 2026-10-08.** Kim's answer to `Items to ask Kim About.md` §7 (option **B**) settles **a booking that lands
between the coach's preview and save**: the save goes ahead without asking the coach (product
rule — see `FeatureDecriptions/Schedule Creater.md`, "A family books during the review"). The
preview reads a per-coach booking counter that every booking increments; the save checks it.
If it changed, the plan is recalculated and the save goes ahead; any booking made since the
preview that the change cancels is cancelled like the rest, and the counter chooses a separate
*"just booked"* email. Slot holds during preview (option D) are not built.

**Amended — 2026-10-09.** *Decided by the owner.* The *"just booked"* email is **Phase 2** (product
rule — same feature-file section). **No booking counter is
built in MVP:** it existed only to choose which email to send. When the email returns, the
likely mechanism is for the save to recalculate the plan and compare it with the preview's,
which needs no counter.

Kim's answer to §1 question 4 matches this ADR's rule for price increases (*moved to
`FeatureDecriptions/Re-pricing Booked Lessons.md` on 2026-11-08*).

**Note — 2026-10-12.** [ADR-007](ADR-007-sms-message-constraints.md) (amended 2026-10-12): all SMS to clients is **Phase 2**, so the notifier sends email only in MVP; decision 6's text message and the price-change
templates wait for it.

**Amended — 2026-10-13.** *Decided by the owner.* [ADR-031](ADR-031-lessons-and-seats.md)
stores every bookable time as a **lesson time** (`LESSON#`) and gives each skater a **seat**
(`SEAT#`). This ADR's rules now apply **per seat** (ADR-031 decision 11):

- **The schedule save compares lesson times**, old against new, and sorts each into **add,
  remove, cancel or re-price**, with one evaluator for preview and execution.
- **Re-price** changes the lesson time's price, ~~then each seat follows decision 2:~~
  increases only beyond the notice period, decreases at once, **paid and waived seats never**.
  ~~Then the **shares are re-split** among the booked seats (ADR-031 decision 7).~~
  *Revised 2026-10-13 (ADR-031 revision): a re-price changes **only** the lesson time's
  `priceMinor`. No seat is written. A share is worked out as `priceMinor ÷ shareCount`, so every
  share ~~not yet fixed~~ follows the new price. ~~A seat with a fixed `amountMinor` (checked in, no-show,
  paid or waived) keeps it. So the amounts can add up to a little more or less than the new
  price, and that's accepted (ADR-031 decision 7).~~* *Revised 2026-10-13: no amount is copied onto a seat; it's worked out from the lesson time (ADR-031 d7).*
- **Remove** deletes an `OPEN` lesson time **only if it is still `OPEN`**. If a family booked it
  after the preview, that line becomes **cancel** in the same batch, and the family gets the
  ordinary cancellation email. This is how the 2026-10-08 and 2026-10-09 amendments' "booking
  that lands between preview and save" is now handled, and a booking can no longer land on a
  time the new schedule removed.

Every behaviour rule here still holds.

**Amended — 2026-10-13 (threshold).** *Decided by the owner.* Decision 4's warning threshold is
settled at 50% of the old price, up or down (Open, blocker #12). *Moved to
`FeatureDecriptions/Schedule Creater.md` ("Big price change warning") on 2026-11-08 — product
content, not an architecture decision.*

---

## Context

A lesson's price lives on a block of the coach's schedule (ADR-004 decision 4) and is copied
onto each booking when it is made (ADR-003 decision 2), so a later rate change cannot rewrite
what a client already owes. For lessons that have happened, that is exactly right.

For lessons that have not happened, it has an awkward consequence. A family on a weekly
recurring booking made in September pays the September price for every lesson up to twelve
months ahead (ADR-006 decision 4), and single bookings have no limit at all. A coach who
raises their rate at the start of a new season finds most of next season already booked at
last season's price — and a family who booked early pays a different price from one who
booked last week for the same slot.

Re-pricing a future lesson is cheaper than it sounds for one reason: **a future lesson is
never paid yet.** Payment follows check-in (ADR-003 decision 7), so changing the price of an
upcoming lesson never involves a refund or a credit — only a number on an unpaid booking, and
a message to the family.

---

## Decision

### 1. A lesson that has not happened yet follows the coach's current price

*Decided by the owner, 2026-09-30.* Upcoming lessons follow a block's price change; past,
paid and waived lessons never change; a personal price override is left alone (product rule —
see `FeatureDecriptions/Re-pricing Booked Lessons.md`, "What changes when a coach changes a
price"). The evaluator implements it as follows.

- **Which bookings:** those whose time slot the new schedule still produces — same start
  time, same length — where the producing block's price differs from the booking's stamped
  `priceMinor`. A booking the new schedule no longer produces is cancelled, as before; one
  booking is never both. *Replaced by ADR-031 decision 11 (2026-10-13): the comparison is of
  **lesson times**. A lesson time whose price differs is re-priced; ~~each of its seats follows
  decision 2, and the shares are re-split among the booked seats~~.* *Revised 2026-10-13
  (ADR-031 revision): only the lesson time's `priceMinor` changes; shares ~~not yet fixed~~ follow
  it.* *Revised 2026-10-13: no amount is copied onto a seat; it's worked out from the lesson time (ADR-031 d7).*
- **Past, paid and waived lessons are excluded** from re-pricing. *Since ADR-031 (2026-10-13) this is
  judged per seat: a paid or waived seat never changes, even when the other seat in a shared
  lesson is re-priced.* *Revised 2026-10-13 (ADR-031 revision): ~~such a seat has a fixed
  `amountMinor`, which a re-price never touches.~~* *Revised 2026-10-13: no amount is copied onto a seat; it's worked out from the lesson time (ADR-031 d7).* *Under ADR-031 a lesson paid in
  advance and then re-priced isn't handled: it would show the new amount, not what was paid
  (ADR-031 Revisit if).*
- **`priceMinorOverride` is never touched** by a re-price. *(Phase 2 since 2026-10-13, ADR-003.)*
- **Dates covered by a temporary schedule** follow that temporary schedule's blocks, so a
  change to the default does not re-price them, and a change to the temporary schedule does.

### 2. Increases wait for the notice period; decreases apply at once

*Decided by the owner, 2026-09-30.* An increase reaches only lessons starting later than the
booking's `requiredNoticeHours` from when the change is carried out; a decrease reaches every
upcoming lesson (product rule and its reasoning — see `FeatureDecriptions/Re-pricing Booked
Lessons.md`, "Price increases wait for the notice period").

The window is judged when the change is carried out, not when the preview was shown, for the
same reason every other conflict is (ADR-006 decision 7): the preview is advisory.

### 2a. The coach is told which lessons an increase will not reach

*Moved to `FeatureDecriptions/Schedule Creater.md` ("What the review page shows") on
2026-11-08 — product content, not an architecture decision.* (Decided by the owner,
2026-09-30.) The preview's shared evaluator therefore also returns the lessons an increase
skipped.

### 3. The missed-lesson fee follows the same rules

*Decided by the owner, 2026-09-30.* A change to a block's `missedLessonFeeMinor` is applied to
upcoming lessons by the same evaluator and the same increase/decrease rule (product rule — see
`FeatureDecriptions/Re-pricing Booked Lessons.md`, "The missed-lesson fee follows the same
rules"). This amends ADR-015 decision 3 for future lessons. The fee is `0` throughout MVP
(ADR-008), so this only takes effect with the Phase-2 charge.

### 4. The preview shows re-pricing, and a large change is impossible to miss

*Moved to `FeatureDecriptions/Schedule Creater.md` ("What the review page shows" and "Big
price change warning") on 2026-11-08 — product content, not an architecture decision.*
(Decided by the owner, 2026-09-30; threshold settled 2026-10-13.) The preview gets the
re-price lines from the same evaluator as execution (decision 5), so the old and new price it
shows are the ones the consumer will write.

### 5. One event, one consumer, one plan

Re-pricing runs through the existing schedule-change path; nothing listens separately.

1. The coach saves; `api-coach` writes the schedule and nothing else.
2. The change stream produces `ScheduleChanged`, delivered to **one** consumer,
   `consumer-schedule-change`.
3. ~~The consumer re-reads the upcoming bookings and runs **the shared evaluator in `core/`**,
   which sorts each booking into exactly one of: *unchanged*, *cancel*, or *re-price*.~~
4. The consumer writes the whole plan first, all `PLANNED` (ADR-010 decision 5c): ~~a
   cancellation line per booking to cancel, a **re-price line** per booking to re-price.~~
5. The consumer carries out each line in its own transaction:
   - ~~a cancellation line deletes its booking, as before;~~
   - a re-price line sets the ~~booking's~~ price (and fee) to the new values **only if the
     ~~booking~~ still exists and still carries the old values**, marking the line `EXECUTED`; if
     the ~~booking~~ changed in the meantime — the family cancelled it a second ago — the line is
     marked `SKIPPED`.

   *Replaced by ADR-031 decision 11 (2026-10-13): the evaluator compares the **lesson times**
   the old and new schedules produce and sorts each into *add*, *remove*, *cancel* or
   *re-price*. **Remove** deletes an `OPEN` lesson time only if it is still `OPEN`; otherwise the
   line becomes *cancel* in the same batch. **Cancel** moves every seat to a `CANCELLED#` line
   and deletes the lesson time. **Re-price** updates the lesson time ~~and each seat that decision
   2 allows~~, re-checked first~~, then re-splits the shares~~. ADR-010 decision 5's batch — claim,
   write the whole plan, re-check each line, mark executed last, notify after — is unchanged.*
   *Revised 2026-10-13 (ADR-031 revision): a re-price writes only the lesson time's `priceMinor`.
   A `REPRICED#` line is still written per seat whose share changes, for the email.*
6. The consumer marks the batch header `EXECUTED`, and the notifier sends **one message per
   family** covering everything in the batch (ADR-010 decision 5f).

**Recovery from a failure partway** — event-derived keys, the plan-complete marker, the
re-check before each record, the reconcile command and the nightly drift check — is ADR-010
decisions 5g–5k, and applies to re-price records exactly as to cancellation records.

**Why not a second listener for re-pricing.** Two listeners would each read the same bookings
and apply the same rules with no control over which runs first. One could re-price a lesson
the other is about to delete, and the family would be told both "your lesson is now $60" and
"your lesson is cancelled". One consumer classifies each booking once.

**The re-price line** (~~`REPRICED#<isoTs>#<batchId>#<bookingId>`~~ `REPRICED#<isoTs>#<batchId>#<seatKey>` *(Revised 2026-10-13 (ADR-031))*) records the ~~booking~~ *seat
(ADR-031, 2026-10-13)*, the student, the client, the date and time, the old and new price, the old and new fee, the
direction, `executionStatus` and `notificationStatus` — the same notification fields a
cancellation line carries, so "was this family told" has the same answer for both.

### 6. What the family is told

One message per family per batch, covering every cancellation and re-price line in it (content
and wording — see `FeatureDecriptions/Re-pricing Booked Lessons.md`, "What the family is
told"). The notifier composes it from the batch's `CANCELLED#` and `REPRICED#` lines. Any text
message follows ADR-007's constraints, with its templates length-tested per ADR-007 decision 7
(Phase 2).

### 7. Names that no longer fit are renamed

These held only cancellations; they now hold schedule changes of either kind. Renamed
throughout the documentation, pre-implementation:

| Was | Now |
|---|---|
| `CANCELBATCH#` batch header | **`CHANGEBATCH#`** |
| `CANCELLATION_BATCH` entity | **`CHANGE_BATCH`** |
| `LessonCancelled` event | **`LessonsChanged`** |
| `consumer-schedule-change-cancellation` | **`consumer-schedule-change`** |
| `consumer-cancellation-notifier` | **`consumer-change-notifier`** |

`CANCELLED#` lines keep their name: they still hold only cancellations. Re-price lines are
the new `REPRICED#`. Direct cancellations by a coach or a client (ADR-009) produce a change
batch that simply contains cancellation lines only.

---

## Consequences

- **A price rise reaches the lessons it should**, and families are told rather than surprised.
- **The stamp still does its original job** for everything that has happened, and for any
  money already settled.
- **The schedule save does more.** The preview shows a third category, the consumer writes
  a second kind of line, and the notifier composes messages covering both. All of it is the
  existing machinery with one more branch, not a new pipeline.
- **A typo now reaches families** unless caught at the preview, which is why decision 4's
  warning is deliberately loud.
- **More messages.** Every price change produces a message to every family with an affected
  upcoming lesson.

---

## Open

- ~~**Hand-edited booking prices would be overwritten.**~~ *Settled 2026-10-13 by the owner (ADR-031): per-lesson price editing is removed; the price lives only on the lesson time and each skater's share is worked out from it.*
- *Product questions moved to `FeatureDecriptions/Re-pricing Booked Lessons.md` ("Open
  questions") on 2026-11-08 — product content, not architecture decisions:* changing a
  student's price override (Phase 2), changing `requiredNoticeHours` itself, the text-message
  templates, and the full record of the hand-edited-price and large-change-threshold items.
- **Retention of re-price lines.** They name students like cancellation lines do, so they
  need a window from the legal review under ADR-017.

---

## Revisit if

- Coaches report families upset by price changes on lessons they booked long ago — a sign
  that re-pricing should stop at some horizon, or that price changes need more notice.
- A payment processor arrives (§10 Phase 2) and future lessons can be paid in advance. Then a
  re-price can touch money already taken, and decision 1's "paid or waived is never
  re-priced" rule is doing more work than it does today.
