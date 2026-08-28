# ADR-009: Cancellation

## Status

**Accepted** — 2026-08-23.

Closes the gap deferred, in turn, by **ADR-003** ("is a no-show owed?"), **ADR-004**
("can a coach edit or cancel a single lesson without touching the pattern?"), **ADR-005**
("can a client skip a single week without ending the arrangement?") and **ADR-006**
("client-initiated cancellation, ending or skipping a recurrence"). Each named it as the
largest hole in the design and left it for a document that did not exist.

Extends **ADR-006 decision 5** — its `CANCELBATCH#` / `CANCELLED#` records were written
for schedule-driven cancellation only. They now carry every cancellation in the system.

Amends **ADR-006 decision 6** — one message per client per batch still holds, but a
client-initiated cancellation notifies the **coach**, not the client who performed it.

Adds a booking state that is not a booking: a coach-held slot (decision 5).

---

## Context

BladeBook could create bookings and destroy them as collateral damage of a schedule
change, and that was all. A client who could not make Tuesday had no recourse in the
product. A coach who woke up ill had to edit their schedule pattern — permanently changing
their availability — to cancel one day of lessons.

Everything below is a business decision made by the owner rather than a technical
inference, and is recorded here so the reasoning is not relitigated. The one genuinely new
piece of modelling is the coach-held slot in decision 5.

---

## Decision

### 1. Three actors cancel; one record shape covers all of them

| Cancelled by | Trigger | Scope |
|---|---|---|
| `CLIENT` | Cancel button on their own booking, or recurrence management | One booking, or the tail of a recurrence |
| `COACH` | Week view — one lesson, one day, or one week | One to a few dozen |
| `SCHEDULE_CHANGE` | The consumer in ADR-006 decision 5 | Unbounded |

All three write the same items: one `CANCELBATCH#<isoTs>#<batchId>` header and one
`CANCELLED#<isoTs>#<batchId>#<bookingId>` line per lesson. **A single-lesson cancellation
is a batch of one.** The batch is what makes "cancel this whole week" produce one email per
affected client rather than six, and it is what satisfies *"all cancellations will be
tracked showing who cancelled."*

The header gains `cancelledBy` (`CLIENT | COACH | SCHEDULE_CHANGE`) and the acting
identity. Lines gain `cancelledAt` and `noticeHours` — the gap between cancellation and
the lesson's start (decision 3).

### 2. Client cancellation

In **My Bookings**, each lesson carries a **cancel** button. Clicking it raises a
confirmation. Confirming deletes the booking, which releases the slot back into
availability — because ADR-004 decision 2 made the booking item the lock, so a released
time must stop existing rather than be restatused.

Beside the confirmation: *"Bookings cancelled within 24 hours may incur a late
cancellation fee."*

### 3. The late-cancellation fee is a notice, not a charge

Nothing computes, charges or tracks a fee. The system never moves money (ADR-003), and
this does not change that.

But the coach cannot act on the warning without knowing which cancellations were late, so
**every cancellation line records `cancelledAt` and the derived `noticeHours`.** Without
it the notice is unenforceable even by hand, and the Phase-2 fee checkbox would have
nothing to read.

*Phase 2: a checkbox on the coach profile declaring that they charge a late fee, which
changes the client-facing wording from "may incur" to "will incur."*

### 4. Client recurrence management

Also in **My Bookings**, a control to modify a recurring arrangement, offering exactly three
operations:

- **Move the end date earlier.** Occurrences after the new end date are cancelled as one
  batch. The end date may only move **earlier**.
- **Reduce the frequency.** `intervalWeeks` may only **increase** — weekly to fortnightly,
  never the reverse. Occurrences that no longer fall on the new interval are cancelled as
  one batch.
- **Cancel all future lessons.** Every remaining occurrence is cancelled.

**Recurrence management is subtractive only, and that is the organising principle.** Every
one of the three operations selects a subset of bookings that already exist and cancels
them. None of them ever claims a slot. So this screen needs no booking machinery at all —
no conditional puts, no per-date pattern resolution, no price stamping, no partial-success
skip list. That is why both restrictions above are stated as directions rather than as
arbitrary limits: the moment either could go the other way, the whole initial booking flow
comes with it.

**"Future" excludes today's lesson**, if one exists. A client cancelling their arrangement
on a Tuesday keeps that Tuesday's lesson; dropping it requires the per-lesson cancel in
decision 2. This makes the boundary explicit rather than leaving "future" to mean whatever
the implementation's clock says.

#### 4a. Frequency is an interval in weeks

A recurrence is anchored to a weekday and a start time, so the only thing frequency can
vary is the number of weeks between occurrences. `intervalWeeks` is an integer, **1 to 4**.

