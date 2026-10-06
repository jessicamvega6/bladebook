# Runbook: Reconcile a Coach's Schedule

**Status:** Draft, 2026-09-30. Written before the command exists; the command, its output and
the alert wording will be filled in when they are built.
**Source:** [ADR-010](../adr/ADR-010-availability-and-reliability.md) decisions 5g–5l and 2a.

---

## When to use this

You have been paged for one of these:

| Page | What it means |
|---|---|
| **Schedule-change consumer's dead-letter queue has a message** | A schedule change or coach cancellation failed every retry. Some of its lessons may be cancelled or re-priced, and the families not told. |
| **Drift check: a change batch unfinished for over an hour** | A batch started and has not finished. Same risk as above. |
| **Drift check: a lesson that should have been cancelled was not** | The coach's schedule no longer offers a lesson that is still booked — most likely an event was lost. The family may turn up. |

A drift-check dashboard entry for **re-prices only** uses the same steps, without the urgency.

**Don't** redrive the schedule-change consumer's dead-letter queue (`redrive-dlq` refuses it),
delete a stuck batch header, or edit bookings by hand. The reconcile command finishes stuck
work safely; any of those would leave families untold or bookings inconsistent.

---

## Steps

### 1. Find the coach
The page names the coach ID. For a dead-letter message, the message itself names it.

### 2. Find and fix the cause
Read `consumer-schedule-change`'s logs around the time of the failure. Common causes:

- a code defect — fix and deploy before going further, or the reconcile fails the same way;
- a throttle or service outage — confirm it has cleared;
- a lost event (the stream delivery was down for over 24 hours) — nothing to fix; the
  reconcile is the recovery.

### 3. Dry run
```
reconcile-schedule --coach <coachId> --dry-run
```
It changes nothing and reports two stages:

- **Stage 1 — unfinished batches:** each batch it would finish, and what remains in it.
- **Stage 2 — anything else:** cancellations and re-prices the current schedule calls for
  that no batch covers.

Read it. It should match what you would expect from the coach's recent schedule changes. If
it proposes cancelling a lot of lessons you cannot explain, **stop** — the evaluator or the
schedule may be wrong, and applying it would cancel lessons for real.

*Optional, for anything unclear:* reproduce it in staging first with
`refresh-staging --coaches <coachId> --as-of "<time just before the failure>"`
(ADR-011 decision 8a), then dry-run there.

### 4. Check for lessons whose time has passed
Records marked **`LESSON_PASSED`** are lessons that were due to be cancelled but whose time
passed first. The family was never told and may have turned up. The coach is emailed about
them automatically when the batch finishes. Decide whether you also contact the coach
yourself — usually yes, if the list is not empty.

### 5. Run it
```
reconcile-schedule --coach <coachId>
```
Stage 1 finishes the stuck batches — the notifier then tells the families. Stage 2 applies
anything else, as a new batch with `batchSource = RECONCILE`.

If the command itself fails partway, run it again: it resumes (ADR-010 decisions 5g–5i).

### 6. Confirm
- Run the **dry run again**. It should report nothing to do.
- On the coach website the change shows **"Done — N families emailed"** (decision 5l).
- The next night's drift check is clean for this coach.

### 7. Record what happened
A short note: the page, the cause, what the reconcile did, any `LESSON_PASSED` lessons and
who was contacted. If the cause was a defect, link the fix.

---

## If the reconcile itself was wrong

If a reconcile cancelled lessons it should not have, the cancelled bookings are recoverable
from Point-in-Time Recovery for 35 days (ADR-010 decision 7). That is the restore runbook —
**still to be written** (see `Open-Pending.md`).

---

## Known limitation

Until the question of hand-edited booking prices is settled (ADR-020 Open, *Items to Ask Kim
About* §5), stage 2's **re-pricing** could overwrite a price a coach set by hand. Cancellations
are unaffected.
