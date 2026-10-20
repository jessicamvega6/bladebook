# ADR-010: Availability, Reliability and Operational Alerting

## Status

**Accepted** — 2026-08-28.

**Extended by [ADR-020](ADR-020-repricing-booked-lessons.md)** — 2026-09-30. Decision **5**'s plan
now holds re-price lines (`REPRICED#`) beside cancellation lines, each carried out in its own
conditional transaction and marked `SKIPPED` if its booking changed in the meantime. Names in
this ADR follow ADR-020's renames.

**Amended — 2026-09-30.** Decisions **5g–5k** make the schedule-change consumer recoverable:
event-derived keys, a plan-complete marker, a re-check before every record is carried out, a
reconcile command in place of redrive, and a nightly read-only drift check.
Decision **2a** sets what happens when each consumer's dead-letter queue fills, and **5l**
shows the coach whether a change has finished.

First statement of the non-functional requirements. `architecture.md` used the word
"availability" thirty-three times before this document existed, and every one of them meant
an *availability slot* — the domain concept. The requirement itself had never been written
down.

Adds `Booking.remindedOn`. Adds obligations to every asynchronous consumer named in
ADR-001 decision 1, and to the schedule-change cancellation consumer specified in ADR-006
decision 5.

**Amended — 2026-09-29.** Decision **5f** states which write triggers the cancellation
notifier. Decisions 5c and 5e each hold, but together they left it unstated, and both
readings of 5e broke a guarantee elsewhere. 5f adds an explicit execution state to the
cancellation records and fires the notifier once, when the whole batch has been carried out.

**Amended — 2026-10-05.** [ADR-024](ADR-024-client-write-link-check.md) adds two pages to decision 4's list: one family failing the
client link check 3 or more times in 15 minutes, and 10 or more failures across everyone in a
day. Both thresholds are configuration.

**Amended — 2026-10-07.** [ADR-027](ADR-027-on-demand-dev-environment.md): there is no long-running staging. Decision 4's alarms are proved
in an on-demand **dev** stack, and the cancellation-path canary (*Explicitly not doing*) runs
**against production** as a dedicated test coach and family.

**Amended — 2026-10-09.** Decision **4**'s missed-run alarm counts a function's `Invocations`, which
can't see a missed run of a function that also has other triggers. [ADR-026](ADR-026-shared-lessons-by-invitation.md)
decision 5a's nightly invitation sweep runs inside `consumer-invite`, which also runs on every
invitation event. So the sweep records its own metric, **`InviteSweepCompleted`**, each time it
finishes, and its alarm watches that metric: `Sum < 1` over a day, `treatMissingData: breaching`.
*Replaced by ADR-031 decision 12 (2026-10-13): the nightly invitation sweep becomes the hourly
`sched-deadline-sweep`, and its completion metric drives the missed-run alarm.*

**Amended — 2026-10-13.** *Decided by the owner.* [ADR-031](ADR-031-lessons-and-seats.md)
stores bookable times as **lesson times** (`LESSON#`) and each skater's place as a **seat**
(`SEAT#`). For this ADR that means:
- **A new nightly job, `sched-lesson-roller`** (ADR-031 decision 1), keeps lesson times stored
  about 15 months ahead. As a scheduled function it gets decision 4's missed-run alarm.
- **ADR-026's nightly invitation sweep becomes `sched-deadline-sweep`, every hour** (ADR-031
  decision 12). It finds ~~due seats~~ due records (invited seats and lesson times) *[Revised 2026-10-13 (ADR-031)]* through a new sparse global secondary index (GSI), GSI4. Its completion metric
  drives a missed-run alarm; a missed hour catches up on the next run.
- **Decision 5's batch now acts on lesson times and seats.** Its steps are unchanged — claim,
  write the whole plan, re-check each line, mark executed last, notify after — but a cancel
  moves each seat to a `CANCELLED#` line and deletes the lesson time, and the plan also adds
  and removes `OPEN` lesson times (ADR-031 decision 11).
- **Reconcile and the drift check compare the schedule with the stored lesson times**, not
  with bookings.

Every behaviour rule still holds unless ADR-031 says otherwise.


**Amended — 2026-10-15.** [ADR-027](ADR-027-on-demand-dev-environment.md): the cancellation-path
canary runs once after each production deploy, not on a schedule; the scheduled run is Phase 2.
An always-on up-check (home page and an API `/health` route) pages through decision 4.

