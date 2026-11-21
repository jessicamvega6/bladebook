# ADR-018: A Reminder to the Coach About Lessons Left Unpaid

## Status

**Accepted** — 2026-09-30. ~~**The threshold is not yet set**; the job ships switched off and
starts sending once it is.~~ *The threshold is 7 days (owner, 2026-11-12; see the amendment
below).*

Answers [ADR-017](ADR-017-data-retention-ttl-and-archive.md)'s open question about lessons
that never expire. Adds a third scheduled job — `architecture.md` §8 has said since ADR-006
that there are only two — and an eleventh Lambda function.

**Amended — 2026-10-13.** *Decided by the owner.* [ADR-031](ADR-031-lessons-and-seats.md)
replaces the booking with a **lesson time** and a **seat** for each skater. The unpaid list now
comes from **seats**: GSI3 is written on a seat while it is `UNPAID` (ADR-031 decision 2), so a
shared lesson gives one entry per skater, each with its own share. `settleReminderSentOn` is on
the seat. The rest of this ADR is unchanged. *Revised 2026-10-13 (ADR-031 revision): a seat no longer stores `shareMinor`. ~~Each entry
shows the seat's `amountMinor`, fixed at check-in or a no-show. A seat with **attendance not
recorded** gets its `amountMinor` from the 9pm report job, which fixes it for any of that day's
seats still without one. So every past seat in the list has an amount (ADR-031 decision 7).~~*
*Revised 2026-10-13: no amount is copied onto a seat; it's worked out from the lesson time (ADR-031 d7).* *Each entry shows the skater's share, worked out from the seat's lesson time
(`priceMinor ÷ shareCount`, odd cents by `joinOrder`). The 9pm report job writes nothing.*

**Amended — 2026-11-12.** *Decided by the owner (implementation plan, R10a and Batch 13).*
- **The threshold is 7 days** (decision 2).
- **A lesson is listed every Monday until it is marked paid or waived**, not once (decision 3).
  `settleReminderSentOn` stays, but now holds the Monday the seat was last listed, and the guard
  skips a seat already stamped with *this* Monday's date. That keeps a re-run idempotent.
- **Weekly, on Monday morning** stands; listing every week settles the cadence.
- **The email's wording** is the one in `FeatureDecriptions/Email templates Needed:`, "Unpaid
  lessons", with the time on each line, no-shows labelled and *attendance not recorded* where it
  applies.

---

## Context

ADR-017 sets a booking's expiry only when it is **settled** — marked paid or waived — so
that a debt can never quietly vanish from the coach's dashboard. The cost is that a lesson
nobody settles stays in the table forever: one the coach checked in and never marked paid,
one they never recorded at all, or a no-show they never dealt with.

*Decided by the owner, 2026-09-30:* **settling is the coach's job**, and the system does not
treat an unpaid lesson as abandoned after any period. But the system should not leave the
coach to remember either. So after a set time, it tells them.

---

## Decision

### 1. A weekly job emails each coach their long-unpaid lessons

A new scheduled function, **`sched-unpaid-reminder`**, runs **weekly** — Monday morning in
the launch timezone, by the same single Scheduler rule pattern as the other two jobs
(ADR-001 decision 4). *Weekly is proposed; confirm.* *Confirmed 2026-11-12.*

It finds every **past** lesson still `UNPAID` whose date is older than the threshold, and
sends **one email per coach** listing them. What the email says and how each line is labelled
is product content — see `FeatureDecriptions/Email templates Needed:` ("Unpaid lessons").

- **One email per coach, not per lesson** — the same reasoning as ADR-006 decision 6: one
  decision to act on, not a mailbox flood.
- **It goes to the coach's `loginEmail`**, the address Cognito verified (ADR-016 decision 4),
  not the `businessEmail` clients reply to.
- **It covers every unpaid past lesson**, whatever its attendance status — including
  no-shows and seats with no recorded outcome. A no-show is charged the lesson's
  `missedLessonFeeMinor`, which is `0` in MVP, but it still stays `UNPAID` until the coach marks
  it paid or waived (ADR-015 decision 4, amended 2026-09-30), so it stays in GSI3 and the query
  must not filter on attendance. *Corrected 2026-09-30: this line first said a no-show "is not charged" in MVP,
  which misstated the rule.* *Note — 2026-11-12: the missed-lesson fee is an extra charge (Phase 2). The amount the
  email lists for a no-show is what that skater owes for the lesson, its share of the price (ADR-015 decision 4;
  owner, R10c).*

### 2. The threshold is configuration, and unset means off

The threshold — how long after the lesson date before a lesson is included — is held in
Parameter Store. ~~**To be decided by the owner.**~~ *Set by the owner 2026-11-12: **7 days**.* Until it has a value the job runs, finds
nothing to do, and sends nothing. Setting it needs no deployment.

