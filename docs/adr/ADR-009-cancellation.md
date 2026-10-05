# ADR-009: Cancellation

## Status

**Accepted** — 2026-08-23.

Closes the gap deferred, in turn, by **ADR-003** ("is a no-show owed?"), **ADR-004**
("can a coach edit or cancel a single lesson without touching the pattern?"), **ADR-005**
("can a client skip a single week without ending the arrangement?") and **ADR-006**
("client-initiated cancellation, ending or skipping a recurrence"). Each named it as the
largest hole in the design and left it for a document that did not exist.

Extends **ADR-006 decision 5** — its `CHANGEBATCH#` / `CANCELLED#` records were written
for schedule-driven cancellation only. They now carry every cancellation in the system.

Amends **ADR-006 decision 6** — one message per client per batch still holds, but a
client-initiated cancellation notifies the **coach**, not the client who performed it.

Adds a booking state that is not a booking: a coach-held slot (decision 5).

**Amended — 2026-09-22.** Decision 5a adds the **rinkside app** (the check-in app of
[ADR-014](ADR-014-check-in-app-and-offline-capture.md)) as a second surface for coach
cancellation, alongside the week view on the website. Source:
`FeatureDecriptions/Coach App`.

**Amended — 2026-09-29.** Decision 11 is **superseded in part** by
[ADR-015](ADR-015-late-cancellation-and-no-show-charges.md) decision 1a: from Phase 2, a
client's own cancellation is charged when it is late — from the per-lesson cancel or from
recurrence management alike. A cancellation by the coach or by a schedule change is still
never owed. Decision 2's wording stands for MVP, and decision 4's confirmation gains the same
*"may incur"* notice for any occurrence inside the threshold.

**Amended — 2026-10-01.** Decision **4c**'s header moves from `COACH#<coachId>` to the
client's own partition, `CLIENT#<clientId>` / `RECURRENCE#<coachId>#<recurrenceId>`, and
pattern 21 loses its `clientId` filter ([ADR-022](ADR-022-client-isolation-at-the-database.md)
decision 5). GSI1 is keyed by client, so the *"GSI1 (by student)"* row in decision 5's table
reads *"by client"*; a held slot is still invisible there because it writes no GSI keys.

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
| `COACH` | Week view on the coach website, or the rinkside app (decision 5a) — one lesson, one day, or one week | One to a few dozen |
| `SCHEDULE_CHANGE` | The consumer in ADR-006 decision 5 | Unbounded |

All three write the same items: one `CHANGEBATCH#<isoTs>#<batchId>` header and one
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

*This wording stays for MVP (owner, 2026-09-29). From Phase 2, when the charge switches on,
[ADR-015](ADR-015-late-cancellation-and-no-show-charges.md) decision 6 replaces it with the
coach's own threshold and the booking's stated fee.*

### 3. The late-cancellation fee is a notice, not a charge

> **Superseded for Phase 2 by [ADR-015](ADR-015-late-cancellation-and-no-show-charges.md)
> (2026-08-30):** a late cancellation *and* a no-show both carry a charge, under one rule.
> The reasoning below stands as the record of why the fee started as a notice, and its
> `noticeHours` requirement is what makes ADR-015 implementable at all. The Phase-2
> checkbox it sketches is replaced by a per-block `missedLessonFeeMinor`, where `0` is the off
> switch.

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

*Added 2026-09-29.* **Late occurrences carry the same fee notice as a per-lesson cancel.**
All three operations can cancel an occurrence inside the coach's late-cancellation
threshold — "future" excludes only today, so ending an arrangement on Monday evening cancels
Tuesday's lesson too. From Phase 2 such an occurrence is charged exactly as a late per-lesson
cancel would be ([ADR-015](ADR-015-late-cancellation-and-no-show-charges.md) decision 1a);
occurrences beyond the threshold never are. So the confirmation names any occurrence inside
the threshold and states that cancelling it *may incur a late cancellation fee*. MVP uses
that *"may"* wording and collects nothing; whether Phase 2 makes it definite is decided
then.

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