**Not a named enum** (Weekly / Fortnightly / Monthly), for three reasons:

- **"Monthly" has two meanings here and they disagree inside a single term.** "First Monday
  of the month" gives 7 Sep, 5 Oct, 2 Nov, **7 Dec** — irregular gaps of 4, 4 and 5 weeks.
  "Every four weeks" gives 7 Sep, 5 Oct, 2 Nov, **30 Nov**, 28 Dec — regular, but drifting
  off the calendar month, so November gets two lessons and some months get none.
- **The first reading needs a pattern language the model does not have.** ADR-004's
  *Revisit if* names exactly this — *"first Monday of the month, alternating weeks"* — as
  something blocks cannot express. Supporting it only for recurrences would invent the
  concept in one place.
- **An integer supplies the ordering for free.** "Less frequent, never more frequent" is
  `newInterval > currentInterval`. A named enum needs an explicit ordering that has to be
  maintained as values are added.

The cap of 4 is where a standing arrangement stops being one. It also interacts with
ADR-006 decision 4's twelve-month ceiling: at interval 1 that is up to 52 lessons, at
interval 4 it is 13.

#### 4b. Which occurrences survive a frequency change

> **The new interval starts counting from the first occurrence that is neither today's nor
> in the past, and that occurrence always survives.**

Worked example — Mondays at 4:00pm, 7 Sep to 28 Dec 2026, seventeen lessons. Today is
Monday 5 Oct, there is a lesson today, and the client switches to every other week. The
next occurrence is 12 Oct, so it anchors there:

| | |
|---|---|
| **Kept** | 5 Oct *(today, protected)* · **12 Oct** · 26 Oct · 9 Nov · 23 Nov · 7 Dec · 21 Dec |
| **Cancelled** | 19 Oct · 2 Nov · 16 Nov · 30 Nov · 14 Dec · 28 Dec |

**Anchoring to the original start date was rejected**, and not on taste. Keeping every
even-numbered occurrence from 7 Sep would try to cancel 14 Sep and 28 Sep, which are in the
past — and had today been 12 Oct rather than 5 Oct, it would have tried to cancel *today's*
lesson. An anchor that can demand something the rules forbid is not usable.

**Anchoring to today's lesson was also considered** and produces perfectly regular spacing —
5 Oct, 19 Oct, 2 Nov — with no seam. It was rejected because it cancels the lesson four days
away that the client has already planned around. The operation is subtractive and
client-initiated, so it should reach for the far end of the schedule rather than the near
one; a client who also wants next Monday gone has the per-lesson cancel button. The cost is
one uneven gap at the transition, once.

#### 4c. The recurrence header

ADR-006 decision 4 stored no recurrence object — the bookings *are* the recurrence, tied
together by `recurrenceId`. That held while "weekly" was implicit. It cannot survive a
mutable frequency, because **the current interval is not recoverable from the surviving
bookings**: a client on a weekly recurrence who cancels one lesson by hand leaves a two-week
gap, indistinguishable from fortnightly. Inferring frequency from gaps means the modify
screen starts lying after the first ad-hoc cancellation.

So a recurrence gains a header, in the same shape and for the same reason as ADR-008
decision 7's temporary-schedule header:

```jsonc
// PK = COACH#<coachId>
{ "SK": "RECURRENCE#<recurrenceId>",
  "studentId": "s7",
  "clientId": "c3",
  "weekday": "MON",
  "startTime": "16:00",
  "intervalWeeks": 1,
  "endDate": "2026-12-28",
  "startedOn": "2026-09-07" }
```

**Bookings stay authoritative for what is actually scheduled; the header is read only by the
recurrence-management screen.** Nothing on the booking path touches it, so a stale header is
a display defect and never a double-booking. It also makes "modify recurring lessons" a
single query rather than a scan of every booking the client holds, grouped by `recurrenceId`.

This is **not** ADR-005 §4a's `RECURRENCE#` standing intent returning. That item existed to
*generate* bookings as a horizon rolled forward, and it is still discarded — ADR-006
decision 4's materialization at booking time stands unchanged. This header only describes an
arrangement whose bookings already exist.

**Why extension is excluded.** ADR-006 decision 4 materializes a recurrence into real
bookings at booking time, so shortening deletes rows that already exist — a bulk
cancellation using machinery that exists. Extending would *create* rows that do not, which
is the entire initial booking flow again: resolving the pattern per new date, stamping
price and currency per occurrence, a conditional put each, partial-success reporting, and a
fresh answer to "twelve months from when?" The same argument disqualifies increasing
frequency. A client who wants more lessons books another recurrence. See Open for the cost
of that.

