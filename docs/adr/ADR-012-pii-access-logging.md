# ADR-012: Personally Identifiable Information (PII) Access Logging

## Status

**Accepted** — 2026-08-30.

Answers §2 of [`docs/monitoring-questions.md`](../monitoring-questions.md), and replaces
`architecture.md` §7's *"consider a DynamoDB audit trail + S3 access logging for PII
access."*

Depends on ADR-011's staging environment (*read "staging" as dev since ADR-027*), and on ADR-002 decision 4's
`clientRelationship`.

**Amended — 2026-10-01.** Decision 1's *"CloudTrail cannot identify which coach read
anything"* no longer holds for `api-coach` and `api-checkin`.
[ADR-021](ADR-021-tenant-isolation-at-the-database.md) runs their reads under a per-coach
session named `coach-<sub>` with source identity `<sub>`, so CloudTrail data events name the
coach. Application logging stays primary. Decision 5a's `AccessContext` is now also where
the repository gets its tenant-scoped client (ADR-021 decision 3).
[ADR-022](ADR-022-client-isolation-at-the-database.md) does the same for `api-client`
(session `client-<sub>`), so CloudTrail names the client as well.

**Amended — 2026-10-05.** [ADR-023](ADR-023-rinkside-check-in-joins-the-coach-website.md)
withdraws `api-checkin`; its routes, including the contact reveal, run in `api-coach`.
References to `api-checkin` below now read as `api-coach`.

**Amended — 2026-10-05.** [ADR-024](ADR-024-client-write-link-check.md) adds a **security event** to the access-log group: a client
write that fails the link check because the skater or booking was never theirs. Same rules as
decision 2: identifiers only, never values, emitted by `core.data`.

**Amended — 2026-10-07.** [ADR-027](ADR-027-on-demand-dev-environment.md): staging is replaced by an on-demand **dev** stack. Decision 5's
data events apply to dev while it exists, and are written somewhere the teardown can't delete,
kept as long as production's, so "did anyone read it?" can still be answered after dev is
destroyed.

**Amended — 2026-10-12.** *Decided by the owner.* Decision **2**'s log line also names **which
fields** were returned, by field name, never value (for example `guardianEmail`, `phone`,
`studentName`). *"Coach `coa3` read `guardianEmail` of client `p4`"* then answers a parent's
*"who saw my phone number?"*, which the record identifier alone can't. Scheduled jobs' aggregate
lines (decision 3) list the field names once per run. The same day, the access log's own
access logging was settled (Open), and ADR-017's archive restores were added as access-log
entries.

**Amended — 2026-10-12.** *Decided by the owner.* Interim retention, two tiers, until the legal
review sets a window (Deferred):

- **CloudWatch keeps 90 days**, for searching.
- **Every line is also streamed** by a subscription filter through Amazon Data Firehose into an
  S3 bucket of its own, batched into large objects. A lifecycle rule moves them to S3 Glacier
  Deep Archive and **deletes them after 2 years**. A restore takes up to 12 hours, as with
  ADR-017's archive.
- **No S3 Object Lock yet.** It would make the trail tamper-proof but would also block erasure
  and any shorter legal window; revisit after the legal review.

The bucket follows the others' rules: SSE-KMS, public access blocked, object-level CloudTrail
data events (decision 5). Adds one Firehose stream, its role and one bucket.

**Note — 2026-10-12.** [ADR-030](ADR-030-financial-page-gross-and-rink-fees.md) decision 7: the
financial page's summary export holds no personal data and is **not** a PII read; a Phase 2
per-lesson export with skater names would be.

**Amended — 2026-10-20.** [ADR-033](ADR-033-invite-only-accepted-skaters.md) decision 2a: the share-check route returns a skater's
display name, so it writes an access-log line like the share-code lookup.

**Amended — 2026-10-20, later.** *Decided by the owner.* **The share-code lookup is a logged read
too.** It returns a skater's display name, a child's personal data, to another family, so every
route that resolves a share code for a family (the share-code lookup and the share-check) writes
a decision 2 access-log line naming the caller and the skater. The booking's own server-side
resolve returns nothing to the browser and is covered by the booking's log line.

---

## Context

`architecture.md` §7 commits to child-data handling, including *"access logging + the
ability to delete a student's data on request."* The second half is deferred; this ADR
settles the first.

The stated need is to log when PII is displayed **including the legitimate case** — coach123
viewing coach123's own client data. Logging only denials is easy and nearly useless.

---

## Decision

### 1. Application-layer logging is the primary mechanism, because nothing else can name a human

