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
cancellation, alongside the week view on the website. Its screens and rules are in
`FeatureDecriptions/Coach App` and `FeatureDecriptions/cancelation.md`.

**Amended — 2026-09-29.** Decision 11 is **superseded in part** by
[ADR-015](ADR-015-late-cancellation-and-no-show-charges.md) decision 1a: from Phase 2, a
client's own cancellation is charged when it is late — from the per-lesson cancel or from
recurrence management alike. A cancellation by the coach or by a schedule change is still
never owed. The MVP wording and the recurrence-management notice are product rules — see
`FeatureDecriptions/cancelation.md`.

**Amended — 2026-10-01.** Decision **4c**'s header moves from `COACH#<coachId>` to the
client's own partition, `CLIENT#<clientId>` / `RECURRENCE#<coachId>#<recurrenceId>`, and
pattern 21 loses its `clientId` filter ([ADR-022](ADR-022-client-isolation-at-the-database.md)
decision 5). GSI1 is keyed by client, so the *"GSI1 (by student)"* row in decision 5's table
reads *"by client"*; a held slot is still invisible there because it writes no GSI keys.

**Amended — 2026-10-08.** The coach is notified of a client cancellation only inside
`requiredNoticeHours` (product rule from Kim — see `FeatureDecriptions/cancelation.md`, "Coach told
about a client cancellation"). This narrows decision 9's `CLIENT` row.

**Note — 2026-10-12.** [ADR-007](ADR-007-sms-message-constraints.md) (amended 2026-10-12): all SMS to clients is **Phase 2**. Decision 9's coach text (`smsCancellationAlerts`)
is the one SMS path that stays in MVP. The SMS forms of the client-directed rows (`COACH`,
`SCHEDULE_CHANGE`) wait for Phase 2.

**Superseded in part — 2026-10-13.** *Decided by the owner.*
[ADR-031](ADR-031-lessons-and-seats.md) replaces decision **2**'s "cancelling deletes the
booking" and decision **5**'s `COACH_HELD` booking. A cancelled seat now moves to a
`CANCELLED#` line, and the lesson time reopens (`OPEN`) when its last seat goes; a hold is a
**held lesson time** (`lessonStatus = HELD`) with no seats. Decision **4**'s three series
operations stay, except on a shared series (ADR-031 decision 9; product rule in
`FeatureDecriptions/cancelation.md`). Every behaviour rule still holds unless ADR-031 says
otherwise.

---

## Context

BladeBook could create bookings and destroy them as collateral damage of a schedule
change, and that was all. The owner's cancellation rules — who can cancel what, from which
screen, with what notice — are product rules and live in `FeatureDecriptions/cancelation.md`
(moved 2026-11-08). This ADR records the architecture that serves them. The one genuinely new
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
~~`CANCELLED#<isoTs>#<batchId>#<bookingId>` line per lesson.~~ *Replaced by ADR-031 decision 2
(2026-10-13): one `CANCELLED#<isoTs>#<batchId>#<seatKey>` line per seat.* **A single-lesson cancellation
is a batch of one.** The batch is what makes "cancel this whole week" produce one email per
affected client rather than six, and it is what satisfies *"all cancellations will be
tracked showing who cancelled."*

The header gains `cancelledBy` (`CLIENT | COACH | SCHEDULE_CHANGE`) and the acting
identity. Lines gain `cancelledAt` and `noticeHours` — the gap between cancellation and
the lesson's start (decision 3). *Amended 2026-10-13 (ADR-031): `cancelledBy` gains `NO_ANSWER` (the sweep cancelling an unanswered keep-or-cancel; never chargeable; notified like `CLIENT` with enough notice) — ADR-031 d14.*

### 2. Client cancellation

A family cancels one lesson from My Bookings (product rule — see `FeatureDecriptions/cancelation.md`,
"Client cancelation"). ~~Confirming deletes the booking, which releases the slot back into
availability — because ADR-004 decision 2 made the booking item the lock, so a released
time must stop existing rather than be restatused.~~ *Replaced by ADR-031 decision 2
(2026-10-13): confirming moves the family's seat to a `CANCELLED#` line in one transaction.
The lesson time goes back to `OPEN` when its last seat goes. In a shared lesson, the other
skater stays (ADR-031 decision 8).*

*The confirmation's fee wording moved to `FeatureDecriptions/cancelation.md` ("Client cancelation")
on 2026-11-08 — product content, not an architecture decision.*

### 3. The late-cancellation fee is a notice, not a charge

> **Superseded for Phase 2 by [ADR-015](ADR-015-late-cancellation-and-no-show-charges.md)
> (2026-08-30):** a late cancellation *and* a no-show both carry a charge, under one rule.
> The reasoning below stands as the record of why the fee started as a notice, and its
> `noticeHours` requirement is what makes ADR-015 implementable at all. The Phase-2
> checkbox it sketches is replaced by a per-block `missedLessonFeeMinor`, where `0` is the off
> switch.

The fee is a notice, not a charge, in MVP (product rule — see `FeatureDecriptions/cancelation.md`,
"Late-cancellation and missed-lesson fee"). Nothing computes, charges or tracks a fee. The system
never moves money (ADR-003), and this does not change that.

But the coach cannot act on the warning without knowing which cancellations were late, so
**every cancellation line records `cancelledAt` and the derived `noticeHours`.** Without
it the notice is unenforceable even by hand, and the Phase-2 fee checkbox would have
nothing to read.

*The Phase-2 profile checkbox sketched here moved to `FeatureDecriptions/cancelation.md` ("Make note
for phase 2") on 2026-11-08; ADR-015 replaced it with the per-block fee.*

### 4. Client recurrence management

A family can change a recurring arrangement in three ways only — move the end date earlier,
reduce the frequency (`intervalWeeks` may only increase), or cancel all future lessons — each
cancelling a set of existing occurrences as one batch (product rule — see
`FeatureDecriptions/cancelation.md`, "Client recurrence management", which also holds the
shared-series restriction of ADR-031 decision 9 and the late-fee notice added 2026-09-29).

**Recurrence management is subtractive only, and that is the organising principle.** Every
one of the three operations selects a subset of bookings that already exist and cancels
them. None of them ever claims a slot. So this screen needs no booking machinery at all —
no conditional puts, no per-date pattern resolution, no price stamping, no partial-success
skip list. That is why both restrictions above are stated as directions rather than as
arbitrary limits: the moment either could go the other way, the whole initial booking flow
comes with it.

**"Future" excludes today's lesson**, if one exists (product rule — see
`FeatureDecriptions/cancelation.md`, "Client recurrence management"); the batch selects from the
first occurrence after today.

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

*What this means for the family (one-way and irreversible) moved to
`FeatureDecriptions/cancelation.md` ("Client recurrence management") on 2026-11-08.*

### 5. Coach cancellation, and the coach-held slot

A coach cancels one lesson, one day or one week from the week view, and each cancellation
asks whether to **release** the time or **hold** it (product rule — see
`FeatureDecriptions/cancelation.md`, "Coach cancelation"). The two answers write:

- **Release** — ~~the booking item is deleted.~~ *each seat moves to a `CANCELLED#` line and
  the lesson time goes back to `OPEN` (ADR-031 decision 2, 2026-10-13).* The slot returns to
  availability.
- **Hold** — the slot is **assigned to the coach** and stays unbookable. *ADR-031 decision 1
  (2026-10-13): the seats move to `CANCELLED#` lines and the lesson time becomes `HELD`.*

~~**A held slot is a booking item with no student.** Same `BOOKING#<date>#<startTime>` key,
`bookingStatus = COACH_HELD`, no `studentId`, no `clientId`, no `priceMinor`.~~

~~This is the only shape that works, and it works for one reason: ADR-004 decision 2 made
the booking item *itself* the lock. A client's conditional `PutItem` fails against a held
slot automatically, and availability — candidate slots minus existing bookings — already
subtracts it. A separate "blocked slot" item type would break both: availability would
need a second query, and nothing would stop a client booking a slot that had a block but
no booking.~~ *Replaced by ADR-031 decision 1 (2026-10-13): a held slot is a **held lesson
time** — the same `LESSON#<date>#<startTime>` item with `lessonStatus = HELD` and no seats. A
booking needs the lesson time to be `OPEN`, so it fails against a held one, and availability
shows it as taken. The reasoning is the same: the lock and the hold are one item.*

**A held slot writes no GSI keys at all**, and that single fact handles three problems
without any filtering logic: *(Still true under ADR-031, 2026-10-13: a held lesson time has no
seats, and only seats carry index keys.)*

| Index | Effect of omission |
|---|---|
| GSI1 (by student) | Invisible — it has no student |
| GSI2 (by date) | The 7am reminder and 9pm report never see it, so nothing tries to email a client who does not exist |
| GSI3 (unpaid, sparse) | Never appears as a debt |

This is the same sparse-index behaviour ADR-003 decision 5 relies on, applied to a
different end.

**A hold is permanent for MVP** (product rule, owner 2026-08-25 — see
`FeatureDecriptions/cancelation.md`, "Coach cancelation"). So there is no release operation.
Releasing would mean ~~deleting the `COACH_HELD` item~~ *setting the held lesson time back to
`OPEN` (ADR-031 decision 1, 2026-10-13)*, and no surface is specified for that.

*One accidental escape hatch exists and should not be relied on:* a schedule change that
stops generating that start time makes the held item conflict, so the cancellation consumer
in decision 5 deletes it like any other booking. A coach could therefore release a hold by
editing their pattern to exclude that time and editing it back. Obscure, destructive to
anything else in range, and not a feature.

#### 5a. The rinkside app is a second cancellation surface

*Added 2026-09-22.* The rinkside app offers cancellation from a cancel section and from the
check-in list (screens and rules: `FeatureDecriptions/Coach App`, moved 2026-11-08).

**It is the same operation, not a second one.** Whatever the surface, a coach cancellation
writes the same `CHANGEBATCH#` header and `CANCELLED#` lines with `cancelledBy = COACH`
(decision 1). It asks the same release-or-hold question (decision 5) and skips lessons that
already happened (decision 7). Anything larger than one lesson gets the same
preview-then-accept step (decision 8), and it notifies clients once per batch (decision 9).
A cancel from the check-in list is a batch of one, like a single-lesson cancel from the
week view.

**"Part of a day" and "part of a week" are a multi-select of *this lesson*** (product rule,
owner 2026-09-22 — see `FeatureDecriptions/cancelation.md`, "Coach cancelation"), so they need no
new machinery: the same batch header, the same lines, the same release-or-hold answer per lesson,
the same preview. Kept slots become ~~`COACH_HELD`~~ *held lesson times (`HELD`, ADR-031 decision
1, 2026-10-13)*.

**Cancellation is never queued offline** (product rule, owner 2026-09-30 — the rinkside app
disables cancel with no signal; see `FeatureDecriptions/Coach App`). Unlike a check-in (ADR-014
decision 1), it changes something about to happen, so a queued one could reach the family too
late, and it needs the server for decision 8's preview.

*The check-in-list confirmation and its mis-tap guard (owner, 2026-09-30) moved to
`FeatureDecriptions/Coach App` on 2026-11-08 — product content, not an architecture decision.*

### 6. Cancelling never changes the schedule

None of the operations above touch `SCHEDULE#DEFAULT` or any `SCHEDULE#DATE#` item. A
coach who cancels a week is *not* declaring that they no longer work those hours.

~~This keeps ADR-004 decision 1 intact — availability is still computed from the pattern —
and makes~~ *This makes* cancellation dramatically cheaper than a schedule change: no `ScheduleChanged`
event, no conflict re-evaluation, no expansion. ~~Only booking items move.~~ *Replaced by
ADR-031 decisions 1 and 2 (2026-10-13): only seats and lesson times change — seats move to
`CANCELLED#` lines, and each lesson time goes `OPEN` or `HELD`.*

### 7. Lessons that already happened are never cancelled

Any booking already `CHECKED_IN` or `NO_SHOW` is skipped by every bulk operation. A coach
cancelling "everything today" at 2pm does not cancel the 9am lesson that already took
place. Day and week scopes operate from now forward, not retroactively.

**"This week" is the Sunday–Saturday week on screen, from now on** (product rule, owner
2026-09-30 — see `FeatureDecriptions/cancelation.md`, "Coach cancelation"). The range sent to the
server is the week shown, clipped to lessons not yet started.

### 8. The coach must accept before anything is cancelled

Every scope larger than a single lesson is previewed and accepted before the write (product
rule — see `FeatureDecriptions/cancelation.md`, "Coach cancelation"). This is the same
preview-then-accept contract ADR-008 decision 8 specifies for schedule changes, and it should
share the same impact computation and the same list component.

### 9. Notification

Per ADR-006 decision 6, one message per client per batch — not one per lesson — because
the triggering event is one decision that happened to touch several lessons.

**But the direction depends on who cancelled:**

| Cancelled by | Who is notified |
|---|---|
| `COACH` | Each affected client, once per batch |
| `SCHEDULE_CHANGE` | Each affected client, once per batch |
| `CLIENT` | The **coach** — the client already knows. *Amended 2026-10-08: only inside `requiredNoticeHours`.* |

*Amended 2026-10-13 (ADR-031): `cancelledBy` gains `NO_ANSWER` (the sweep cancelling an unanswered keep-or-cancel; never chargeable; notified like `CLIENT` with enough notice) — ADR-031 d14.*

SMS form is constrained by ADR-007 — one 160-character GSM-7 segment, pointing at the email.
*Message contents and the template list moved to `FeatureDecriptions/Email templates Needed:` on
2026-11-08.*

**The coach also gets a text when a family cancels late, in MVP** (product rule, owner
2026-09-30, narrowed 2026-10-08 — see `FeatureDecriptions/cancelation.md`, "Coach told about a
client cancellation"). Technically:

- **Opt-in only.** The flag is `smsCancellationAlerts` on the coach profile
  ([ADR-016](ADR-016-coach-signup.md)), false until the coach sets it; setting it sends ADR-007
  decision 8's one-time opt-in confirmation.
- **One text per cancellation batch**, like every other message here.
- **Same filter as the email:** sent only when `noticeHours < requiredNoticeHours`, so the email
  and the text narrow together.
- **The text follows ADR-007:** one segment, no free text, a pointer to the email, prefixed
  `BladeBook:`; the student's name is budgeted and truncated like any other variable field.

### 10. There is no rescheduling

Moving a lesson is not an operation; the API has no reschedule call (product rule — see
`FeatureDecriptions/cancelation.md`, "Business decision: there is no rescheduling").

### 11. A cancelled lesson is never owed

> **Superseded in part for Phase 2 by
> [ADR-015](ADR-015-late-cancellation-and-no-show-charges.md) decision 1a (2026-09-29):** a
> client's own cancellation inside the coach's threshold is charged, on the `CANCELLED#`
> line — whether it came from the per-lesson cancel or from recurrence management.
> Everything else below still holds: a cancellation by the coach or by a schedule change,
> or a client's cancellation made with enough notice, is never owed, in any phase. The
> no-show question at the end is settled by ADR-015 decision 1: it is charged.

Payment reminders fire on check-in (ADR-003 decision 7), so a cancelled booking is always
`UNPAID` and ~~simply ceases to exist~~ *becomes a `CANCELLED#` line (ADR-031 decision 2,
2026-10-13)*. There is no charge, no credit and no balance —
consistent with ADR-003 decision 4's no-ledger model. This also answers ADR-003's open
question in the narrow case: a lesson that was cancelled is not billed. Whether a
**no-show** is owed remains open.

---

## Model changes to `architecture.md`

**Added:** ~~`COACH_HELD` as a `Booking.bookingStatus` value, for slots a coach has retained;~~
*(replaced by ADR-031 decision 1, 2026-10-13: `HELD` as a `lessonStatus` value on the lesson
time)*
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
| 19 | A coach's week, slot by slot, with booked/open/held state | ~~Pattern 5 over a Sun–Sat range, joined against computed availability~~ *Two range queries, `LESSON#` and `SEAT#`, over the Sun–Sat range (ADR-031, 2026-10-13)* |
| 20 | A client's cancellable upcoming bookings | ~~GSI1 by student, filtered on `bookingStatus = BOOKED`~~ *GSI1 by client, on seats (ADR-031 decision 2, 2026-10-13)* |

---

## Consequences

**Easier.** The largest hole in the product closes, and it closes without new
infrastructure: cancellation reuses the booking key, the existing cancellation records,
the existing notifier, and the existing preview contract. A coach-held slot needs no new
item type and no new query. The batch abstraction from ADR-006 turns out to generalize
cleanly to single-lesson cancellations.

**Harder.** ~~`BOOKING#` items now mean two different things — a client's lesson and a
coach's hold — and every consumer that reads them has to know the difference. The GSI
omission handles the automated paths, but any new code that queries the main table
directly must not assume `studentId` is present.~~ *Replaced by ADR-031 decisions 1 and 2
(2026-10-13): a hold is a lesson-time status, and only seats name a skater, so no item means
two things.*

*The "24-hour notice is honest about what it is" consequence moved to
`FeatureDecriptions/cancelation.md` ("Late-cancellation and missed-lesson fee") on 2026-11-08.*

**Cancellation and schedule changes are now two paths to the same outcome** — bookings
destroyed, records written, clients emailed — reached through different UI with different
scoping rules. They must share the impact computation, or they will diverge.

---

## Open

- ~~Is a no-show owed? Carried forward unanswered from ADR-003. `NO_SHOW` exists as a~~ **Settled 2026-08-30 by [ADR-015](ADR-015-late-cancellation-and-no-show-charges.md): yes** — one rule covers a no-show and a late cancellation, because a no-show is a cancellation with zero notice.
- ~~Is the coach notified of every client cancellation, or only same-day ones?~~ **Settled
  2026-10-08 from Kim: only inside the notice period**, filtered on `requiredNoticeHours` (ADR-015
  decision 3) so there is one definition of "late". History moved to
  `FeatureDecriptions/cancelation.md` on 2026-11-08.
- ~~How does a coach release a held slot?~~ **Settled 2026-08-25: holds are permanent
  for MVP.** See decision 5.
- ~~Does a held slot show anything to the client?~~ **Settled by the owner, 2026-09-30:** it
  shows as taken (moved to `FeatureDecriptions/cancelation.md`). Availability returns it as taken
  with no holder.
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
  2026-09-22: a multi-select of lessons**, release-or-hold per lesson — see decision 5a and
  `FeatureDecriptions/cancelation.md`.
- **Cancellation in the rinkside app widens ADR-014's open question.** A check-in-only Lambda
  could have a role limited to a `Query` on GSI2 plus a conditional `UpdateItem`.
  Cancellation needs the batch writes and the notification path too. It also means a
  token taken from a phone at a public rink can cancel lessons, which is exactly the risk
  `architecture.md` §11 names. Settle it together with the check-in API/app-client decision.
- ~~Can the rinkside app cancel with no signal?~~ **Settled 2026-09-30: no** — see decision 5a.
- ~~A mis-tap guard on the check-in list.~~ **Settled 2026-09-30: yes** — see
  `FeatureDecriptions/Coach App`.

---

## Revisit if

- Late-cancellation fees become real money, at which point decision 3 stops being a notice
  and ADR-003's no-ledger model is the thing that breaks.
- Coaches start using holds as a scheduling tool rather than an exception — blocking out
  regular personal time — which is a signal the schedule editor should express it instead.
- Clients ask to reschedule as one action (product trigger — see `FeatureDecriptions/cancelation.md`).
- A payment processor lands: cancellation acquires refund and credit semantics that
  nothing in this ADR anticipates.
- Coaches begin cancelling frequently enough that clients complain (product trigger — see
  `FeatureDecriptions/cancelation.md`).