**Both restrictions are one-way and irreversible.** A client who drops to fortnightly and
later wants weekly again has no path back — the intervening slots were released and may be
held by someone else by then.

### 5. Coach cancellation, and the coach-held slot

The **coach week view** lists the week by timeslot, showing unbooked slots as *Open* and
booked slots with the student's name. Cancellation happens from there, in three scopes:

1. **This lesson** — a forgotten appointment.
2. **This day** — illness.
3. **This week** — an emergency.

Each asks one question: **release the time for rebooking, or keep it unbookable?**

- **Release** — the booking item is deleted. The slot returns to availability.
- **Hold** — the slot is **assigned to the coach** and stays unbookable.

**A held slot is a booking item with no student.** Same `BOOKING#<date>#<startTime>` key,
`status = COACH_HELD`, no `studentId`, no `clientId`, no `priceMinor`.

This is the only shape that works, and it works for one reason: ADR-004 decision 2 made
the booking item *itself* the lock. A client's conditional `PutItem` fails against a held
slot automatically, and availability — candidate slots minus existing bookings — already
subtracts it. A separate "blocked slot" item type would break both: availability would
need a second query, and nothing would stop a client booking a slot that had a block but
no booking.

**A held slot writes no GSI keys at all**, and that single fact handles three problems
without any filtering logic:

| Index | Effect of omission |
|---|---|
| GSI1 (by student) | Invisible — it has no student |
| GSI2 (by date) | The 7am reminder and 9pm report never see it, so nothing tries to email a client who does not exist |
| GSI3 (unpaid, sparse) | Never appears as a debt |

This is the same sparse-index behaviour ADR-003 decision 5 relies on, applied to a
different end.

**A hold is permanent for MVP.** *Decided by the owner, 2026-08-25.* There is no release
action: once a coach keeps a slot unbookable, it stays that way. Releasing it would mean
deleting the `COACH_HELD` item, and no surface is specified for that.

This is defensible because a hold is an exception — the coach has already decided they are
not teaching that time — and because the alternative was a delete affordance on a slot that
looks much like a booking, which is its own hazard. But the cost should be stated plainly: a
coach who holds a slot by mistake cannot undo it, and that time is gone from their week.

*One accidental escape hatch exists and should not be relied on:* a schedule change that
stops generating that start time makes the held item conflict, so the cancellation consumer
in decision 5 deletes it like any other booking. A coach could therefore release a hold by
editing their pattern to exclude that time and editing it back. Obscure, destructive to
anything else in range, and not a feature.

### 6. Cancelling never changes the schedule

None of the operations above touch `SCHEDULE#DEFAULT` or any `SCHEDULE#DATE#` item. A
coach who cancels a week is *not* declaring that they no longer work those hours.

This keeps ADR-004 decision 1 intact — availability is still computed from the pattern —
and makes cancellation dramatically cheaper than a schedule change: no `ScheduleChanged`
event, no conflict re-evaluation, no expansion. Only booking items move.

### 7. Lessons that already happened are never cancelled

Any booking already `CHECKED_IN` or `NO_SHOW` is skipped by every bulk operation. A coach
cancelling "everything today" at 2pm does not cancel the 9am lesson that already took
place. Day and week scopes operate from now forward, not retroactively.

### 8. The coach must accept before anything is cancelled

Every cancellation scope larger than a single lesson shows the affected bookings **before**
the write, states that accepting will send cancellation emails, and requires explicit
acceptance. This is the same preview-then-accept contract ADR-008 decision 8 specifies for
schedule changes, and it should share the same impact computation and the same list
component.

### 9. Notification

Per ADR-006 decision 6, one message per client per batch — not one per lesson — because
the triggering event is one decision that happened to touch several lessons.

**But the direction depends on who cancelled:**

| Cancelled by | Who is notified |
|---|---|
| `COACH` | Each affected client, once per batch |
| `SCHEDULE_CHANGE` | Each affected client, once per batch |
| `CLIENT` | The **coach** — the client already knows |

Messages state that the lesson is cancelled and offer a link to book a different time
(ADR-006 decision 5). SMS form is constrained by ADR-007 — one 160-character GSM-7
segment, pointing at the email.

**Email templates required:** cancellation from coach (to client), and cancellation from
client (to coach). *Phase 2: distinct templates by reason — sick, emergency, vacation.*

### 10. There is no rescheduling

Moving a lesson is not an operation. The path is **rebook, then cancel** — in that order.

The ordering is the point, not incidental. Booking the new slot before releasing the old
one means a client who finds their preferred alternative already taken still has their
original lesson. Cancel-first risks losing both, and the UI should not present it that way.