This was originally framed as a choice between application logging and CloudTrail data
events. It is not a choice, and the reason matters:

*Amended 2026-10-01: for the coach-facing functions, it now can — see Status and
ADR-021 decision 8.*

**CloudTrail cannot identify which coach read anything.** Every read from the application
runs under the Lambda's execution role, so CloudTrail records *"the `api-coach` role ran a
Query."* The human identity exists only in the verified Cognito JSON Web Token (JWT), which
is application-layer knowledge and never reaches the data plane.

The two mechanisms answer different questions against different threats:

| | Answers | Threat covered |
|---|---|---|
| Application logging | Which **human** read what, through the app | Normal use, and misuse of legitimate access |
| CloudTrail data events | Which **AWS principal** touched the table | Reading the table directly, bypassing the app |

Both are adopted. Neither substitutes for the other.

### 2. What a log line contains — and what it must never

Per read that returns PII: **actor identifier and role, the resource identifiers returned,
the operation, timestamp, request identifier, source IP address** — and, *since 2026-10-12*,
**the names of the PII fields returned.**

**Never the values.** An access log containing the data it logs access to has doubled the
problem and moved it somewhere with different retention and different access controls.

The `core/` module owns the emitting function, so a new handler cannot quietly return PII
without logging — ADR-001 made `core/` framework-free precisely so invariants live in one
place.

### 3. Scheduled jobs are logged once per run, not once per record

`sched-day-reminder` reads every booking for a date and every student's contact details,
every morning, forever. Logged per record it would be roughly 99% of the access log, and the
reads anyone actually wants to search would be buried in it.

So a cron run emits **one aggregate line**: which job, which date, how many records of which
type. *"`sched-day-reminder` read 47 student records for 2026-09-14."*

This still detects the case worth detecting. A job that suddenly reads 4,700 records is
visibly wrong at aggregate resolution; it is the *shape* of machine access that is
informative, not the individual reads, because per-record cron access is designed behaviour
rather than a decision anyone made that morning.

### 4. Client reads are logged, tagged by relationship

A client opening their own child's booking history **is** logged, carrying
`clientRelationship` (`SELF` / `GUARDIAN`; *`PARENT` removed 2026-10-01, ADR-002*) so guardian-reading-own-child can be
filtered out during review rather than being absent from the record.

Clients read rarely, so the volume is negligible, and it keeps *"everyone who saw this
student's data"* a complete answer rather than one with a caveat attached.

### 5. CloudTrail data events are enabled in **both** environments

Covering the path application logging cannot see: a console query, an AWS Command Line
Interface (CLI) scan, anything reading the table without going through the app.

**The cost objection was mistaken and is recorded here so it is not re-raised.** Data events
are charged per API *call*, not per item returned — the 7am job's `Query` returning fifty
bookings is one event, not fifty. Estimated production volume is roughly **13,000
events/month**, about **$0.013** at $0.10 per 100,000. It would take approximately 786× that
volume to reach $10/month.

Staging is included and costs almost nothing, being idle most of the time. It is also where
ADR-011's masking-leak risk lives, which makes it the environment where direct-read evidence
matters most.

The staging reports bucket and the production reports bucket both get object-level data
events for the same reason: they hold per-student attendance.

*Amended 2026-10-07 by [ADR-027](ADR-027-on-demand-dev-environment.md) decision 4: read "staging" as dev, whose logs outlive the stack.*

### 5a. Logging is enforced by the compiler and one build-gate rule

*Decided by the owner, 2026-08-30.* Decision 1 makes application logging the primary
mechanism, which is only true if it cannot be skipped. Two enforcements, chosen because
between them they make the unlogged path not exist rather than merely discouraged.

**The repository requires an actor.** Every `core/` method returning PII takes an
`AccessContext` — who is asking, in what role — and logs before returning. **There is no
overload without it.**

```java
// core/ — the only way to obtain a student
public List<Student> studentsFor(CoachId coach, AccessContext who)
```

A developer cannot forget a parameter the compiler demands. This costs nothing now and is a
refactor across every call site later, so it is a decision that has to be made *before* the
repository is written rather than after.

**One ArchUnit rule in continuous integration (CI):** *no class outside
`com.bladebook.core.data` may reference `DynamoDbClient`.* Without it, the rule above is a
convention someone can route around by querying the table directly from a handler; with it,
doing so fails the build.

That rule does double duty. ADR-001 calls the framework-free `core/` module *"the project's
primary insurance policy"* and states the boundary as non-negotiable — this is the first
thing that actually enforces it, rather than trusting it to hold.