*Amended 2026-09-29 by [ADR-006](ADR-006-open-booking-recurring-lessons-and-cancellation.md)
decision 4b:* the header gains `recurrenceStatus` — `ACTIVE` or `ENDED` — and is **never deleted**;
*cancel all future lessons* marks it `ENDED`. Each booking also carries
`bookedIntervalWeeks`, the interval it was booked under, so a header that was never written
can be rebuilt automatically. The header remains the only source of the **current** interval.

**Bookings stay authoritative for what is actually scheduled; the header is read only by the
recurrence-management screen.** Nothing on the booking path touches it, so a stale header is
a display defect and never a double-booking. It also makes "modify recurring lessons" a
single query rather than a scan of every booking the client holds, grouped by `recurrenceId`.

This is **not** ADR-005 §4a's `RECURRING#` standing intent returning. That item existed to
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
`bookingStatus = COACH_HELD`, no `studentId`, no `clientId`, no `priceMinor`.

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

#### 5a. The rinkside app is a second cancellation surface

*Added 2026-09-22.* The rinkside app is used at the rink on a phone. Per
`FeatureDecriptions/Coach App` it offers cancellation in **two places**:

1. **A cancel section** — the whole day, part of a day, the whole week, part of a week,
   or specific lessons.
2. **The check-in list** — each lesson has a cancel action next to check-in and no-show,
   so a single lesson can be cancelled from either place.

**It is the same operation, not a second one.** Whatever the surface, a coach cancellation
writes the same `CHANGEBATCH#` header and `CANCELLED#` lines with `cancelledBy = COACH`
(decision 1). It asks the same release-or-hold question (decision 5) and skips lessons that
already happened (decision 7). Anything larger than one lesson gets the same
preview-then-accept step (decision 8), and it notifies clients once per batch (decision 9).
A cancel from the check-in list is a batch of one, like a single-lesson cancel from the
week view.

**"Part of a day" and "part of a week" are not new scopes.** *Settled by the owner,
2026-09-22:* they are the **coach-held spots** — a coach selects several lessons within a day
or a week, cancels them, and the slots they keep become `COACH_HELD`. That is a multi-select
of *this lesson*, exactly as this ADR's Open item anticipated, and it needs no new machinery:
the same batch header, the same lines, the same release-or-hold question, the same preview.

What changes is the **selection affordance**, not the model. The cancel section lets a coach
pick more than one lesson before confirming; everything downstream is decision 5 unchanged.
The three defined scopes stand.

**Release-or-hold is asked per lesson, not once for the selection.** *Decided by the owner,
2026-09-22.* A multi-select of six lessons asks six times. That is real friction, and it is
the right trade against **permanence**: a hold cannot be undone (decision 5), so a single
answer applied to a whole selection would create several irreversible holds from one tap.
It is also a genuinely per-slot judgement — a coach clearing an afternoon may want to
release the early slots for rebooking and hold the late ones.

**The rinkside app cannot cancel without a connection.** *Decided by the owner, 2026-09-30.*
With no signal, every cancel action — in the check-in list and the cancel section — is
disabled, with the note *"Cancelling needs a connection."* Check-ins are queued offline
(ADR-014 decision 1) because they record something that already happened; a cancellation
changes something that is about to happen, and a queued one would not reach the family until
the phone reconnected — possibly after they had left for the rink. It also needs the server
for decision 8's preview.

**A cancel from the check-in list always asks for confirmation, even for one lesson.**
*Decided by the owner, 2026-09-30.* The button stays beside check-in and no-show, where
`Coach App` puts it, but a tap opens a confirmation rather than cancelling. This goes further
than decision 8, which only requires confirmation above a single lesson. The reason is
where the button sits: on a phone held rinkside, often with gloves on, next to the two
buttons tapped most, and a cancel cannot be undone — release deletes the booking and a hold
is permanent.

