# ADR-015: Late Cancellation and No-Show Both Carry a Charge

## Status

**Accepted** — 2026-08-30. **The charge itself is Phase 2**; the fields it depends on are
designed now so that nothing has to be retrofitted. Supersedes ADR-009 decision 3's
"a notice, not a charge" for the Phase-2 timeframe, and closes the `NO_SHOW` payment
question left open in `architecture.md` §11 and in ADR-014 decision 6.

**Amended — 2026-09-29.** Decision **1a** states who can be charged, which decision 1 left
unsaid: only the client, for a cancellation they made themselves that was late — whichever
screen they made it from. Coach and schedule-change cancellations are never charged.
Decision **6** is scoped to Phase 2; MVP keeps *"may incur"* wording everywhere. Also
supersedes ADR-009 decision 11 in part — see 1a.

**Amended — 2026-09-30.** Two changes, both by the owner:

- **The two fields are renamed** to say what they are for. `lateFeeMinor` becomes
  **`missedLessonFeeMinor`** — one fee for a lesson missed by a no-show or by a cancellation
  inside the notice period — and `lateCancellationHours` becomes **`requiredNoticeHours`**.
  The old names suggested a late cancellation only and hid the no-show half of decision 1.
  The rule is unchanged, and so is the client-facing MVP wording (*"may incur a late
  cancellation fee"*), which is shown where a client is cancelling. The new names are used
  throughout this ADR.
- **A recorded no-show waits for the coach, at least in MVP** — see decision 4.

**Amended by [ADR-020](ADR-020-repricing-booked-lessons.md)** — 2026-09-30. Decision **3**'s
stamped fee follows a change to the block's fee on upcoming lessons, by the same rules as the
price: increases only beyond the notice period, decreases at once.

---

## Context

Two questions had been open separately:

- **Is a `NO_SHOW` owed?** Unresolved since the payment model was written. ADR-014
  decision 6 made it pressing by giving the coach a button that records one.
- **Does a late cancellation cost anything?** ADR-009 decision 3 deliberately made it a
  notice — client-facing wording only, with `noticeHours` recorded so the coach could act
  on it by hand and so a Phase-2 fee would have something to read.

Answering these apart produces a loophole that a family finds quickly: if cancelling three
hours out costs money and simply not appearing does not, the rational move is to stop
cancelling. The no-show is strictly the cheaper option, and it is also the one that costs
the coach most — they travelled to the rink and waited.

They are the same question. A no-show is a cancellation with zero notice.

---

## Decision

### 1. Both a late cancellation and a no-show incur a charge

*Decided by the owner, 2026-08-30.* One rule covers both. A no-show is treated as the
limiting case of a late cancellation — `noticeHours = 0` — rather than as a separate
concept with its own policy.

This is what closes the loophole. It is also why the two are decided together and should
not be separated later: any future change to one that is not applied to the other
re-opens it.

### 1a. Only the client's own late cancellation is charged — from any screen

*Decided by the owner, 2026-09-29.* Decision 1 said what is charged and not whose. ADR-009
has three actors and several ways to cancel, and a rule that reads `noticeHours` alone would
charge all of them, because every `CANCELLED#` line records `noticeHours` whoever wrote it.

**The rule is three checks, and a line is chargeable only when all three hold:**

| Check | Question it answers |
|---|---|
| `cancelledBy = CLIENT` | Did the client make this cancellation? |
| `noticeHours < requiredNoticeHours` | Was it late? |
| `missedLessonFeeMinor > 0` | Does this lesson's block charge a fee at all? |

| Cancellation | Charged? |
|---|---|
| Per-lesson cancel in My Bookings (ADR-009 d2) | If late |
| Recurrence management — end date earlier, reduce frequency, cancel all future (ADR-009 d4) | **Only the occurrences that are late** — in practice at most the next one or two |
| Coach cancels a lesson, day or week, from either surface (ADR-009 d5, d5a) | Never |
| Schedule change (ADR-006 d5) | Never |
| No-show (decision 1) | Yes — it is the client's booking, and it keeps it |

**Coach and schedule-change cancellations are never charged.** The coach made the decision;
billing the family would be charging them for the coach's cancellation. Their lines also
record a small `noticeHours` when the coach acts close to a lesson, which is why
`cancelledBy` is a check in its own right and not implied by the other two.

**Which screen the client used does not matter.** An earlier draft of this decision, the
same day, exempted recurrence management entirely by also checking the batch `batchSource`. It
was dropped because the exemption did almost nothing except open a gap. Recurrence
management cancels future occurrences, and nearly all of them are far beyond any threshold,
so the time check already leaves them free. The only occurrence the `batchSource` check changed
the outcome for was one *inside* the threshold — so its only effect was to let a client drop
tomorrow's lesson free by ending the arrangement instead of using the per-lesson cancel,
which is the loophole decision 1 exists to close. Without it, a late cancellation costs the
same whichever button made it.

**Recurrence management must say so before the client accepts.** It is a bulk action, so a
fee on it must not arrive as a surprise. When any occurrence it would cancel is inside the
coach's threshold, its confirmation names that occurrence and states that cancelling it
*may incur a late cancellation fee* — see ADR-009 decision 4. In MVP no fee is ever
collected; the wording is the same *"may"* the per-lesson cancel uses (ADR-009 decision 2).
Whether Phase 2 changes either message to a definite amount is a Phase-2 decision (decision
6).

**Where the decision is made.** At cancellation, per line. Only a chargeable line gains
decision 4's payment fields and GSI3 membership. Every other line has none, which is
ADR-009 decision 11 holding unchanged for it.

### 2. The amount is set per block, in the schedule builder

*Decided by the owner, 2026-08-30.* A block becomes
`{ seq, blockName?, startTime, endTime, lessonMinutes, priceMinor, missedLessonFeeMinor }` (ADR-008).

The coach already sets `priceMinor` per block, and the fee is priced the same way and for
the same reason — a 30-minute lesson and a 90-minute lesson do not warrant the same fee.
Putting it anywhere else would mean a second surface for a number that belongs beside the
one already there.

**`missedLessonFeeMinor = 0` means no charge.** The amount is its own off switch, per block, so
ADR-009's sketched profile checkbox is not needed. A coach who charges nothing sets zero
and the client-facing wording drops away.

### 3. The fee and the threshold are both stamped on the booking at creation

The booking gains `missedLessonFeeMinor` and `requiredNoticeHours`, stamped at creation exactly
as ADR-003 stamps `priceMinor` and `currency`, and for the identical reason: a coach who
changes their policy must not silently rewrite what was agreed on bookings already made.

**Both halves must be stamped, not just the amount.** `noticeHours` is already recorded on
every cancellation line (ADR-009 decision 3), but a stored notice figure is only meaningful
against the threshold it was judged by. Stamping the amount while leaving the threshold on
a mutable coach profile would leave half the rule able to shift under a historical record —
the record would say three hours' notice, and nothing would establish whether three hours
was late at the time.

With both stamped, `noticeHours < requiredNoticeHours` is decidable from the record alone,
permanently, without reference to current settings.

The threshold is a coach-level policy ("I need a day's notice") and is set on the coach
profile, not per block; the amount is per block. They are stamped together onto the booking
regardless of where they were configured.

### 4. The charge reaches the client through two structurally different paths

This follows from the existing model rather than changing it, and the two halves are not
symmetric:

- **A no-show keeps its booking.** The item survives with `bookingStatus = NO_SHOW` and already
  carries `paymentStatus`, `paidAt`, `markedPaidBy`, and already appears in GSI3 while
  unpaid. Nothing new is required to bill it.

  **In MVP, a recorded no-show stays `UNPAID` until the coach marks it paid or waived.**
  *Decided by the owner, 2026-09-30.* Its `missedLessonFeeMinor` is `0` in MVP, so nothing is
  owed, but nothing settles it automatically either: it stays on the payment dashboard and
  is picked up by [ADR-018](ADR-018-unpaid-lesson-reminder-to-coach.md)'s weekly reminder. An
  automatic settle for a zero fee was considered and deferred; revisit with the Phase-2
  charge.

  **For now, the dashboard shows a no-show at its full lesson price** — the booking's stamped
  `priceMinor`, labelled as a no-show. *Decided by the owner, 2026-09-30.* It is the amount
  the booking already carries, and the no-show label tells the coach what they are looking
  at before they decide to mark it paid or waive it. ADR-018's reminder lists it the same
  way. Showing the `missedLessonFeeMinor` instead is part of the open question below, and is
  decided with the Phase-2 charge.
- **A late cancellation deletes its booking** (ADR-009 decision 5, which requires a
  released time to stop existing). The charge therefore has to live on the `CANCELLED#`
  record, which today has `priceMinor` but **no payment fields and no GSI3 membership**.

So the `CANCELLED#` record gains `paymentStatus`, `paidAt`, `markedPaidBy` and is written
into GSI3 while unpaid. *Amended 2026-10-09: and `paidVia`, how the client paid
(ADR-003 decision 4).* Without the GSI3 half, the coach's outstanding-lessons view
(`architecture.md` §10 feature 13) silently omits late-cancellation fees, and the coach is
owed money by a screen that never mentions it.

**This asymmetry is the real cost of the decision.** The no-show half is close to free; the
late-cancellation half gives a second entity a payment lifecycle.

### 5. A recorded `NO_SHOW` emits an event

ADR-014 decision 3 had `NO_SHOW` write state and emit nothing, explicitly pending this
decision. That is now resolved: it must emit, because the payment reminder is driven by an
event (§6.3) and a charge nobody is told about is not a charge.

The `CHECKED_IN` path continues to emit `CheckInRecorded`. The no-show path emits its own
event rather than reusing that one — the reminder wording differs (a missed lesson is not
an attended one), and overloading a single event would push the distinction into the
consumer.

### 6. The fee is disclosed at booking, not at cancellation

Because the amount is on the booking, the client sees it when they book, and ADR-009
decision 3's *"Bookings cancelled within 24 hours may incur a late cancellation fee"*
becomes a stated amount at the point of commitment.

The cancellation confirmation can also compute `noticeHours` live and say plainly that
cancelling now will incur the fee, rather than warning that it might.

A fee disclosed before the commitment is a materially different thing from one asserted
afterwards, and this is the main practical gain from putting the amount on the block rather
than deriving it later.

**This is Phase 2, with the charge.** *Decided by the owner, 2026-09-29.* Until the charge
switches on, the cancel confirmation keeps ADR-009 decision 2's wording — *"Bookings
cancelled within 24 hours may incur a late cancellation fee"* — and the booking page shows no
fee. Stating an amount the system will not collect would be a promise the product does not
keep. Recurrence management's confirmation uses the same *"may incur"* wording (decision 1a).
Whether either message becomes a definite *"will incur"* with an amount is decided with the
Phase-2 charge, not here.

---

## Consequences

- **The payment model gains a second billable entity.** Until now only a booking could be
  owed. `CANCELLED#` records become billable too, which touches the outstanding view, GSI3
  and the mark-as-paid path. This is the largest single consequence and it is Phase 2 work.
- **ADR-009 decision 3 is superseded in the Phase-2 timeframe.** Its reasoning stands as
  the record of why the fee started as a notice, and its `noticeHours` requirement is what
  makes this decision implementable at all.
- **ADR-014 decision 3 changes** — see decision 5 above.
- **A no-show is now worth recording accurately**, which raises the stakes on ADR-014's
  open question about correcting or undoing a mis-tap. A wrong tap on a phone held rinkside
  now bills a family.
- **ADR-014 decision 7's `PENDING` bucket becomes financially load-bearing.** An outcome
  stuck on an unsynced phone is now an uncollected charge, not merely an unrecorded fact.
- **Nothing is retrofitted.** The system is pre-implementation, so `missedLessonFeeMinor` and
  `requiredNoticeHours` are designed in now and simply carry zero until Phase 2 turns
  the charge on.

---

## Open

- ~~Whether a no-show and a late cancellation should ever carry different amounts.~~
  **Settled 2026-08-30: one fee for both**, as decision 2 already had it. One `missedLessonFeeMinor`
  per block covers either case. Splitting it later stays additive if a coach ever asks.
- **What the fee is charged *against* when it differs from the lesson price.** If
  `missedLessonFeeMinor` is lower than `priceMinor`, the outstanding view shows an amount that is
  not the lesson price, and the payment reminder must state which it is. Cosmetic, but it
  is client-facing money and should be written down before it is built. *Narrowed
  2026-09-30:* for MVP a no-show shows its full lesson price (decision 4); this question now
  applies to the Phase-2 charge only.
- ~~Whether a coach can waive a charge.~~ **Settled 2026-08-30: yes.** `paymentStatus`
  gains `WAIVED` and the coach payment dashboard gets a *mark as waived* action, per
  `FeatureDecriptions/Payment Section on Coaches Dashboard.md`; see the ADR-003 amendment.
  It needs no ledger — waiving decides money was never owed, which is a state change on one
  booking, unlike a refund. It is also **available from MVP rather than Phase 2**, because
  it applies to any unpaid lesson and not only to a late-cancellation fee.
- **The threshold's unit and bounds.** Decision 3 stamps `requiredNoticeHours`; nothing
  says whether a coach may set 0, or 168, or only a short list of sensible values.

---

## Revisit if

- Phase-2 payments (Stripe) land. Waiving an *uncollected* charge is a state change and
  works today; once money actually moves, forgiving a charge already paid is a **refund**,
  which ADR-003's no-ledger model cannot express. The waive action will need to distinguish
  the two, and only the second is blocked.
- Waived charges outnumber collected ones. That would mean the fee is set too high for
  what coaches are actually willing to enforce, and the amount is the thing to revisit
  rather than the mechanism.
- Any change is proposed to one of the two charges and not the other. That is the loophole
  in decision 1 reopening, and it should be refused on those grounds.
