# ADR-022: Client Isolation Enforced at the Database as Well as in Code

## Status

**Accepted** — 2026-10-01. **Building on it waits for the client-gate tests in decision 9,
which run alongside ADR-021's.**

**Extends [ADR-021](ADR-021-tenant-isolation-at-the-database.md) to `api-client`**, which
ADR-021 decision 9 left code-only.

**Amends** [ADR-001](ADR-001-backend-stack.md) A6 (amendment A9: `api-client`'s roles,
including the `code-lookup` role for the step before sign-in),
[ADR-002](ADR-002-client-registration.md) (GSI1 keyed by client; the link carries the
student's price override), [ADR-006](ADR-006-open-booking-recurring-lessons-and-cancellation.md)
decisions 3 and 4 (retry attribution without `ALL_OLD`), [ADR-009](ADR-009-cancellation.md)
decision 4c (where the recurrence header lives), [ADR-012](ADR-012-pii-access-logging.md)
decision 1, [ADR-013](ADR-013-testing-requirement.md) decision 4,
[ADR-016](ADR-016-coach-signup.md) decision 7a and ADR-021 decision 6 (one more mirrored
field).

**Verified — 2026-10-05.** Decision 9's tests ran against a real table, using
[the gate-test runbook](../runbooks/database-gate-tests.md): **every row passes.** Row 1 on
GSI1 came back as hoped: the index is locked to the family, so bookings need no copy under
`CLIENT#`. **Building on this ADR no longer waits.**

**Amended — 2026-10-05.** Decision **8**'s *"there is no IAM condition key for it"* was wrong in
effect: row 9, confirmed on a second run with a control ([`runbooks/gate-results-20261005-175359.txt`](../runbooks/gate-results-20261005-175359.txt)), shows the
`client-tenant` policy **refuses** a failed write that asks for `ALL_OLD`. The database blocks
the leak; the ArchUnit rule stays as a second guard. Results: [`runbooks/gate-results-20261005-174949.txt`](../runbooks/gate-results-20261005-174949.txt).

**Amended — 2026-10-05.** [ADR-024](ADR-024-client-write-link-check.md) settles how decision 8's code-level link check is enforced:
new writes take a `LinkedSkater` that only `core.data` can create after checking the family's
links, and writes to an existing item carry a `clientId = :caller` condition, so DynamoDB
refuses a write to another family's booking. An ArchUnit rule holds both in place.

**Amended — 2026-10-06.** [ADR-025](ADR-025-many-coaches-per-skater.md) relaxes the one-coach rule, so decision 2's `coachId` is the
coach the request is about, chosen from the family's links, and `linkStatus` is per coach
(`ACTIVE` if any of the family's skaters is `ACTIVE` with that coach). No policy changes.

**Amended — 2026-10-06.** [ADR-026](ADR-026-shared-lessons-by-invitation.md) adds one read statement to `client-tenant`: `GetItem` on
`SKATERCODE#*`, limited to a skater's display name. Decision 9's gate tests gain rows for it.
---

## Context

A client — an adult student or a minor's parent or guardian — must be able to:

1. see **only the students connected to them**;
2. see **their coach's schedule** — free and taken times, never who holds a taken one (§7);
3. **book only with their coach**.

Today all three are held in code. `clientId` comes from the verified token, client reads are
rooted at `CLIENT#<sub>`, and §7 names the one check that is not even structural: GSI1 is
keyed `STUDENT#<studentId>`, so **anyone holding a student id could read that student's
bookings** unless code checks the id against the caller's links first.

ADR-021's mechanism — a role assumed per request, tagged with who is asking, whose policy
only matches that caller's partition — cannot be copied across unchanged. The client is
not confined to one partition:

| What the client does | Where it lives |
|---|---|
| Profile, links to their students | `CLIENT#<sub>` — their own partition |
| Their own bookings | GSI1, keyed by **student** |
| Their coach's schedule and taken slots, for availability | `COACH#<coachId>` — **the coach's** partition, which also holds every other family's students and bookings |
| Booking, registration, cancellation, profile fan-out | **Writes** into `COACH#<coachId>` |
| Recurrence headers | `COACH#<coachId>`, found by filtering on `clientId` |

So a client role needs some access to the coach's partition, and `LeadingKeys` cannot say
*"only this family's items in it"* because there is no sort-key condition. This ADR splits
the problem: **reads** of the coach's partition are limited by *which attributes* can be
returned; the client's **own** data moves to where a partition-key condition can protect it.
**Writes** into the coach's partition can be limited to the right coach but not to the
family's own items, and decision 8 says so plainly.

---

## Decision

### 1. Two gates for clients too

*Decided by the owner, 2026-10-01.* `api-client` gets the same treatment as `api-coach`:
its execution role holds **no DynamoDB actions**, and every request runs under a
`client-tenant` role assumed per request and tagged with who is asking. The code gate —
`clientId` from the verified token, the link check, ADR-012's `AccessContext` — stays.

### 2. Three tags, and where each value comes from

| Tag | Value | Source |
|---|---|---|
| `clientId` | the caller's Cognito `sub` | the verified token |
| `coachId` | the client's coach | the client's own link items (`CLIENT#<sub>/STUDENT#<coachId>#…`), read under the client's own partition — or, at registration only, the `CODE#` item the client just entered |
| `linkStatus` | `ACTIVE` if any of the client's students is `ACTIVE`, otherwise `PENDING` | the same link items |

A client has one coach in MVP (ADR-002 decision 5). If that is relaxed, `coachId` becomes
*the coach this request is about*, chosen from the links.

**Two sessions per request, both cached.** The first carries only `clientId` and can read
nothing but the client's own partition (and `CODE#` items, decision 7). It reads the links,
which gives `coachId` and `linkStatus`. The second carries all three tags and does the work.
Both are cached per container, the second keyed by all three tag values. A coach confirming a
student therefore changes `linkStatus` and selects a new session on the next request, rather
than waiting out the old one.

**In code, `coachId` can only come from a link item or a resolved code.** The method that
assumes the second session takes a `LinkedCoach` value, which `core.data` constructs only from
those two reads. A coach id from a request body cannot reach it. As in ADR-021, the database
then refuses anything outside what that method chose.

### 3. The client's own partition: full access

```json
{ "Sid": "OwnClientPartition",
  "Action": ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:PutItem",
             "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:ConditionCheckItem"],
  "Resource": "<table ARN>",
  "Condition": { "ForAllValues:StringEquals": {
    "dynamodb:LeadingKeys": ["CLIENT#${aws:PrincipalTag/clientId}"] } } }
```

Profile, links and — after decision 5 — recurrence headers. **Requirement 1 is met here:**
the client's students are the link items in their own partition, and no other client's
partition can be named.

### 4. GSI1 is re-keyed by client

`GSI1PK = CLIENT#<clientId>`, `GSI1SK = BOOKING#<date>#<startTime>`. Bookings gain a
`clientId` attribute, written with the rest of the booking. The client's GSI1 statement has
the same `LeadingKeys` condition as decision 3, on the index ARN.

- **The one non-structural check in §7 becomes structural for reads.** A client can no
  longer name another family's bookings by guessing or learning a student id; the key is
  their own `sub`.
- Patterns 6, 12 (client), 16 and 20 become one query instead of one per student, filtered
  on `studentId` where they need one student. ADR-002's *"query links, then GSI1 per
  student"* goes away.
- Nothing else reads GSI1. ADR-021 decision 4 removed it from `api-coach`, and no consumer or
  scheduled job holds it. `COACH_HELD` bookings write no GSI keys, as before.

### 5. Recurrence headers move to the client's partition

`PK = CLIENT#<clientId>`, `SK = RECURRENCE#<coachId>#<recurrenceId>`. Attributes unchanged.

Only the client ever reads or writes a header: it is written with the occurrences
(ADR-006 decision 4a), rebuilt by repair when bookings load (decision 4b), and changed by
recurrence management (ADR-009 decision 4). No coach-side function or consumer touches it.
Pattern 21 becomes `Query PK = CLIENT#<sub>, begins_with(SK, "RECURRENCE#")` with no filter,
and another family's arrangements are no longer stored next to this one's.

### 6. The coach's partition: reads limited to an attribute allowlist, and only once confirmed

*Decided by the owner, 2026-10-01:* **a `PENDING` family sees nothing of the coach's** — no
schedule, no availability, no profile — only their own account: their profile, their
skaters and which coach they are waiting on. So the read statement below applies **only
when `aws:PrincipalTag/linkStatus` is `ACTIVE`**, and there is no read statement for a
`PENDING` session at all. A family with one approved skater and one pending sibling is
`ACTIVE`; booking for the pending sibling is still refused in code (ADR-002 decision 2).

The coach's name, which the pending screens show (*"Waiting for Coach Dana's approval"*),
comes from the family's own side instead: decision 7 returns it with the code, and
registration writes it onto the link item.

```json
{ "Sid": "CoachPartitionPublicRead",
  "Action": ["dynamodb:GetItem", "dynamodb:Query"],
  "Resource": "<table ARN>",
  "Condition": {
    "ForAllValues:StringEquals": {
      "dynamodb:LeadingKeys": ["COACH#${aws:PrincipalTag/coachId}"],
      "dynamodb:Attributes": ["PK", "SK",
        "days", "blocks", "scheduleName", "tempId", "startDate", "endDate",
        "durationMinutes", "bookingStatus",
        "firstName", "lastName", "coachTimezone", "currency", "requiredNoticeHours",
        "profilePhotoKey", "displayPhoneToClients", "displayEmailToClients",
        "displayPaymentTypesToClients",
        "businessEmail", "phone", "paymentInstructions",
        "cashappHandle", "venmoHandle", "paypalHandle"] },
    "StringEquals": { "dynamodb:Select": "SPECIFIC_ATTRIBUTES",
                      "aws:PrincipalTag/linkStatus": "ACTIVE" } } }
```

What this gives, and why it meets **requirement 2**:

- **Availability works.** The schedule items, date overrides and the time and length of every
  taken slot are readable. A booking's `studentId`, `clientId`, price and payment fields are
  not, so a taken slot reveals nothing about who holds it — §7's rule, now enforced by the
  database rather than by what the code chooses to return.
- **Another family's students are unreadable.** A `STUDENT#` item has no attribute on the
  list except its keys. Nothing a client-path bug can ask for returns a name, contact detail
  or price override belonging to someone else.
- **A `PENDING` family can read nothing in the coach's partition**, which also makes ADR-016
  decision 7a's *"never to a `PENDING` family"* a database rule for the coach's contact
  details and payment handles. The coach's per-field *display* switches stay in code; the
  database cannot read the profile to check them.
- **The allowlist fails closed.** An attribute added later is unreadable by clients until
  someone adds it here on purpose. ADR-013 decision 4 gains a test that keeps this list and
  §5's attribute names in step.

The client still needs one per-student value from the coach's side, the
`priceMinorOverride`, to price a booking. It is not on the list. ADR-021 decision 6's
`consumer-student-link` **also mirrors `priceMinorOverride` onto the link item**, and the
client's booking path reads it there.

### 7. Coach codes: lookup only — before sign-in and after

*Amended 2026-10-01, the same day:* the first version of this decision assumed the code was
looked up inside a signed-in client's session. The sign-up design asks for the code **first**,
before any account exists (`ClientCodeEmpty`, `ClientCode`), and ADR-019 already treats the
lookup as a route reachable without signing in. There is no `clientId` to tag at that point,
so the lookup needs its own role.

**The `CODE#` item carries what the code screen shows:** `coachId`, `coachFirstName`,
`coachLastName` and `profilePhotoKey`. The screen says *"Code found — you're signing up with
Dana"* with the coach's photo, as `FeatureDecriptions/Client Sign Up` asks, without reading
the coach's profile. `api-coach` keeps these in step when the coach renames or changes their
photo (ADR-021 decision 5).

**Before sign-in — a `code-lookup` role.** `api-client`'s unauthenticated route assumes a
role that can do exactly one thing: `GetItem` on `CODE#*`, attributes `PK`, `SK`,
`coachId`, `coachFirstName`, `coachLastName` and `profilePhotoKey`, `Select` held to
`SPECIFIC_ATTRIBUTES`. It carries no tags because there is no identity to tag, and one cached
session serves every caller. The execution role still holds no DynamoDB actions, so no
handler reaches the table except through a role `core.data` chose. ADR-019's per-address rate
limit (20 per five minutes) is what stops this route being used to enumerate codes.

**After sign-in — the same read, in the client's first session.** Registration runs once the
account exists and the email is verified. It **resolves the code again** under the
`clientId`-only session (decision 2) rather than trusting a `coachId` the browser carried over
from the pre-sign-in step, and that resolved coach is what tags the second session. Same
statement, same attribute list.

Registration copies the coach's name onto each link item, so the pending screens read it
from the family's own partition. A rename does not reach existing link items; once the family
is `ACTIVE`, screens read the live profile instead.

*Amended 2026-10-05:* photos are Phase 2 (ADR-016 d5), so in MVP the code screen shows the
coach's **initials**, built from `coachFirstName` and `coachLastName`. `profilePhotoKey` is
never set until then.

**How the browser fetches the photo** from its key is not decided here. The photo bucket,
upload path and resize step are still open in ADR-016 decision 5; whatever serves the photo
on the coach's profile serves it here.

### 8. Writes into the coach's partition: right coach, not right family

```json
{ "Sid": "CoachPartitionWrite",
  "Action": ["dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem",
             "dynamodb:ConditionCheckItem"],
  "Resource": "<table ARN>",
  "Condition": {
    "ForAllValues:StringEquals": {
      "dynamodb:LeadingKeys": ["COACH#${aws:PrincipalTag/coachId}"] },
    "StringEqualsIfExists": { "dynamodb:ReturnValues": "NONE" } } }
```

Booking, registration, client cancellation and the contact fan-out all write here.
**Requirement 3 is met:** a client's writes can land only in their own coach's partition,
whatever the code does.

**This statement applies to `PENDING` sessions too**, unlike decision 6's read. A pending
family must still create their skaters (registration), edit or remove them before approval,
and fan out a profile change onto them, and all of that writes `STUDENT#` items under the
coach. The database cannot tell those writes from a booking, so **"a `PENDING` family cannot
book" stays a code rule** (ADR-002 decision 2). They can still read nothing back.

**What the database still cannot stop, stated so nobody assumes it does:** a client-path bug
could overwrite or delete **another family's item under the same coach** — a booking, a
pending student, a cancellation line. These writes carry names and contact details, so they
cannot be narrowed by attribute, and there is no sort-key condition. They cannot be used to
**read** anything (`ReturnValues` is held to `NONE`). The code-level link check — the
target student must be in the caller's link set — remains the only thing preventing that,
and stays in ADR-013's cross-tenant test.

Closing this would mean moving bookings out of the coach's partition into one the client
owns, which breaks the coach's date-range queries, the booking lock and GSI2. It is
recorded under *Revisit if*.

**One write option is dropped.** A conditional put that fails with
`ReturnValuesOnConditionCheckFailure = ALL_OLD` returns the whole blocking item — another
family's booking — and there is no IAM condition key for it. *Corrected 2026-10-05 by decision
9's row 9: the `client-tenant` policy as written refuses such a request with
`AccessDeniedException`, so the database blocks this leak. See the note at the end of this
decision.* ADR-006 used this to tell a
client's own earlier booking from a real conflict (decisions 3 and 4). **The client path now
sends `NONE`**, enforced by an ArchUnit rule on `api-client`, and attributes a failed date by
looking for its own booking at that date and time on GSI1. GSI1 is eventually consistent; a
date not found there is checked once more after a short pause before being reported as
unavailable.

*Amended 2026-10-05.* **The database refuses `ALL_OLD` on a failed client write.** Tested on a
real table: the same conditional put on another family's taken slot fails its condition when
it asks for nothing back, and is refused with `AccessDeniedException` when it asks for
`ALL_OLD`. The test shows the policy blocks it but not which part does: either the
`dynamodb:ReturnValues = NONE` condition also governs this option, or returning the old item
counts as a read that the attribute allowlist doesn't permit. Two consequences:

- **The ArchUnit rule on `api-client` stays, as a second guard** rather than the only one. It
  also keeps the code from depending on a request that would fail.
- **The protection depends on the policy's current shape.** Any change to `client-tenant`'s
  write or read statements re-runs row 9 of the gate tests before it ships.

### 9. Verify before building on it

Runs against a real table, alongside ADR-021 decision 7:

| # | Attempt, as client A (coach X) | Expected |
|---|---|---|
| 1 | `Query` own `CLIENT#A`; GSI1 with `GSI1PK = CLIENT#A` | allowed |
| 2 | Same against `CLIENT#B` | denied |
| 3 | `Query COACH#X` for `SCHEDULE#` and `BOOKING#` items with an allowlisted projection | allowed |
| 4 | Same with `studentId`, `clientEmail` or `priceMinor` in the projection, or no projection | denied |
| 5 | With `linkStatus = PENDING`: `Query COACH#X` for schedule or slots, `GetItem COACH#X/PROFILE` with any projection. Then the same with `ACTIVE` | all denied, then allowed |
| 6 | Any read of `COACH#Y` | denied |
| 7 | Conditional `PutItem` of a booking into `COACH#X`, then `COACH#Y` | allowed, then denied |
| 8 | A write to `COACH#X` with `ReturnValues = ALL_OLD` | denied |
| 9 | A failing conditional put with `ReturnValuesOnConditionCheckFailure = ALL_OLD` | **record what comes back** — if non-allowlisted attributes are returned, the ArchUnit rule in decision 8 is the only guard |
| 10 | The first session (no `coachId` tag) reading `COACH#X` | denied |
| 11 | The `code-lookup` role: `GetItem CODE#K` with the decision 7 attributes; then with any other attribute, no projection, a `Query`, or any read of `COACH#` or `CLIENT#` | allowed; then all denied |

**Rows 1 (on GSI1) and 9 are the open ones.** Row 1 is ADR-021's row 3 again — whether
`LeadingKeys` on an index query checks the index's partition key. If it does not, the
client's own bookings move from GSI1 to a copy under `CLIENT#<sub>`, written in the same
transaction as the booking.

*Answered 2026-10-05:*

- **Row 1: GSI1 is locked to the family.** Client A could query GSI1 for `CLIENT#client-a`
  and was refused `CLIENT#client-b`. The `CLIENT#` booking copy isn't needed.
- **Row 9: blocked by the database.** Confirmed on a second run with a control: without a
  return option the attempt fails its condition (so the write is allowed); with
  `ReturnValuesOnConditionCheckFailure = ALL_OLD` it is refused with `AccessDeniedException`.
  Decision 8 is amended accordingly; the ArchUnit rule stays as a second guard.

---

## Alternatives considered

- **Leave clients code-only** (ADR-021 decision 9). Rejected by the owner: the client is the
  more exposed side — anyone can register with a code passed around a team chat (ADR-016
  decision 1a).
- **Move bookings into the client's partition.** Closes decision 8's write gap, but the
  booking is the lock that stops a double booking (ADR-004 decision 2), and the coach's
  day, week and dashboard queries read bookings by date from the coach's partition. Both
  would have to go through an index or a second lock item, and the coach's role would then
  need write access to every client partition, undoing ADR-021. Rejected for now.
- **A separate public partition per coach** (schedule and slot markers under
  `SCHEDULE#<coachId>`, as an early draft of ADR-016 tried). Gives clean read-only access,
  but every schedule save and booking writes two partitions, and the attribute allowlist
  delivers the same read protection without moving anything. Rejected.

---

## Consequences

**Gained.**

- A client-path bug cannot return another family's students, bookings, recurrences or
  contact details, or the coach's private fields, and cannot write to another coach at all.
- §7's one non-structural check is now structural for reads.
- `PENDING` families cannot read anything of the coach's, whatever the code does.
- CloudTrail names the client on every client-path data event: session `client-<sub>`,
  source identity `<sub>` (as ADR-021 decision 8 does for coaches).

**Cost.**

- Two STS sessions per client per container on a cache miss, both cached. At current scale,
  this is noise.
- Every client-path read of the coach's partition must name its attributes. That is a
  discipline the code must follow, and the database fails any read that forgets.
- An attribute allowlist to maintain, with a test keeping it in step with §5.
- Retry attribution moves from a same-response comparison to a GSI1 lookup that can lag.
- A key change to GSI1 and the recurrence header. Nothing is built yet, so there is no
  migration.

---

## Open

- **Decision 9's tests**, rows 1 and 9 above all.
- **How the code screen fetches the coach's photo** from `profilePhotoKey` — waits on
  ADR-016 decision 5's photo bucket (decision 7). *Phase 2 since 2026-10-05; MVP shows
  initials.*
- ~~Whether a `PENDING` family should see availability at all.~~ **Settled by the owner,
  2026-10-01: no** — they see only their own account (decision 6).

## Revisit if

- **A write to another family's item is ever found in testing or production.** Decision 8's
  gap is then real rather than theoretical, and moving bookings into a client-owned
  partition (Alternatives) is the fix.
- **ADR-002 decision 5 is relaxed** so a client can have more than one coach.
