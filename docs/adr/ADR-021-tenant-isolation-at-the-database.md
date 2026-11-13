# ADR-021: Tenant Isolation Enforced at the Database as Well as in Code

## Status

**Accepted** — 2026-10-01. **Building on it waits for the database-gate tests in decision 7.**

**Amended — 2026-10-01.** [ADR-022](ADR-022-client-isolation-at-the-database.md) extends this
to `api-client`, so decision 9's first bullet no longer holds, and decision 6's consumer also
mirrors `priceMinorOverride` onto the link item. Decision 5's `CODE#` item also carries the
coach's name, so the statement gains `UpdateItem` and two attributes.

**Reverses [ADR-014](ADR-014-check-in-app-and-offline-capture.md) decision 11a's second
point** — *"It cannot scope `api-checkin` to one coach either"* — for `api-checkin` and
`api-coach`. 11a's first point stands: IAM still cannot separate item types inside a
partition.

**Amends** [ADR-001](ADR-001-backend-stack.md) A5 and A6 (amendment A8: two tenant roles, a
thirteenth function, `api-coach` loses GSI1), [ADR-002](ADR-002-client-registration.md)
decisions 2 and 2b (the link item is written by a consumer),
[ADR-012](ADR-012-pii-access-logging.md) decision 1 (CloudTrail can now name the coach) and
[ADR-013](ADR-013-testing-requirement.md) decision 4 (a database-level isolation test).

**Amended — 2026-10-05.** [ADR-023](ADR-023-rinkside-check-in-joins-the-coach-website.md)
withdraws `api-checkin`, so decisions 1 and 2 cover `api-coach` and `coach-tenant` only.
There is no `checkin-tenant` role; check-in routes run under `coach-tenant`.

**Verified — 2026-10-05.** Decision 7's tests ran against a real table, using
[the gate-test runbook](../runbooks/database-gate-tests.md): **all eight rows pass**. Row 3,
the open one, came back as hoped: `LeadingKeys` on a GSI3 query is checked against the
index's own partition key, so GSI3 stays on `coach-tenant`. **Building on this ADR no longer
waits.** Results: [`runbooks/gate-results-20261005-174949.txt`](../runbooks/gate-results-20261005-174949.txt).

**Amended — 2026-10-06.** [ADR-025](ADR-025-many-coaches-per-skater.md) extends decision 6: `consumer-student-link` also maintains
`otherCoaches` (the names of a skater's other `ACTIVE` coaches) on each coach's `STUDENT#`
record. A copy, not a permission: no policy changes. *Phase 2 since 2026-10-07* (ADR-025
decision 4).

**Amended — 2026-10-08.** [ADR-027](ADR-027-on-demand-dev-environment.md): decision 7's tests
against a real table run in the on-demand dev stack (read "staging" as dev).
[ADR-026](ADR-026-shared-lessons-by-invitation.md): `StudentChanged` also triggers
`consumer-invite`.

**Note — 2026-10-13.** *Decided by the owner.* [ADR-031](ADR-031-lessons-and-seats.md)
rebuilds booking as **lesson times** and **seats**. What it means here:

- **New item prefixes, all in the coach's partition:** `LESSON#` (a stored lesson time),
  `SEAT#` (one skater's place in it) and `SEATEND#` (an invitation that ended). Cancelled seats
  become the existing `CANCELLED#` lines. All sit under `PK = COACH#<coachId>`, so
  `coach-tenant`'s `LeadingKeys` condition already covers them.
- **A new sparse index, GSI4**, keyed `GSI4PK = DUE` across every coach, holds seats with a
  pending deadline. It is cross-tenant, like GSI2. It is read by the hourly scheduled job
  `sched-deadline-sweep`, never by `coach-tenant`. *Revised 2026-10-13 (ADR-031 revision): it
  holds seats (`WARN`, `EXPIRE`) and lesson times with a pending leave (`ANSWER`).* *Revised
  2026-10-13 (option B): ~~seats also carry `INVITER_LEFT`~~ (ADR-031 decision 12). The sweep is the
  one function that can delete records in every coach's area.* *Revised 2026-10-13 (ADR-031 d5,
  d12): `INVITER_LEFT` sits on the **lesson time**, naming the invited seat, so lesson times carry
  `ANSWER` and `INVITER_LEFT` and seats carry `WARN` and `EXPIRE`.* *Corrected 2026-10-20: one of three functions whose execution role can delete in any coach's partition, with `consumer-schedule-change` and `consumer-student-link`.*
- **The coach's Accept** now turns every one of the accepted skater's `AWAITING_COACH` seats
  into `BOOKED`, in the coach's own partition and session, as ADR-026's automatic join did.
- **Decision 7's gate tests need new rows** for `LESSON#`, `SEAT#`, `SEATEND#` and GSI4
  (ADR-031 Consequences). They are not written yet.
- *Added 2026-10-13 (ADR-031 revision):* **`consumer-invite` writes read-only copies on
  seats**, in whichever coach's partition the lesson is: `partnerName`, `partnerStatus`,
  `invitedClientId` with the invited family's GSI1 keys, and `choiceAnswerBy`. It is a system
  function, like `consumer-student-link`, so its writes cross coaches. ~~Its role should allow
  updating only those attributes on `SEAT#` items (ADR-031 decision 14, Open).~~ ~~It also ends an
  invited seat as `WITHDRAWN` when the inviting family cancels (ADR-031 decision 5). The role
  isn't written yet.~~ *Revised 2026-10-13 (option B): the role is settled (ADR-031
  Consequences) — reads, plus `UpdateItem` limited by the `dynamodb:Attributes` condition to the
  key fields and `partnerName`, `partnerStatus`, `invitedClientId`, `GSI1PK`, `GSI1SK` and
  `choiceAnswerBy`; no `PutItem` or `DeleteItem`. The condition can't limit it to `SEAT#` items,
  but a lesson time has none of those fields. It never ends a seat: the inviting family's own
  cancel ends one still `INVITED`, and `sched-deadline-sweep` ends one already `AWAITING_COACH`
  (`INVITER_LEFT`, ADR-031 decision 5).* *Revised 2026-10-13 (ADR-031 d5, d12): the cancel records
  `INVITER_LEFT` on the lesson time, naming that seat, and never writes the seat itself.*