**Amended — 2026-10-20.** [ADR-033](ADR-033-invite-only-accepted-skaters.md): the deadline sweep's work shrinks to `EXPIRE` and
`ANSWER`, with no shared-lesson warning and no 9pm timing. Its missed-run alarm is unchanged.

---

## Context

Availability is close to free here and close to meaningless. Every component is managed and
multi-AZ by default; there is no VPC, no NAT gateway, no load balancer and no instance to
fall over. Lambda, DynamoDB and API Gateway each publish availability in the 99.95–99.99%
range, so the composed system lands near 99.9% without anyone trying, and there is no way to
spend money improving that which would not violate §12's $2–10/month budget by an order of
magnitude.

Nothing here justifies the spend either. No money moves (ADR-003). Nothing is
safety-critical. The worst outcome of an outage is a client who cannot book at 10pm booking
at 10:15 instead.

**So availability is not the interesting requirement. Reliability is — and specifically the
failures that raise no error at all.** A booking that throws a 500 is visible and the client
retries. A cron that silently does not fire, or an event pipeline that stalls while every
write still succeeds, is invisible, and every notification the product exists to send simply
stops.

---

## Decision

### 1. Tolerance is stated per path, as time-to-impact

Not one availability number. A single target would be simultaneously too strict for the
end-of-day report and far too loose for the cancellation notifier.

| Path | If it fails | Tolerance | Page? |
|---|---|---|---|
| **Cancellation notification** | Families drive to cancelled lessons | Minutes | **Yes** |
| **Day-of reminder (7am)** | Missed lessons | Must fire within the hour | **Yes** |
| **Booking, schedule editing** | Client retries | Hours | No |
| **Check-in** | Coach records it later | A day | No |
| **End-of-day report (9pm)** | Coach reads it tomorrow | A day | No |

The two page-worthy rows share a property the others lack: **the person harmed is not the
person who sees the failure.** A client whose booking 500s knows immediately and tries
again. A family never told their lesson was cancelled learns at the rink.

*Tolerance is time-to-impact, not uptime.* "Minutes" does not mean 99.99%; it means a
failure must be detected and retried within minutes, which is a statement about retry
windows and alarms rather than about redundancy.

### 2. Every asynchronous consumer gets a dead-letter queue (DLQ) and an idempotency guard

*Decided by the owner, 2026-08-28.* Uniform, not per-path. The tolerance table above
governs alerting; it does not govern whether a consumer is safe to retry. Every one is.

The uniform rule is deliberate: a per-path judgment about which messages "matter enough"
becomes a judgment someone has to re-make correctly every time a consumer is added, at the
moment they are least likely to think about it.

**A dead-letter queue (DLQ) nobody drains is a silent failure with extra steps.** The unit is therefore
*queue + depth alarm + a decision about redrive*, never the queue alone.

Guards required, per consumer:

| Consumer | Guard | Status |
|---|---|---|
| `consumer-payment-reminder` | `paymentReminderSent` | Exists (ADR-003 d4) |
| `consumer-change-notifier` | `notificationStatus` | Exists (ADR-006 d5) |
| `consumer-booking-confirmation` | a `confirmationSent` flag on the booking *(on the seat — ADR-031 decision 2, 2026-10-13)* | **To build** |
| `sched-day-reminder` | **`remindedOn`** (seat) and **`morningEmailSentOn`** (coach profile, since 2026-10-13) — see decision 3 | **To build** |
| `sched-daily-report` | the report's `(coach, date)` S3 key is naturally idempotent; the **email** is not | **To build** |
| Schedule-change cancellation | see decision 5 — the hard one | **To build** |
| `sched-deadline-sweep` *(Amended 2026-10-13 (ADR-031 d12))* | re-checks each record before acting; no dead-letter queue, by design | **To build** |
| `sched-lesson-roller` *(Amended 2026-10-13 (ADR-031 d12))* | creates only lesson times that don't exist; no dead-letter queue | **To build** |

### 2a. When a dead-letter queue fills: replay, discard, or re-run for a date

*Decided by the owner, 2026-09-30.* Every consumer's guard makes replaying a message **safe**.
Whether replaying is still **useful** depends on what the message was for:

