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
between the coach's preview and save**. The preview reads a per-coach booking counter that
every booking increments; the save checks it. If it changed, the plan is recalculated and the
save **goes ahead without asking the coach**: any booking made since the preview that the change
cancels is cancelled like the rest, and its family gets a separate *"just booked"* email
(*"Coach updated their schedule just as you booked. Here are other open times."*). Slot holds
during preview (option D) are not built.

**Amended — 2026-10-09.** *Decided by the owner.* The *"just booked"* email is **Phase 2**. In MVP
the save still goes ahead without asking the coach (option B), and a booking made since the
preview that the change cancels gets the ordinary cancellation email. **No booking counter is
built in MVP:** it existed only to choose which email to send. When the email returns, the
likely mechanism is for the save to recalculate the plan and compare it with the preview's,
which needs no counter. **To be reconsidered if feedback supports that this is an issue.**

Kim's answer to §1 question 4, *"Move if they are outside the notice period"*, matches this
ADR's rule for price increases.

**Note — 2026-10-12.** [ADR-007](ADR-007-sms-message-constraints.md) (amended 2026-10-12): all SMS to clients is **Phase 2**. Decision 6's text message and the price-change
templates in Open wait for it; in MVP families are told by email only.

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
  share not yet fixed follows the new price. A seat with a fixed `amountMinor` (checked in, no-show,
  paid or waived) keeps it. So the amounts can add up to a little more or less than the new
  price, and that's accepted (ADR-031 decision 7).*
- **Remove** deletes an `OPEN` lesson time **only if it is still `OPEN`**. If a family booked it
  after the preview, that line becomes **cancel** in the same batch, and the family gets the
  ordinary cancellation email. This is how the 2026-10-08 and 2026-10-09 amendments' "booking
  that lands between preview and save" is now handled, and a booking can no longer land on a
  time the new schedule removed.

Every behaviour rule here still holds.

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

*Decided by the owner, 2026-09-30.* When a coach changes the price on a schedule block, every
upcoming booking that block produces is re-priced to the new amount, subject to decision 2.

- **Which bookings:** those whose time slot the new schedule still produces — same start
  time, same length — where the producing block's price differs from the booking's stamped
  `priceMinor`. A booking the new schedule no longer produces is cancelled, as before; one
  booking is never both. *Replaced by ADR-031 decision 11 (2026-10-13): the comparison is of
  **lesson times**. A lesson time whose price differs is re-priced; ~~each of its seats follows
  decision 2, and the shares are re-split among the booked seats~~.* *Revised 2026-10-13
  (ADR-031 revision): only the lesson time's `priceMinor` changes; shares not yet fixed follow
  it.*
- **Past lessons never change.** Neither does any lesson already marked paid or waived, even
  if it is in the future: its money question is settled. *Since ADR-031 (2026-10-13) this is
  judged per seat: a paid or waived seat never changes, even when the other seat in a shared
  lesson is re-priced.* *Revised 2026-10-13 (ADR-031 revision): such a seat has a fixed
  `amountMinor`, which a re-price never touches.*
- **A student's personal price override** (`priceMinorOverride`) is left alone. The coach set
  it deliberately, and a block's price change does not reach it. *(Phase 2 since 2026-10-13, ADR-003.)*
- **Dates covered by a temporary schedule** follow that temporary schedule's blocks, so a
  change to the default does not re-price them, and a change to the temporary schedule does.

### 2. Increases wait for the notice period; decreases apply at once

*Decided by the owner, 2026-09-30.*

| Direction | Which upcoming lessons are re-priced |
|---|---|
| **Increase** | Only lessons starting **later than the booking's `requiredNoticeHours`** from when the change is carried out. Lessons inside that window keep the old price. |
| **Decrease** | **Every** upcoming lesson, including tomorrow's. |

The asymmetry always favours the family. A family cannot cancel a lesson inside the notice
period without the missed-lesson fee, so a price rise landing there is one they cannot react
to — it is not applied. A price cut only helps them, so there is no reason to hold it back.

The window is judged when the change is carried out, not when the preview was shown, for the
same reason every other conflict is (ADR-006 decision 7): the preview is advisory.

### 2a. The coach is told which lessons an increase will not reach