Decisions 1–9 are otherwise unchanged.

**Amended — 2026-10-20.** [ADR-033](ADR-033-invite-only-accepted-skaters.md): decision 7's gate tests gain rows (see ADR-022
decision 9, rows 12–13). Seats carry only `EXPIRE` deadlines and lesson times only `ANSWER`. The
coach's Accept no longer touches seats.

---

## Context

A coach must never see another coach's students, lessons, profile or schedule. Until now
that has been held **in code only**:

- `coachId` comes from the verified JWT claim, never the request body (§7);
- every key is built from it, so `PK = COACH#<coachId>` roots every coach read;
- ADR-012 decision 5a makes every PII-returning repository method demand an
  `AccessContext`, and an ArchUnit rule stops anything outside `core.data` touching
  `DynamoDbClient`;
- ADR-013's cross-tenant test asserts the result.

All four are good, and all four are the same kind of protection: they hold if the code is
right. The database itself would serve any coach's partition to any request, because
`api-coach` runs under one static execution role that serves every coach.
`dynamodb:LeadingKeys` — the condition that restricts a caller to partitions matching their
identity — compares against **the caller's credentials**, and those are the function's.

ADR-014 decision 11a recorded this and noted the way out in one sentence: *"Binding per
request would need an `AssumeRole` with session tags on every invocation."* This ADR takes
that way out.

The data model already fits. Every coach entity — profile, default and temporary schedules,
date overrides, students, bookings, holds, recurrence headers, change batches and their
lines — lives under `PK = COACH#<coachId>` (§5). *Since ADR-031 (2026-10-13), bookings and
holds are lesson times (`LESSON#`) and seats (`SEAT#`, `SEATEND#`), also in that partition.* GSI3 is keyed `GSI3PK = COACH#<coachId>`.
Only three things the coach API touches sit outside that partition: GSI1 (keyed by student),
the `CODE#` item, and the client's link item. Decisions 4–6 deal with each.

---

## Decision

### 1. Two gates, and both are required

*Decided by the owner, 2026-10-01.* Coach-facing data access is gated twice:

- **In code** — exactly as today. Nothing in the Context list above is removed or relaxed.
- **At the database** — the coach-facing API functions reach DynamoDB only with credentials
  that DynamoDB itself will refuse for any partition other than the caller's.

Neither is the backup for the other. The code gate is what makes the right query; the
database gate is what makes a wrong query fail rather than return data.

**Scope:** `api-coach` and `api-checkin`, the two functions a coach's token can reach. See
decision 9 for what stays code-only and why.

### 2. Per-request credentials from a tenant role, tagged with the coach