| Consumer | When its queue fills | Why |
|---|---|---|
| `consumer-change-notifier` | **Replay at once** — already pages | Families still need to hear about cancellations and price changes, however late |
| `consumer-schedule-change` | **Reconcile, don't replay** — pages (5j) | The reconcile command finishes the batch and checks everything else |
| `consumer-booking-confirmation` | Replay | A late confirmation is still worth sending |
| `consumer-payment-reminder` | Replay | Still owed; `paymentReminderSent` stops a duplicate |
| `sched-day-reminder` | **Discard** once its date has passed | "You have a lesson today" is wrong the next day |
| `sched-daily-report` | **Re-run for that date** | The report for the 14th is still wanted on the 15th |
| `sched-unpaid-reminder` | Discard | Next week's run includes the same lessons |
| `sched-drift-check` | Discard | Tomorrow night's run covers it; repeated failure trips its missed-run alarm |
| `sched-deadline-sweep` *(Amended 2026-10-13 (ADR-031 d12))* | *No queue, by design* | A scheduled job that re-checks each record; a missed hour catches up on the next run, and its missed-run alarm pages |
| `sched-lesson-roller` *(Amended 2026-10-13 (ADR-031 d12))* | *No queue* | It creates only lesson times that don't exist, so the next night's run fills any gap; its missed-run alarm pages after 3 missed nights |
| `consumer-ttl-archiver` | *No queue to replay* | It reads the stream directly, so a failure leaves no message. The stream-age alarm (decision 6) and PITR's 35 days are the recovery — fix within 24 hours |

Only the notifier's and the schedule-change consumer's queues page (decision 4). The rest are
a morning-dashboard read.

**Scheduled jobs' triggers carry the date they are for.** Each Scheduler rule passes its
target date in the event rather than letting the job read the clock. A replayed or re-run job
therefore works on *that* date, not today's — which is what lets the daily report be re-run
for a past date, and lets the day-of reminder refuse a date that has already passed.

**Replaying is one operator command:**

```
redrive-dlq --function <name> [--dry-run]
```

It lists the queued messages first. For a *replay* consumer it re-sends each one to the
function and removes it from the queue once handled; for a *discard* consumer it removes them
after confirmation; for the daily report it re-runs each message's date. It refuses
`consumer-schedule-change`, whose recovery is the reconcile command.

### 3. `Booking.remindedOn` — the day-of reminder guard

*Decided by the owner, 2026-08-28.* The guard is keyed on **(booking, date)**, not on the
booking alone. *ADR-031 decision 2 (2026-10-13): `remindedOn` now sits on each seat.* *Amended 2026-10-13 (ADR-023): the same run stamps `morningEmailSentOn` on the coach's profile, keyed on (coach, date), so a retry never sends the coach's morning email twice.*

The other guards are booleans on an item because their event happens once in a booking's
life. This one runs per date across every coach, so the reminder job reads `remindedOn`,
skips any booking already stamped with today, sends, then stamps.

Keying on the date rather than a boolean costs nothing today and means a booking that is
ever moved to another date can be reminded about again, correctly, rather than being
permanently marked as done.

### 4. Alerts for **not** firing, and they do not travel by email

**Alarming on errors cannot catch a job that did not run.** No error, no log line, no metric
datapoint — there is nothing to alarm on. The mechanism is a **dead man's switch** — named for the train control that stops the
train when the driver lets go, because *inaction* is what produces the safe outcome. Here it
means: stop watching for evidence of failure, and watch for evidence of life. Alarm on the
*absence* of a positive signal.

Concretely, for each scheduled function: a CloudWatch alarm on `Invocations`, `Sum < 1` over
the window in which it should have run, with **`treatMissingData: breaching`**. That last
setting is the entire trick — the default treats missing data as "no opinion", which is
exactly the case being watched for. *Amended 2026-10-09: a scheduled run inside a function that
also has event triggers is watched through its own completion metric instead (see Status).*

**Alerts about Simple Email Service (SES) go to a phone number.** *Decided by the owner, 2026-08-28.* Monitoring
the email system with the email system is a loop: a cancellation-notifier failure is
precisely the case where the mail path is the suspect. Simple Notification Service (SNS) to a phone.

Everything page-worthy takes the same route. With only a handful of page-worthy conditions,
a second email channel adds a failure mode and buys nothing.

**What pages:**

- Simple Email Service (SES) bounce rate approaching 5%, or complaint rate approaching 0.1% — the suspension
  thresholds. Suspension stops every reminder and every cancellation notice, silently.
- Cancellation-notifier dead-letter queue (DLQ) depth > 0.
- *Added 2026-09-30 (5j, 5k):* the schedule-change consumer's DLQ depth > 0; a change batch
  unfinished for more than an hour; a lesson that should have been cancelled and was not.