**Two further layers were considered and are not adopted:**

- **An endpoint coverage test** — enumerate every route, assert each either is allowlisted
  as PII-free or emits a log line. Largely redundant: if a student cannot be obtained
  without an `AccessContext`, and DynamoDB cannot be reached outside the repository, a new
  endpoint returning student data is already forced through the logging path. The test would
  mostly re-prove what the compiler guarantees, at the cost of infrastructure that can
  authenticate and invoke every route.
- **CloudTrail reconciliation** — compare data-event counts against access-log line counts
  and treat a persistent gap as an unlogged path. Fiddlier than it sounds: events land in S3
  with delay, counting means parsing them, and counts will not match exactly for legitimate
  reasons (retries, batch operations, the reconciliation job's own reads). Tuning a noisy
  comparison to catch a case the two adopted layers have largely closed.

Both become worth revisiting if a second developer joins, or if a PII-returning path is ever
found unlogged — at which point the assumption behind not adopting them has been disproved.

### 6. The access log is its own log group with its own read policy

Not mixed into application logs. §7's least-privilege posture applies to the audit trail as
much as to the data: the record of who read what is itself sensitive, and the ability to
read it is a separate grant from the ability to run the system.

---

## Deferred

**Retention is not decided here, deliberately.** A log of access to minors' data is *itself*
a record about minors, so "how long may we keep it" is a legal question rather than an
engineering one — short is bad for audit, long enlarges the compliance surface. §7 already
requires legal review before launch; this belongs on that agenda alongside the retention
questions for cancellation records and student data.

Until it is answered, CloudWatch's default of **never expiring** is the wrong default in
both directions. An explicit interim value should be set rather than inherited.

---

## Consequences

**Easier.** "Who saw this student's record" becomes answerable, which is what §7 promised.
Both the through-the-app and around-the-app paths are covered, and the aggregate rule keeps
the log readable enough that someone might actually search it.

**Harder.** Decision 5a makes the obligation compiler-enforced, which means every call site
that reads PII must thread an `AccessContext` through to it. That is friction on ordinary
work — a handler that just wants a student now has to know who is asking — and it is the
price of the guarantee. Retrofitting it would be considerably worse, which is why it is
decided before the repository exists.

**A second retention surface exists.** The access log accumulates records about minors, and
until the legal review sets a window it grows without bound.

---

## Open

- **Correlation identifiers are not threaded** from API Gateway through the event bus to the
  consumers. Without one, tying a read to the request that caused it means matching
  timestamps across log groups.
- ~~Offline reveals are logged late, or not at all.~~ **Closed 2026-09-30 by ADR-014 decision
  9b:** guardian contact details are no longer cached on the phone; each reveal is fetched
  with signal and logged when it happens.
- ~~**The interim retention value.**~~ Deferring the legal question does not excuse leaving the
  CloudWatch default. **Settled 2026-10-12:** 90 days in CloudWatch, then a Deep Archive copy
  deleted after 2 years (see the amendment above).
- ~~**Does the access log itself need access logging?**~~ The recursion has to stop somewhere;
  where is unstated. **Settled 2026-10-12 by the owner: it stops at AWS's own controls.**
  Nothing in BladeBook logs reads of the access log. Only the owner's operator role can read it,
  sign-in is through IAM Identity Center with multi-factor authentication, and CloudTrail
  records what it can. The log holds identifiers, never values (decision 2), and turning an
  identifier into a child's details means reading the table, which CloudTrail data events
  already record (decision 5). Revisit when anyone else gains AWS credentials (Revisit if).
- **To-do: Confirm what CloudTrail records for reads of a CloudWatch Logs group.** Starting a
  Logs Insights query is believed to be recorded; plain `GetLogEvents` / `FilterLogEvents`
  reads are believed not to be. Verify before relying on it.
- ~~Nothing verifies that a handler returning PII actually logged it.~~ **Settled
  2026-08-30** — see decision 5a. A compiler-required `AccessContext` plus one ArchUnit rule.
  What remains uncovered, and is a different problem: a path that *does* log but logs
  **wrongly** — wrong actor, incomplete identifiers, the caller's identity in place of the
  subject's. That is correctness rather than coverage, and needs unit tests on the emitting
  function itself.

---

## Revisit if

- Volume grows enough that CloudTrail data events become a visible line item — roughly two
  orders of magnitude above current estimates.
- Anyone other than the owner gains AWS credentials. The direct-read threat is currently
  theoretical, and CloudTrail data events are its only evidence.
- The legal review sets a retention window, which converts this ADR's Deferred section into
  a decision.