Each coach-facing function gets a **tenant role** alongside its execution role:

| Function | Execution role holds | Tenant role it assumes |
|---|---|---|
| `api-coach` | `sts:AssumeRole`, `sts:TagSession`, `sts:SetSourceIdentity` on `coach-tenant` — **and no DynamoDB actions at all** | `coach-tenant` |
| `api-checkin` | the same, on `checkin-tenant` — **and no DynamoDB actions at all** | `checkin-tenant` |

For each request, after the token is verified, the function assumes its tenant role with:

- **session tag** `coachId = <sub from the verified JWT>`;
- **source identity** `<sub>` and **session name** `coach-<sub>` (decision 8 is why);
- a one-hour session, the maximum when one role assumes another.

The tenant role's permission policy pins every request to the tagged coach's partition:

```json
{
  "Sid": "OwnPartitionOnly",
  "Effect": "Allow",
  "Action": ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:PutItem",
             "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:ConditionCheckItem"],
  "Resource": ["<table ARN>", "<table ARN>/index/GSI3"],
  "Condition": { "ForAllValues:StringEquals": {
    "dynamodb:LeadingKeys": ["COACH#${aws:PrincipalTag/coachId}"] } }
}
```

`checkin-tenant` is the same with ADR-014 decision 11's narrower actions and **no index
resource at all**. Transactions are authorised item by item against these actions, so a
`TransactWriteItems` with one item in another coach's partition is refused whole.

**The trust policy** on each tenant role admits only its own function's execution role, and
only when the request carries exactly one session tag key, `coachId`
(`aws:TagKeys` = `["coachId"]`, `aws:RequestTag/coachId` not null). An untagged session
cannot be created, so a missing tag fails the request rather than running unscoped.

**Why the execution role holds no DynamoDB permissions:** it is what makes the database
gate unavoidable rather than conventional. A handler that builds its own client from the
default credentials — routing round ADR-012's ArchUnit rule by reflection, a test helper
left in, a future dependency — gets `AccessDeniedException` on every call.

### 3. In code, the tenant client comes from the `AccessContext`

ADR-012 decision 5a already makes every PII-returning repository method take an
`AccessContext`, which carries the verified `coachId`. The repository in `core.data` now
obtains its `DynamoDbClient` **from** that context rather than from a shared singleton:

```java
// core.data — the only place a coach-path client is created
DynamoDbClient clientFor(AccessContext who)   // tenant credentials for who.coachId()
```

- **Credentials are cached per `coachId`** in each warm container and refreshed five minutes
  before they expire. A coach's first request on a container pays one STS call (typically
  20–50 ms in-region); every later request in that hour pays nothing.
- **The two gates now share one input.** The key the code builds and the tag the database
  checks both come from the same `AccessContext`, which is built once from the verified
  token. A bug that builds the wrong key is refused by the database; a bug that tags the
  wrong coach is the one remaining failure, and it lives in one method.
- **Local development** runs against DynamoDB Local, which ignores IAM entirely. A local
  mode returns an unscoped client, and **refuses to start unless the table endpoint is
  `localhost`**, so the switch cannot reach a real environment.

**Scale:** at the default STS request quota (around 600 per second per account per Region;
confirm against the current quota page) and with per-coach caching, neither the quota nor
the latency matters until coach traffic is many orders of magnitude above anything §1
anticipates.

### 4. `api-coach` stops using GSI1

GSI1 is keyed `STUDENT#<studentId>`, which a `LeadingKeys` condition on `COACH#` cannot
express. `api-coach` used it for one thing — *a student's unpaid lessons* (pattern 12). For
the coach, pattern 12 is now **GSI3, `GSI3PK = COACH#<coachId>`, filtered on `studentId`**.
GSI3 is sparse and holds only that coach's outstanding debts, so the filter reads a small set.

`api-client` keeps GSI1, under the code check §7 already describes.

### 5. The `CODE#` item gets a second, narrow statement

The coach code is written at signup and rotated later (ADR-002 decisions 2, 2a; ADR-016
decision 9). It lives at `PK = CODE#<coachCode>`, outside the coach's partition. The
`coach-tenant` role gets one more statement for it:

- `PutItem`, `UpdateItem`, `DeleteItem` and `ConditionCheckItem`, with `dynamodb:LeadingKeys`
  like `CODE#*`;