- The 7am reminder did not fire.
- *Amended 2026-10-13 (ADR-031 d12):* `sched-deadline-sweep` has no completed run for 2 hours.
- *Amended 2026-10-13 (ADR-031 d12):* `sched-lesson-roller` missed 3 nights (it shows on the
  dashboard after 1).
- DynamoDB Streams iterator age climbing — see decision 6.

Everything else is a dashboard read in the morning.

**Alarms live in production.** *Decided by the owner, 2026-09-30:* staging gets alarms only
**temporarily, to prove they fire** — each one is created in staging, triggered on purpose
(a stopped schedule for a dead man's switch, a forced failure for a dead-letter queue), seen
to alert, and then deleted. Production keeps them permanently. Like the WAF (ADR-019 decision
4a), staging's alarms sit behind a configuration switch, so they can be brought back to
re-test after a change to the alerting.

*Amended 2026-10-07 by [ADR-027](ADR-027-on-demand-dev-environment.md): read "staging" as the on-demand dev stack.*

### 5. The schedule-change cancellation consumer

The hardest of the six, because it is multi-step, destructive, and **it mutates the very set
it queries**. The others send a message and set a flag; this one deletes rows.

**Why a plain retry corrupts state.** A save conflicts with 47 bookings. The consumer
deletes 30, writes the batch header, writes 30 lines, then dies. On retry it re-queries
bookings in range — the 30 it deleted are gone, so it finds 17. It writes a *second* batch
header with a new id and 17 lines. There are now two batches for one schedule change, the
first claiming `lessonCount: 47` above 30 lines, and nothing recording that they are the
same event.

Four requirements make it safe:

**5a. Derive `batchId` from the trigger.** `ScheduleChanged` arrives via DynamoDB Streams,
and every stream record carries a unique event id. Deriving `batchId` from it means a retry
produces the *same* id, which is what makes everything below possible. A generated id makes
resumption impossible by construction.

**5b. Claim the batch conditionally.** Write the header first with
`attribute_not_exists(SK)`. Failure is not an error — it means this batch was already
started, and the run switches from *fresh* to *resume*.

**5c. Write the plan before executing it.** This is the load-bearing requirement. Compute
the conflict set, then write the header **and every `CANCELLED#` line** first, each marked
pending. ~~Only then delete the bookings, marking lines executed as it goes.~~ *Replaced by
ADR-031 decision 11 (2026-10-13): only then change the lesson times and seats — add, remove,
cancel or re-price — marking lines executed as it goes.*

The plan survives the crash. Without it a partial run is unrecoverable, because the record
of what it intended existed only in memory and the query can no longer rediscover it.

*"Pending" here means not yet carried out. It is not `notificationStatus = PENDING`, which
means nobody has been told yet. Decision 5f gives it its own field, `executionStatus`.*

**5d. One transaction per cancellation.** ~~Delete the booking and mark its line executed in a
single `TransactWriteItems` — both or neither.~~ *Replaced by ADR-031 decisions 2 and 11
(2026-10-13): move each seat to its `CANCELLED#` line, delete the lesson time and mark the line
executed in a single `TransactWriteItems` — all or nothing.* This closes the hole where a booking is
deleted with no record, which would mean a lesson silently gone and a family never told.

Per booking, **not** one transaction for the batch: the 100-item cap breaks at 50
cancellations, and per-booking scoping stops one bad row failing the whole run.

**5e. The consumer stops emitting; the records drive the notifier.** Today it deletes,
records, *and* emits `LessonsChanged`. Dying between recording and emitting leaves records
with nobody told.

Instead, the `CANCELLED#` line write drives the notifier through the same CDC path
everything else uses. "Who has been told" is then derived from `notificationStatus` rather
than from whether an emit call succeeded, and the notifier's existing guard covers it. This
also amends ADR-006 decision 5's sequence diagram, which shows the consumer emitting to the
bus directly.

*Which* write drives the notifier is settled in decision 5f: it is not a line write at all,
but the batch header being marked executed.

**5f. The notifier fires when the batch is finished, not when a line is written.**
*Added 2026-09-29.*

Under 5c and 5d every `CANCELLED#` line is written three times, and the change stream
emits an event for each:

| Write | When | Stream event |
|---|---|---|
| Line inserted, not yet carried out | 5c, before any booking is deleted | `INSERT` |
| Line marked executed | 5d, in the same transaction as its booking's delete | `MODIFY` |
| Notifier stamps `notificationStatus` | After sending | `MODIFY` |

5e did not say which one drives the notifier, and each candidate breaks something:

- **The insert.** Families are told before their lesson is cancelled. If the consumer then
  fails until its event reaches the dead-letter queue, a family has been emailed "your lesson
  is cancelled" while the booking still exists — and stays home from a lesson the coach is
  still expecting. That is the mirror image of the failure decision 1 makes page-worthy.
- **The line marked executed.** Truthful, but lines execute one at a time, so a client with
  six cancelled lessons produces six events spread over the run. ADR-006 decision 6 promises
  one message per client per batch, and nothing tells the notifier when a client's set is
  complete. The per-line guard stops one lesson being sent twice; it does not stop six
  emails for six lessons.

So:

1. **Execution gets its own field.** Each `CANCELLED#` line carries `executionStatus`:
   `PLANNED` when 5c writes it, `EXECUTED` when 5d ~~deletes its booking~~ *moves its seat
   (ADR-031, 2026-10-13)*, or `SKIPPED` if the
   booking was already gone when the consumer reached it — most likely cancelled by someone
   else in between, which produced its own record and its own message. The batch header
   carries `executionStatus` too: `PLANNED`, then `EXECUTED`.
2. **The header is marked `EXECUTED` last**, after every line is `EXECUTED` or `SKIPPED`. A
   resumed run (5b) finishes the plan and then does the same, so a crash delays the
   notification rather than losing or splitting it.
3. **The notifier listens only for the header reaching `EXECUTED`.** The EventBridge Pipe
   filters on the header's new image having `executionStatus = EXECUTED` and its old image
   either absent or not `EXECUTED`. Line writes — including the notifier's own stamps — never
   match, so the notifier is not woken by its own writes. *Extended 2026-09-30 by
   [ADR-017](ADR-017-data-retention-ttl-and-archive.md) decision 4:* the Pipe also explicitly
   drops removals made by DynamoDB's Time to Live, which a separate archiver reads instead.
4. **The notifier reads the batch's `EXECUTED` lines, groups them by client, and sends one
   message per client**, stamping `notificationStatus` on that client's lines. `SKIPPED` lines
   are not notified. On a retry, clients whose lines are already `SENT` are passed over, which
   is the existing guard doing the job it already had.

**What this keeps.** The plan still survives a crash (5c). Nothing is emitted outside the
change stream (5e). Nobody is told about a cancellation that has not happened. Each client
gets one complete message.

**What it costs.** Nobody is notified until the whole batch has run. A few hundred
per-booking transactions finish well inside decision 1's "minutes" tolerance for this path;
a batch too large for that is the 15-minute-Lambda case already in *Revisit if*.

**Direct cancellations follow the same rule** (ADR-009). Every path marks the header
`EXECUTED` last. A single-lesson cancel writes its header, its line and the booking delete
in one transaction with both already `EXECUTED`, so the header arrives as an `INSERT` with no
old image and matches the filter at once. The message goes to the client or to the coach,
routed by `cancelledBy` as ADR-009 decision 9 already specifies.

#### Recovering from failure — 5g to 5k

*Added 2026-09-30, decided by the owner.* 5a–5f make the schedule-change consumer safe to
retry. They left four gaps: a retry could start a second batch, a crash while writing the
plan left an incomplete one, a plan could act on a world that had changed, and nothing
covered a consumer that fails for good or an event that is lost. These close them.

**5g. Every key comes from the triggering event.** The batch ID comes from the stream record's
event ID (5a), and the timestamp in the header key `CHANGEBATCH#<timestamp>#<batchId>` comes
from the stream record's creation time — never the clock. Every `CANCELLED#` and `REPRICED#`
key is built from those two values plus ~~the booking ID~~ *the seat key (ADR-031 decision 2,
2026-10-13)*. A retry therefore produces
identical keys: it can only resume, never start a second batch beside the first.

**5h. The header records when the plan is complete.** The header carries **`planStatus`**:
`WRITING` when created, `COMPLETE` once every record of the plan is written. **No booking is
touched until the plan is `COMPLETE`.** A resume that finds `WRITING` re-runs the evaluator
and writes each record only if its key does not exist yet — the records the first attempt
wrote are refused harmlessly, the ones it never reached are added — then sets `COMPLETE`.
Safe because nothing has been carried out yet, so the evaluator sees the same bookings,
less any a family has changed in the meantime.

**5i. Every record is re-checked before it is carried out.** A plan record says what a
booking needed *when the plan was written*. The app keeps running during a crash-and-resume
gap — families book and cancel, coaches check students in, the coach may edit the schedule
again — so before carrying out any `PLANNED` record, whether in a normal retry or a reconcile
(5j), the consumer re-checks it against **the current schedule and the current booking**, and
acts only if the change is still needed. *ADR-031 decision 11 (2026-10-13): "the current
booking" is now the current lesson time and its seats. A remove line whose lesson time is no
longer `OPEN` — a family booked it after the preview — becomes a cancel, not a skip.* Otherwise the record is marked `SKIPPED`, with
**`skippedReason`**:

| `skippedReason` | Meaning |
|---|---|
| `BOOKING_GONE` | The booking no longer exists — most likely the family cancelled it, which produced its own record and message |
| `NO_LONGER_NEEDED` | The current schedule no longer calls for the change — the coach restored the slot, or set a different price in a later batch |
| `LESSON_PASSED` | The lesson's time passed before the change could be applied |

Re-checking against the current schedule, not merely the booking's old values, is what makes
**two batches in flight** safe: a stuck batch planning $50→$60 resumes after a later batch
has set $55, finds the schedule now says $55, and skips — the coach's latest intent wins. It
also closes this ADR's open *plan drift* item.

**`LESSON_PASSED` is the one outcome that is not fully recoverable.** A cancellation stuck
until after the lesson's time means the family was not told and may have turned up. The
resume cannot cancel a past lesson (ADR-009 decision 7), so the notifier instead **tells the
coach**, in the batch's notification: *"These lessons were due to be cancelled, but their
time passed before the cancellation could be applied."* The coach can waive them and follow
up. This is why a stuck batch pages (5k): every other case heals itself on resume; this one
worsens with time.

**5j. When retries run out: page, then reconcile — no redrive.**

- **The schedule-change consumer's dead-letter queue pages** (added to decision 4's list).
  Unfinished cancellations mean families may turn up for lessons the coach no longer
  teaches — as serious as the notifier failing.