For the confirmation to actually stop a mis-tap, it has to be something a second mis-tap
cannot complete:

- **It names the lesson** — student, date and time — so the coach sees what they are about
  to cancel.
- **Its confirming action is not where the original tap landed**, so a repeated tap in the
  same spot cannot cancel.
- **Dismissing it keeps the lesson.** The safe choice is the easy one.
- **Release-or-hold is chosen inside the same dialog**, so a single-lesson cancel is still
  one confirmation, not two prompts.

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

**"This week" is the Sunday–Saturday week the coach is looking at, from now on.** *Decided by
the owner, 2026-09-30.* It follows ADR-006 decision 3's week view, so the button can never
cancel a different set of days from the ones on screen.

- **Mid-week:** on a Wednesday afternoon, it cancels Wednesday's lessons that have not started
  yet, through Saturday. The following Sunday is untouched.
- **A future week:** viewing a later week cancels all of that week.
- **Already started, checked in or marked a no-show:** kept, as above.
- **The button states the range and count** before the preview: *"Cancel remaining lessons
  Wed 14 – Sat 17 (6 lessons)."*

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

**The coach also gets a text when a family cancels, in MVP.** *Decided by the owner,
2026-09-30.* A coach at the rink reads texts, not email.

- **Only if the coach has opted in.** A checkbox at signup and on the profile — *"Text me
  when a family cancels"* — **unticked until the coach ticks it**, because carriers do not
  accept pre-ticked consent. Ticking it sends ADR-007 decision 8's one-time opt-in
  confirmation to the coach's phone. The flag is `smsCancellationAlerts` on the coach
  profile ([ADR-016](ADR-016-coach-signup.md)).
- **One text per cancellation batch**, like every other message here — a family ending a
  recurrence produces one text, not twelve.
- **Every client cancellation**, for now. If Kim's answer narrows the coach's notice to late
  cancellations only, the email and the text narrow together.
- **The text follows ADR-007:** one segment, no free text, a pointer to the email. Because it
  goes *to* the coach rather than from them, it opens `BladeBook:` rather than the coach's
  own name — *"BladeBook: Mia R. cancelled Tue 14 Oct 4:00pm. See email."* The student's
  name is budgeted and truncated like any other variable field.

### 10. There is no rescheduling

Moving a lesson is not an operation. The path is **rebook, then cancel** — in that order.

The ordering is the point, not incidental. Booking the new slot before releasing the old
one means a client who finds their preferred alternative already taken still has their
original lesson. Cancel-first risks losing both, and the UI should not present it that way.

### 11. A cancelled lesson is never owed

> **Superseded in part for Phase 2 by
> [ADR-015](ADR-015-late-cancellation-and-no-show-charges.md) decision 1a (2026-09-29):** a
> client's own cancellation inside the coach's threshold is charged, on the `CANCELLED#`
> line — whether it came from the per-lesson cancel or from recurrence management.
> Everything else below still holds: a cancellation by the coach or by a schedule change,
> or a client's cancellation made with enough notice, is never owed, in any phase. The
> no-show question at the end is settled by ADR-015 decision 1: it is charged.

Payment reminders fire on check-in (ADR-003 decision 7), so a cancelled booking is always
`UNPAID` and simply ceases to exist. There is no charge, no credit and no balance —
consistent with ADR-003 decision 4's no-ledger model. This also answers ADR-003's open
question in the narrow case: a lesson that was cancelled is not billed. Whether a
**no-show** is owed remains open.

---

## Model changes to `architecture.md`

**Added:** `COACH_HELD` as a `Booking.bookingStatus` value, for slots a coach has retained;
`cancelledBy` and acting identity on the cancellation batch header; `cancelledAt` and
`noticeHours` on cancellation lines; a coach week view; client-facing cancel and
recurrence-management controls. *Added 2026-09-29, omitted when decision 4 was written:*
`intervalWeeks` (1–4) and the `RECURRENCE#<recurrenceId>` header item (decisions 4a, 4c) —
written at booking time per [ADR-006](ADR-006-open-booking-recurring-lessons-and-cancellation.md)
decision 4a — and access pattern 21, a client's recurring arrangements.