- `dynamodb:Attributes` limited to `PK`, `SK`, `coachId`, `coachFirstName`,
  `coachLastName` and `profilePhotoKey` (*added by ADR-022 decision 7 for the sign-up code
  screen, kept in step when the coach renames or changes their photo*), and `ReturnValues` limited to
  `NONE` — so the statement can neither read a code item back nor write anything else onto
  one;
- **no `GetItem` or `Query`** — the coach never needs to look a code up, only to claim one
  with `attribute_not_exists(PK)`.

**The residual risk, stated:** a bug could delete *another* coach's code item. That reads
nothing and exposes nothing; it stops new families registering with that coach until the
code is rotated. The attribute list must be kept in step with the `CODE#` item.

### 6. The client's link item is written by a stream consumer

*Decided by the owner, 2026-10-01.* Confirming a `PENDING` student (ADR-002 decision 2)
updates the client's link item, and declining one (decision 2b) deletes it. That item lives
at `PK = CLIENT#<sub>`, in the family's partition. `LeadingKeys` has no sort-key condition,
so no policy can say *"only the link items that point at this coach"* — a grant on `CLIENT#`
would cover the family's profile too, and a delete cannot be narrowed by attribute.

So **`api-coach` writes only the `STUDENT#` item**, and a new consumer keeps the link in
step:

- **`consumer-student-link`** — triggered by a new `StudentChanged` event, which the Pipe
  derives from a `STUDENT#` item under `COACH#` being modified (when `studentStatus`,
  `studentName` or — *added by ADR-022 decision 6* — `priceMinorOverride` changes *(Phase 2 since 2026-10-13)*) or removed.
- On modify it sets the changed fields on the link item, conditional on the link existing.
  On removal it deletes the link item. Both are idempotent by construction — setting a value
  twice or deleting twice has one effect — and ADR-010 decision 2's dead-letter queue applies.
- Its role: `UpdateItem` and `DeleteItem` on the table. No index, no other service.
- **It goes through the Pipe and bus, not a direct stream reader.** The stream already has
  two readers (the Pipe and ADR-017's archiver), and DynamoDB Streams throttles above two
  per shard.

**The lag is about a second, and it is always on the safe side.** `studentStatus` only ever
moves from `PENDING` to `ACTIVE`, or the student is deleted. While the link lags, it says
`PENDING` (the family cannot book yet) or still exists for a student who is gone (the
booking finds no student). The lag never lets a family do something early. **If a status
that withdraws access is ever added** — `INACTIVE`, say — the booking path must check the
authoritative `STUDENT#` item rather than the link, or this stops being true.

ADR-002 decision 2b's decline email needs the same removal. This consumer is its natural
home; whether it sends that email stays an open decision (`Open-Pending.md`).

### 7. Verify before building on it

The AWS documentation is silent on one point this design depends on, and DynamoDB Local
cannot test any of it. Before any coach-path code is written, tests against a real table
(staging) must show:

| # | Attempt, as coach A's tenant session | Expected |
|---|---|---|
| 1 | `GetItem` and `Query` on `COACH#A` | allowed |
| 2 | `GetItem`, `Query`, `PutItem`, `UpdateItem`, `DeleteItem` on `COACH#B` | `AccessDeniedException` |
| 3 | `Query` GSI3 with `GSI3PK = COACH#A`, then `COACH#B` | allowed, then denied |
| 4 | `TransactWriteItems` with one item under `COACH#A` and one under `COACH#B` | whole transaction denied |
| 5 | `TransactWriteItems` putting `COACH#A/PROFILE` and `CODE#X` | allowed |
| 6 | `PutItem` under `CLIENT#…`; `Query` on GSI1 or GSI2; `Scan` | denied |
| 7 | `AssumeRole` without the `coachId` tag, or with an extra tag key | refused by the trust policy |
| 8 | Any DynamoDB call with the execution role's own credentials | denied |

*Note — 2026-10-13: [ADR-031](ADR-031-lessons-and-seats.md) adds `LESSON#`, `SEAT#` and
`SEATEND#` items to the coach's partition and a cross-tenant index, GSI4. The table above needs
rows for them — at least that coach A's session reaches its own lesson times and seats but not
coach B's, and cannot query GSI4. They are to be written and run before building on ADR-031.*

**Row 3 is the open one:** whether `LeadingKeys` on an index query is evaluated against the
index's partition key. If it is not, GSI3 comes off `coach-tenant` and pattern 11 (the unpaid
list) is served from the main table by date range, filtered on `paymentStatus`, the way
pattern 12a already serves the dashboard. Nothing else in this ADR changes.