- **The queued message is not redriven.** Once the fault is fixed, the owner runs the
  **reconcile command** for the coach the message names. The message only has to say which
  coach.

```
reconcile-schedule --coach <coachId> [--dry-run]
```

It invokes `consumer-schedule-change` directly with a reconcile request — same code, same
role — and runs in two stages:

1. **Finish unfinished batches.** Every one of the coach's batches whose header is not
   `EXECUTED` is completed: the plan filled in if `WRITING` (5h), each remaining `PLANNED`
   record re-checked and carried out (5i), then the header marked `EXECUTED` so the notifier
   tells the families. This stage comes first because a batch that died partway may already
   have cancelled lessons without anyone being told — and a fresh check would never find
   them, since they are already gone.
2. **Check for anything else.** ~~The evaluator runs against the coach's current schedule and
   all their upcoming bookings.~~ *Replaced by ADR-031 decision 11 (2026-10-13): the evaluator
   compares the lesson times the coach's current schedule produces with the stored lesson
   times and their seats.* Anything that does not match becomes a new batch with
   **`batchSource = RECONCILE`**. If everything matches, nothing is written and nobody is emailed.

**`--dry-run`** prints what both stages would do and changes nothing. The command is
**operator-only** for MVP, and safe to run at any time: a second run finds nothing to do. It
is also the recovery for an event lost outright — the stream holds records for 24 hours, and
a delivery outage longer than that drops `ScheduleChanged` with nothing left to retry.