*Decided by the owner, 2026-09-30.* The preview says so plainly — for example: *"The new price
won't apply to 3 lessons in the next 24 hours, which are inside your notice period. They stay
at $50."* A coach who expected every lesson to move must not find out from a family.

### 3. The missed-lesson fee follows the same rules

*Decided by the owner, 2026-09-30.* A change to a block's `missedLessonFeeMinor` re-prices
upcoming bookings' stamped fee the same way: increases only beyond the notice period,
decreases always. This amends ADR-015 decision 3 for future lessons. The fee is `0`
throughout MVP (ADR-008), so this only takes effect with the Phase-2 charge.

### 4. The preview shows re-pricing, and a large change is impossible to miss

The schedule editor's preview (ADR-008 decision 8) now lists re-pricing alongside
cancellations: *"14 lessons for 6 families will change from $50 to $60. Each family will be
emailed."*

**A large price change gets a warning that cannot be overlooked**, in either direction.
*Decided by the owner, 2026-09-30:* it must be **super noticeable**, because the likeliest
cause is a typo — $60 entered as $6 — and a typo here emails every affected family twice,
once for the mistake and once for the fix. So the warning is:

- **At the top of the preview**, above everything else, not a line in the list.
- **Visually distinct**, in the theme's warning colours, with an icon and words as well as
  colour, so it does not depend on colour vision.
- **Specific:** the old price, the new price and the change as a percentage — *"This lowers
  the price from $60 to $6 — a 90% cut."*
- **Acknowledged explicitly.** Accept stays disabled until the coach ticks *"I've checked the
  new price"*.

**The threshold is undecided** — how large a change triggers the warning. It depends on how
much coaches normally change prices, which is a question for a coach (see Open).

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

**The re-price line** (`REPRICED#<isoTs>#<batchId>#<bookingId>`) records the ~~booking~~ *seat
(ADR-031, 2026-10-13)*, the student, the client, the date and time, the old and new price, the old and new fee, the
direction, `executionStatus` and `notificationStatus` — the same notification fields a
cancellation line carries, so "was this family told" has the same answer for both.

### 6. What the family is told

One message per family per batch, listing what changed:

- **An increase:** the lessons affected and the new price.
- **A decrease:** the same, framed as good news — *"Good news: 3 of your lessons are now $50."*
- **A batch with cancellations too:** one message covering both.

Email carries the detail. The text message, for families who opted in, is a pointer to the
email under ADR-007's rules — one 160-character segment, the `<Coach name> via BladeBook:`
prefix, no free text. New templates for price changes, and for a mixed change, are needed and
length-tested per ADR-007 decision 7.

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

- **Hand-edited booking prices would be overwritten.** ADR-003 decision 2 lets a coach edit one
  booking's price by hand. Decision 1 re-prices any upcoming booking whose price differs from
  its block's, so the next schedule save — even an unrelated one — would put a hand-edited
  price back and tell the family. Either per-booking editing goes (the per-student price
  override and *mark as waived* cover the cases), or hand-set prices are marked and never
  re-priced. *Raised 2026-09-30; waiting on coach input — `Items to ask Kim About.md` §5.*
  **Must be settled before re-pricing is built.**
- **Changing a student's price override.** Whether that re-prices the student's upcoming
  lessons under decision 2's rules, and what shape the override takes (fixed price,
  percentage off, dollar amount off). Also §5 of the list for Kim. *Phase 2 since 2026-10-13 (ADR-003).*
- **The large-change threshold.** How much a price must change to trigger decision 4's
  warning. Depends on how much coaches normally change prices — in *Items to Ask Kim About*.
- **Changing `requiredNoticeHours` itself.** From Phase 2 a coach can edit their notice
  period (ADR-016). Whether booked lessons follow that change too is undecided.
- **Retention of re-price lines.** They name students like cancellation lines do, so they
  need a window from the legal review under ADR-017.
- **The text-message templates** for price changes and mixed changes (decision 6).

---

## Revisit if

- Coaches report families upset by price changes on lessons they booked long ago — a sign
  that re-pricing should stop at some horizon, or that price changes need more notice.
- A payment processor arrives (§10 Phase 2) and future lessons can be paid in advance. Then a
  re-price can touch money already taken, and decision 1's "paid or waived is never
  re-priced" rule is doing more work than it does today.