*Answered 2026-10-05:* **it is.** Coach A's tenant session could query GSI3 for `COACH#coach-a`
and was refused `COACH#coach-b`. GSI3 stays on `coach-tenant`; the fallback isn't needed.

### 8. CloudTrail can now name the coach

ADR-012 decision 1 says *"CloudTrail cannot identify which coach read anything"*, because
every read ran under the Lambda's execution role. For `api-coach` and `api-checkin` that is
no longer true: the session name `coach-<sub>` and source identity `<sub>` appear on every
CloudTrail data event those sessions produce.

Application logging stays primary. It records what was **returned** to whom, and it still
covers `api-client`, the consumers and the scheduled jobs, which keep their execution roles.
But for the coach path there is now a second record of who read what, written by AWS and not
by BladeBook's own code.

### 9. What stays code-only, and why

- **`api-client`.** *Superseded the same day by ADR-022, which gates it at the database
  too.* A client books into the coach's partition and reads availability from
  it (ADR-004 decision 1), and reads its own bookings through GSI1 by student. Neither fits
  a `LeadingKeys` condition on `CLIENT#`. The GSI1 link check in §7 remains the one boundary
  that is enforced only in code, and the one most worth testing and logging.
- **Consumers and scheduled jobs.** The scheduled jobs are cross-tenant by design (GSI2,
  the GSI3 scan). The consumers act on one coach's data per event, but several also write
  into `CLIENT#` partitions (ADR-007 decision 9's suppression write-back). None is reachable
  by a person's token. They keep their execution roles and A6's bounds.
- **Item types within a partition.** ADR-014 decision 11a's first point is unchanged: no
  sort-key condition exists, so `api-checkin`'s role still cannot stop a schedule write.
  Token scope and routing do that.

---

## Alternatives considered

- **Code-only, as before.** Rejected by the owner: it holds if the code is right, and the
  aim is something that holds when it is not.
- **A Cognito identity pool handing the browser its own DynamoDB credentials.** Gives the
  same `LeadingKeys` gate, but moves database access into the browser. It loses `core/`, the
  `AccessContext` logging of ADR-012 and every server-side invariant (the conflict test, the
  booking lock). Rejected.
- **One IAM role per coach.** Created at signup. Hits the account's IAM role quota, puts
  IAM writes on the signup path, and buys nothing over a session tag. Rejected.
- **A table per coach.** Real isolation, but GSI2 — the single cross-tenant query the
  scheduled jobs depend on, and the reason DynamoDB was chosen (§5) — would become a fan-out
  over every table. Rejected.
- **A narrow grant on `CLIENT#` for the link item.** `UpdateItem` can be narrowed to
  `studentStatus` and `studentName`, but `DeleteItem` cannot be narrowed at all, so the gate
  would let a coach-path bug delete any family's profile. Rejected by the owner in favour
  of decision 6.

---

## Consequences

**Gained.**

- A coach-path bug that builds the wrong key fails with `AccessDeniedException` instead of
  returning another coach's students, lessons, profile or schedule.
- A handler that bypasses `core.data` gets nothing, because its function's own role holds no
  DynamoDB permissions.
- CloudTrail names the coach on every coach-path data event (decision 8).

**Cost.**

- One STS call per coach per container per hour. That is 20–50 ms on a cache miss, and
  free.
- Two tenant roles, and a thirteenth function (`consumer-student-link`) with its own
  dead-letter queue.
- About a second of lag between a coach confirming or declining a student and the family's
  view showing it.
- A local-mode switch in `core.data`, guarded so it cannot reach a real table.
- The database gate cannot be tested in DynamoDB Local. Its tests run against real AWS
  (staging), and decision 7's tests come first.

---

## Open

- ~~**Decision 7's tests**, row 3 above all.~~ **Passed 2026-10-05.**
- ~~**Whether `consumer-student-link` also sends the decline email**~~ (ADR-002 decision 2b,
  `Open-Pending.md`). **Settled 2026-10-12 by the owner: yes.** It gains `ses:SendEmail` and
  a `GetItem` on the coach profile for the Reply-To. The email goes to the deleted
  `STUDENT#` item's `clientEmail`, so a removal's `StudentChanged` event must carry it.
- **Which IaC tool expresses the roles:** CDK (TypeScript), ADR-001 A4 resolved 2026-11-12.
  ~~Waits on ADR-001 A4's choice between CDK and Terraform.~~ Either way, an infrastructure test asserts that the `api-coach` and `api-checkin`
  execution roles hold no `dynamodb:` action.