~~*Dependency:* stage 2's re-pricing waits on the same question as ADR-020 itself — whether a
coach can hand-edit one booking's price. Until that is settled, a reconcile could overwrite a
hand-edited price. Cancellations do not depend on it.~~ *Settled 2026-10-13 (owner, ADR-031):
per-lesson price editing is removed, so a reconcile has no hand-set price to overwrite.*

**5k. A nightly drift check alerts, and fixes nothing.** A new scheduled function,
**`sched-drift-check`**, runs the reconcile's checks in dry-run form every night — **read-only**,
with no ability to change anything.

- **Which coaches:** those with lessons in the **next 30 days** (confirmed by the owner,
  2026-09-30), found by reading
  the date index (GSI2) one day at a time. There is no "every coach" query, and this is where
  drift can hurt soonest; drift further out is caught as its dates come into the window, or
  by the coach's next schedule save.
- **What it looks at:** each such coach's recent batch headers, for any not `EXECUTED`; and
  the evaluator's verdict on their ~~upcoming bookings~~ *stored lesson times and seats (ADR-031,
  2026-10-13)* in the window.
- **What it does:**

| Finding | Response |
|---|---|
| A batch unfinished for **more than an hour** | **Page** |
| Any lesson that should have been **cancelled** and was not | **Page** — families could turn up |
| Only **re-prices** outstanding | Morning dashboard — nobody is inconvenienced |