**Changed:** `LessonsChanged` consumers now route by actor — client-initiated
cancellations notify the coach rather than the client.

**Access patterns added to §5:**

| # | Query | Served by |
|---|---|---|
| 19 | A coach's week, slot by slot, with booked/open/held state | Pattern 5 over a Sun–Sat range, joined against computed availability |
| 20 | A client's cancellable upcoming bookings | GSI1 by student, filtered on `bookingStatus = BOOKED` |

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

- ~~Is a no-show owed? Carried forward unanswered from ADR-003. `NO_SHOW` exists as a~~ **Settled 2026-08-30 by [ADR-015](ADR-015-late-cancellation-and-no-show-charges.md): yes** — one rule covers a no-show and a late cancellation, because a no-show is a cancellation with zero notice.
- **Is the coach notified of every client cancellation, or only same-day ones?**
  **Deferred by the owner, 2026-08-25.** The owner's note reads *"cancellation from
  student day of (check if needed)"*, which suggests a threshold. Until it is settled the
  notifier sends on **every** client cancellation — the safe default, since a missed
  same-day cancellation is the expensive failure and an extra email is not. If a threshold
  does arrive it should be the coach's `requiredNoticeHours` (ADR-015 decision 3) — the
  same threshold the fee uses — or the product ends up with two different definitions of
  "late."
- ~~How does a coach release a held slot?~~ **Settled 2026-08-25: holds are permanent
  for MVP.** See decision 5. Revisit when a coach reports holding a slot by mistake — which
  is the likeliest way this comes back.
- ~~Does a held slot show anything to the client?~~ **Settled by the owner, 2026-09-30:** a
  held slot shows as **taken**, exactly like a slot another family has booked. A client sees
  their own lessons as theirs; every other taken slot looks the same, with no indication of
  who holds it or why — another family or the coach.
- **Two recurrences where there should be one.** Since extension is excluded (decision 4),
  a client wanting more lessons books a second recurrence with a different `recurrenceId`.
  Recurrence management would then show two arrangements, and "cancel all future" on one
  would not touch the other. This is a management-screen wart rather than a correctness
  problem, and it is the strongest argument for building extension later.
- ~~Which week does "cancel this week" mean mid-week?~~ **Settled 2026-09-30:** the Sun–Sat
  week on screen, from now on, with the range stated on the button — see decision 7.
- **Retention of cancellation records**, which name students and are therefore subject to
  §7's minors' obligations. Carried forward from ADR-006, still unresolved and now
  accumulating faster.
- ~~What do "part of a day" and "part of a week" mean in the rinkside app?~~ **Settled
  2026-09-22: a multi-select of lessons**, whose held outcomes are the coach-held spots. Not
  a time range, not a new scope — see decision 5a. **Settled the same day: release-or-hold is asked
  per lesson**, as decision 5 already had it — permanence makes a single bulk answer too
  costly to get wrong.
- **Cancellation in the rinkside app widens ADR-014's open question.** A check-in-only Lambda
  could have a role limited to a `Query` on GSI2 plus a conditional `UpdateItem`.
  Cancellation needs the batch writes and the notification path too. It also means a
  token taken from a phone at a public rink can cancel lessons, which is exactly the risk
  `architecture.md` §11 names. Settle it together with the check-in API/app-client decision.
- ~~Can the rinkside app cancel with no signal?~~ **Settled 2026-09-30: no** — cancel actions
  are disabled offline with *"Cancelling needs a connection."* See decision 5a.
- ~~A mis-tap guard on the check-in list.~~ **Settled 2026-09-30: yes** — the button stays,
  and every cancel from the check-in list confirms, even for one lesson. See decision 5a.

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