### 3. ~~Each lesson is included once~~ Each lesson is listed every Monday until settled *(2026-11-12)*

A ~~booking~~ gains **`settleReminderSentOn`**, stamped when a digest that listed it is sent.
*Replaced by ADR-031 decision 2 (2026-10-13): the **seat** carries it.*
The job skips any lesson already stamped *with this run's Monday (2026-11-12)* — the idempotency guard ADR-010 decision 2 requires
of every scheduled job, keyed like `remindedOn`.

~~**So a coach hears about each lesson once, when it crosses the threshold** — not every week
forever. Whether an unsettled lesson should be listed again later is left open.~~
*Replaced 2026-11-12 by the owner: **a lesson is listed every Monday until it is marked paid or
waived.** The stamp holds the Monday it was last listed, and the job skips only a seat already
stamped with this run's Monday (the date the Scheduler trigger carries), so a re-run sends nothing
twice.*

Marking a lesson paid or waived removes it from the unpaid index (ADR-003 decision 5), so a
settled lesson can never appear. Its stamp is harmless and expires with the ~~booking~~ seat
under ADR-017.

### 4. The job reads the sparse unpaid index across coaches

GSI3 holds **only unpaid items** (ADR-003 decision 5), so it stays small by construction.
The job **scans GSI3** — every coach's unpaid items — filtered to lesson dates before the
cutoff, and groups them by coach. Scanning is normally something to avoid; on an index that
contains only outstanding debts it is the cheapest possible read.

This is a **cross-tenant read**, like GSI2's. It is held by a scheduled job and by nothing a
person can call, which keeps ADR-001 amendment A6's observation true in general form: **only
scheduled jobs read across coaches.**

Phase 2 needs no change: chargeable late-cancellation lines join GSI3 while unpaid (ADR-015
decision 4), so they are picked up automatically; the digest must be able to tell them apart
from lessons (how they are labelled — see `FeatureDecriptions/Email templates Needed:`, "Unpaid
lessons").

### 5. Operational fit

- **Role** (ADR-001 amendment A6's format): `Scan` on GSI3; `GetItem` on coach profiles and
  student names; `UpdateItem` on ~~bookings~~ seats (*ADR-031, 2026-10-13*) for the guard; `ses:SendEmail`. No GSI1 or GSI2, no
  SMS, no S3.
- **GSI3 projects what the digest needs** — date, start time, student, amount, status and
  `settleReminderSentOn` — so most of the work is one scan. *Note — 2026-10-13: on a seat the
  amount is its ~~`shareMinor`~~ ~~`amountMinor`~~ share (ADR-031 decision 7).* *Revised 2026-10-13
  (ADR-031 revision): ~~`amountMinor` is fixed on the seat at check-in or a no-show.~~* *Revised 2026-10-13: no amount is copied onto a seat; it's worked out from the lesson time (ADR-031 d7).*
  *GSI3 carries no amount, so the digest reads each listed seat's lesson time (`priceMinor`,
  `shareCount`, `joinOrder`) to work the share out.*
- **Access logging** (ADR-012 decision 3): one aggregate line per run — *"read 12 unpaid
  lessons across 3 coaches."*
- **Reliability** (ADR-010): a dead-letter queue and the dead man's switch like the other
  jobs. Tolerance is **a week** — a missed run means a coach hears a week late — so it is a
  morning-dashboard alarm, not a page.
- **A crash between sending and stamping** re-sends that coach's digest on the next run. The
  day-of reminder accepts the same window; a duplicate reminder to a coach is harmless.

---

## Consequences

- **§8 gains a third scheduled job**, and the design stops claiming there are only two.
- **An eleventh function**, small and framework-free, in the consumers artifact.
- **Unsettled lessons stop being invisible.** They still never expire, which is the point —
  but now someone is told.
- ~~**A coach who ignores the email is not told again**, under decision 3. That is deliberately
  gentle, and open below.~~ *2026-11-12: a lesson stays on every Monday's list until it is
  settled.*

---

## Open

- ~~**The threshold.** How long after a lesson before it is included. *Owner to decide.*~~
  *Settled 2026-11-12: 7 days.*
- ~~**Weekly, on Monday morning** — confirm the cadence.~~ *Settled 2026-11-12.*
- ~~**Should an unsettled lesson be listed again?** For example, a second reminder a month
  later, or a standing line in every weekly digest while anything is overdue.~~ *Settled
  2026-11-12: every Monday until settled.*

---

## Revisit if

- Coaches report the email as noise — the threshold is too short, or the list is dominated
  by no-shows they never intend to charge.
- Unsettled lessons keep accumulating despite the reminder, which argues for repeating it. *Repeating was adopted 2026-11-12.*
- Coaches in more than one timezone, at which point the weekly rule becomes one per timezone
  group like the other jobs (ADR-001 decision 4).