It is the only thing that catches a silently lost event — the failure this ADR's Context
describes: no error, nothing retrying. Being read-only, a bug in it can raise a false alarm
but never cancel a lesson.

**5l. The coach sees whether a schedule change has finished.** *Decided by the owner,
2026-09-30 — in MVP.* After Accept the coach website says "saved", but the cancellations,
re-prices and messages happen in the background. If that stalls, the coach would believe
families had been told when they had not. So the schedule page shows the latest change
batch's state, read from its header (access pattern 14, which `api-coach` already has):

| Header state | The coach sees |
|---|---|
| Not `EXECUTED`, under an hour old | *"Applying your changes to 14 lessons…"* |
| `EXECUTED`, families not all told yet | *"Changes applied. Emailing 6 families…"* |
| `EXECUTED`, every line notified | *"Done — 6 families emailed."* |
| Not `EXECUTED`, **over an hour old** — the same threshold the drift check pages on | *"We're having trouble applying this change. We've been alerted, and your families haven't been notified yet."* |
| Any line `SKIPPED` as `LESSON_PASSED` | The lessons listed, with a prompt to waive them and contact the families — the same information the coach is emailed (5i) |

The page refreshes the state while a change is applying. The rinkside app may show a
one-line status for its own cancellations, but need not: a single cancellation finishes in
seconds.

### 6. The CDC path needs its own watch

Per-consumer DLQs protect consumers. They do **not** protect the path upstream of all of
them: DynamoDB Streams → EventBridge Pipe → bus.

If that Pipe stalls, no consumer is ever invoked. No consumer DLQ fills. No consumer alarm
fires. Every write still succeeds and every API call still returns 201, so the system looks
healthy while sending no confirmations, no payment reminders and no cancellation notices at
all.

It is the single point of failure for every notification in the product. The signal is
**stream iterator age**, and the Pipe needs its own failure destination.

### 7. Point-in-Time Recovery (PITR) is on, and the table is protected from deletion

*Decided by the owner, 2026-08-28.* Previously an omission rather than a decision.

**Point-in-Time Recovery (PITR) is enabled on the main table from the first deploy.** It
continuously captures changes and allows a restore to any single second within a window of
up to 35 days. Cost is billed on table size — a few megabytes here, so cents per month, and
the cheapest reliability the project can buy.

The reason it matters is specific rather than general: **BladeBook has a consumer whose job
is to delete bookings in bulk.** A wrong conflict test or a wrong date range in the
schedule-change cancellation consumer could destroy a coach's entire term in one run.
Decision 5 makes that consumer safe to *retry*; nothing makes it safe to be *wrong*.
Point-in-Time Recovery is the only thing that would get the data back, and it needs to exist
before that code is written rather than after the first incident.

**Two things travel with it, because Point-in-Time Recovery alone does not survive the most
likely accident:**

- **Deletion protection on the table.** ADR-001 has `cdk deploy` running straight to
  production with no staging environment. A `RemovalPolicy` mistake, or a destroy against
  the wrong stack, removes the table itself — and a recovery feature attached to a table is
  weak protection against losing the table. DynamoDB's deletion protection is a separate
  flag and costs nothing.
- **`RemovalPolicy.RETAIN` on the table**, stated explicitly in the stack rather than
  inherited. The default varies by construct, and inheriting the wrong one is exactly the
  class of mistake that shows up once.

**Restore is a runbook, not a button.** DynamoDB restores to a **new** table, never in
place. Recovering therefore means restore → verify → repoint the application or copy rows
back, under time pressure, on a day something has already gone wrong. No such runbook
exists — see Open.

*This also satisfies a `cdk-nag` rule.* ADR-001 decision 2 already runs the AwsSolutions
pack as a build gate, and it flags DynamoDB tables without Point-in-Time Recovery. Once the
flag is in the stack, continuous integration (CI) enforces it rather than anyone having to
remember.

---

## Explicitly not doing