### 11. A cancelled lesson is never owed

Payment reminders fire on check-in (ADR-003 decision 7), so a cancelled booking is always
`UNPAID` and simply ceases to exist. There is no charge, no credit and no balance —
consistent with ADR-003 decision 4's no-ledger model. This also answers ADR-003's open
question in the narrow case: a lesson that was cancelled is not billed. Whether a
**no-show** is owed remains open.

---

## Model changes to `architecture.md`

**Added:** `COACH_HELD` as a `Booking.status` value, for slots a coach has retained;
`cancelledBy` and acting identity on the cancellation batch header; `cancelledAt` and
`noticeHours` on cancellation lines; a coach week view; client-facing cancel and
recurrence-management controls.

**Changed:** `LessonCancelled` consumers now route by actor — client-initiated
cancellations notify the coach rather than the client.

**Access patterns added to §5:**

| # | Query | Served by |
|---|---|---|
| 19 | A coach's week, slot by slot, with booked/open/held state | Pattern 5 over a Sun–Sat range, joined against computed availability |
| 20 | A client's cancellable upcoming bookings | GSI1 by student, filtered on `status = BOOKED` |

---

## Consequences

**Easier.** The largest hole in the product closes, and it closes without new
infrastructure: cancellation reuses the booking key, the existing cancellation records,
the existing notifier, and the existing preview contract. A coach-held slot needs no new
item type and no new query. The batch abstraction from ADR-006 turns out to generalize
cleanly to single-lesson cancellations.

**Harder.** `BOOKING#` items now mean two different things — a client's lesson and a
coach's hold — and every consumer that reads them has to know the difference. The GSI
omission handles the automated paths, but any new code that queries the main table
directly must not assume `studentId` is present.

**The 24-hour notice is honest about what it is.** It warns, and it records enough for a
coach to act, and it does nothing else. That is the right amount for a system that does not
move money, but it does mean a client can cancel ten minutes before a lesson and the
product's only response is a line in a list.

**Cancellation and schedule changes are now two paths to the same outcome** — bookings
destroyed, records written, clients emailed — reached through different UI with different
scoping rules. They must share the impact computation, or they will diverge.

---

## Open

- **Is a no-show owed?** Carried forward unanswered from ADR-003. `NO_SHOW` exists as a
  status, payment fires on check-in, so as specified a no-show is never billed. That is
  probably not what a coach wants and it is now the last unresolved question in the
  payment model.
- **Is the coach notified of every client cancellation, or only same-day ones?**
  **Deferred by the owner, 2026-08-25.** The owner's note reads *"cancellation from
  student day of (check if needed)"*, which suggests a threshold. Until it is settled the
  notifier sends on **every** client cancellation — the safe default, since a missed
  same-day cancellation is the expensive failure and an extra email is not. If a threshold
  does arrive it should be the same 24 hours the fee notice uses, or the product ends up
  with two different definitions of "late."
- ~~How does a coach release a held slot?~~ **Settled 2026-08-25: holds are permanent
  for MVP.** See decision 5. Revisit when a coach reports holding a slot by mistake — which
  is the likeliest way this comes back.
- **Does a held slot show anything to the client?** It disappears from availability, which
  is indistinguishable from the coach never offering it. Probably correct; unstated.
- **Two recurrences where there should be one.** Since extension is excluded (decision 4),
  a client wanting more lessons books a second recurrence with a different `recurrenceId`.
  Recurrence management would then show two arrangements, and "cancel all future" on one
  would not touch the other. This is a management-screen wart rather than a correctness
  problem, and it is the strongest argument for building extension later.
- **Which week does "cancel this week" mean** when invoked mid-week — Sun–Sat per ADR-006
  decision 3's view convention, from today forward per decision 7, but the interaction of
  those two is worth stating in the UI rather than inferring.
- **Retention of cancellation records**, which name students and are therefore subject to
  §7's minors' obligations. Carried forward from ADR-006, still unresolved and now
  accumulating faster.

---

## Revisit if

- Late-cancellation fees become real money, at which point decision 3 stops being a notice
  and ADR-003's no-ledger model is the thing that breaks.
- Coaches start using holds as a scheduling tool rather than an exception — blocking out
  regular personal time — which is a signal the schedule editor should express it instead.
- Clients ask to reschedule as one action. Decision 10 is a business decision, not a
  technical constraint, and rebook-then-cancel already contains both halves of the
  operation.
- A payment processor lands: cancellation acquires refund and credit semantics that
  nothing in this ADR anticipates.
- Coaches begin cancelling frequently enough that clients complain, which would make
  cancellation *reasons* (Phase 2 email templates) and coach-side reliability metrics worth
  building.