Recorded so nobody relitigates them at 11pm:

- **No multi-region.** The worst failure is a wasted trip to a rink.
- ~~No staging environment.~~ **Superseded by
  [ADR-011](ADR-011-staging-environment.md)** — 2026-08-28. There is one, loaded from
  production with all personally identifiable information (PII) masked before it arrives.
  *Restated 2026-10-07 by [ADR-027](ADR-027-on-demand-dev-environment.md):* no long-running staging after all; a dev stack is built on
  demand, with the same masking when production data is loaded.
- **No uptime SLA.** There is no customer contract and nobody to page but the owner.
- **No synthetic canary for the *booking* path.** Its tolerance is hours; a real client will
  report it sooner than a canary would justify its cost.

  *Qualified 2026-08-30:* there **is** now one for the **cancellation** path.
  [ADR-013](ADR-013-testing-requirement.md) decision 3c's second Playwright flow — save a
  schedule change that cancels bookings — runs on a schedule against production, as a
  dedicated test coach and family (*amended 2026-10-07 by ADR-027 decision 7*). That path is
  page-worthy where booking is not, and it is the only check that catches the
  change-data-capture path stalling, since every write still succeeds while it does.

---

## Consequences

**Easier.** Reliability work now has a stated reason to stop. Four things page; everything
else can wait until morning. A uniform DLQ-and-guard rule removes a per-consumer judgment
call from every future addition.

**Harder.** Four consumers need idempotency guards built, and the schedule-change consumer
needs a genuine redesign — write-ahead plan, derived batch id, per-booking transactions. It
is the most intricate piece of backend work in the project and it did not look like it.

**The dead man's switch is the unfamiliar part.** `treatMissingData: breaching` is a setting
people get wrong, and getting it wrong produces an alarm that can never fire — which is
worse than no alarm, because it looks like coverage.

---

## Open

- ~~The report cannot be re-run for a past date.~~ **Settled 2026-09-30 by decision 2a:** the
  job's trigger carries its date, and `redrive-dlq` re-runs a failed date.
- **There is no restore runbook.** Decision 7 turns Point-in-Time Recovery (PITR) on, but a
  restore lands in a *new* table, so recovering means restore → verify → repoint or copy
  back. Nobody has written down which, or how the application is repointed. The moment it
  is needed is the worst moment to be working it out. *Decided 2026-10-12 by the owner:*
  **copy back by default**; repoint only for total loss. The runbook pauses notifications
  during a restore and re-applies the erased-ID list. Still to be written (`Open-Pending.md`
  §10).
- ~~**Nothing covers retention beyond 35 days.**~~ Point-in-Time Recovery's window is a ceiling,
  so slow corruption noticed in month two is unrecoverable. **Settled 2026-10-12 by the
  owner:** a monthly DynamoDB export to S3, triggered by EventBridge Scheduler, stored in S3
  Glacier Instant Retrieval and deleted after 12 months (interim, for the legal review).
  Revisit Deep Archive for older exports if the table grows to tens of GB. Details in
  `Open-Pending.md` §10.
- **Alert SMS shares Simple Notification Service (SNS) with client SMS.** A suppression list or sending problem on the app
  path could silence alerts. Alerts should at minimum use a separate topic and configuration
  set. Whether operational SMS to the owner's own number needs 10DLC registration (ADR-007)
  is unconfirmed.
- **Who drains a dead-letter queue, and is there a redrive path?** Decided that queues exist; not decided
  what happens when one fills. **Settled 2026-09-30:** decision 2a for every consumer, and 5j
  for the schedule-change consumer. The owner drains them, with `redrive-dlq` or the reconcile
  command.
- ~~The plan can drift from reality.~~ **Closed 2026-09-30 by 5i:** every record is re-checked
  against the current schedule and booking before it is carried out, and a reconcile's second
  stage catches anything the plan missed.

---

## Revisit if

- A payment processor lands. Money moving changes every tolerance in the table, and "no
  staging environment" stops being defensible.
- Volume reaches the point where a schedule change cancels enough bookings to exceed a
  15-minute Lambda. The write-ahead plan makes that survivable rather than fatal, but a step
  function or a chunked driver becomes the honest answer.
- A coach starts relying on the daily report for billing or tax records — its tolerance
  moves from "a day" to something much stricter, and the re-run gap above becomes urgent.
- SES suspends sending even once. That converts the bounce-rate alarm from a precaution into
  a post-mortem action item.
