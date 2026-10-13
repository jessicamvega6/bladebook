# BladeBook — Monitoring, Logging and Access Auditing

**Status:** Open questions. Nothing here is decided.
**Opened:** 2026-08-25, from `architecture.md` §7's unresolved *"consider a DynamoDB audit
trail + S3 access logging for PII access."*

Two halves, and they are not the same problem:

- **Who saw what** — an obligation. §7 commits to child-data handling, so "which human
  looked at which minor's record, and when" is a compliance artefact, not an ops nicety.
- **Is it working** — an operation. Eight Lambdas, two cron jobs, a bulk email path and a
  $2–10/month budget that a careless choice here could triple.

The budget is a real constraint on this document, not a footnote. Several of the obvious
answers cost more per month than the entire rest of the system.

---

## 1. Tenant isolation — proving the thing that must never happen

> *"Displaying client data belonging to coach123 to coach128993 should never be possible."*

**Update 2026-10-01:** ADR-021 and ADR-022 add a second, database-level gate under the code
gate for coaches and clients, and re-key GSI1 by client, so the exception described below is
now structural for reads. It remains for client **writes** inside a coach's partition. The
questions below still apply to the code gate.

**Update 2026-10-05:** [ADR-024](adr/ADR-024-client-write-link-check.md) answers the first two
questions: the check is structural (a `LinkedSkater` type and a `clientId` ownership
condition), and a failure is logged, with patterns paging on configurable thresholds.

**Most of this is already structural, and that is worth stating precisely**, because it
changes what needs watching.

Every coach-scoped read is rooted at `PK = COACH#<coachId>`, where `coachId` comes from the
**verified Cognito JWT claim**, never the request body (§7). There is no key that spans two
coaches. A coach cannot read another coach's students because the query cannot be
expressed, not because a check refuses it.

**But there is exactly one exception, and it is the one to watch.** §7 already names it:

> *"Booking and GSI1 reads must verify the target `studentId` appears in the caller's link
> set. This is the one client-side check that is **not** structural, because GSI1 is keyed
> by student rather than by client — it must be enforced in code."*

GSI1 is keyed `STUDENT#<studentId>`. Anyone holding a student id can query it. The only
thing standing between a client and another family's booking history is an application-level
check.

### Questions

- **Should the GSI1 check be a shared `core/` function that every caller must route
  through**, rather than a rule each handler remembers? ADR-001 made `core/` framework-free
  precisely so invariants could live in one place.
- **What happens when the check fails?** A 403 is the obvious answer, but a failed check is
  either a bug or an attack, and those want different responses. Log-and-alert on every
  occurrence, or is that a noisy signal?
- **Is there a test that proves isolation**, run in CI? Two coaches, two clients, and an
  assertion that every cross-tenant read fails. Cheap to write once, and it is the artefact
  you point a lawyer at.
- **Should there be a periodic canary** in production that attempts a cross-tenant read and
  alerts if it ever succeeds? Or is a CI test sufficient given the isolation is structural?
- **Does the coach-side confirmation of a `PENDING` student open anything?** ADR-002 says it
  is scoped by `coachId` from the token; worth confirming that holds for a student created
  by someone who guessed a `coachCode`. **Closed 2026-10-12:** see `Open-Pending.md` §9.

---

## 2. PII access logging — who saw what

**Settled 2026-08-30 — see [ADR-012](adr/ADR-012-pii-access-logging.md).**

In short: application-layer logging is the primary mechanism, because CloudTrail cannot name
a human — every application read runs under the Lambda's execution role. CloudTrail data
events are enabled in **both** environments as well, covering direct reads that bypass the
app; the cost objection was mistaken, since events are charged per API call rather than per
item returned (~$0.013/month at current scale).

Scheduled jobs emit one aggregate line per run rather than one per record. Client reads are
logged, tagged with `clientRelationship`. Log lines carry identifiers and never values. The
access log gets its own log group and its own read policy.

**Retention is deliberately deferred to the legal review §7 already requires** — a log of
access to minors' data is itself a record about minors.

Enforcement is not left to discipline: `core/` repository methods returning PII require an
`AccessContext` parameter, so the compiler rejects a caller that does not say who is asking,
and one ArchUnit rule in continuous integration (CI) stops anything outside `core/data`
reaching `DynamoDbClient` at all.

Still open there: correlation identifiers are not threaded across log groups; the interim
retention value; whether the access log needs its own access logging; and whether a path
that logs *wrongly* — wrong actor, incomplete identifiers — is caught by anything.

---

## 3. Delivery health — the obligation nobody expects

**This is the one most likely to cause an actual outage**, and it is not in §7 at all.

SES suspends senders whose **bounce rate exceeds ~5%** or **complaint rate exceeds ~0.1%**.
BladeBook sends to addresses a client typed into a form, never verified beyond Cognito
signup, and ADR-009 introduced a path that emails *many people at once* when a coach cancels
a week.

### Questions

- **Are SES event destinations configured** for bounce, complaint and delivery? Without them
  a rising bounce rate is invisible until AWS suspends sending — at which point reminders and
  cancellation notices stop, silently.
- **What happens to a hard-bounced address?** Nothing in the model marks a client's email
  invalid. ADR-006's `notificationStatus = FAILED` records that one message failed; it does
  not stop the next one being sent to the same dead address, which is what drives the rate up.
  **Settled 2026-10-12:** see `Open-Pending.md` §9.
- **Is there an alarm on bounce and complaint rate**, well below the suspension thresholds?
- **SNS SMS delivery status logging** — off by default. Without it, a failed text is
  indistinguishable from a delivered one, which makes ADR-007's `SENT` state a guess.
- **DLQ depth on the cancellation notifier** is the sharpest single health signal in the
  system: it means clients were not told their lessons were cancelled. Should it page?

---

## 4. Application health

Modest, and mostly the defaults. Named so nothing is forgotten:

| Signal | Why it matters here |
|---|---|
| Lambda errors and throttles, per function | Six roles, six blast radii — an aggregate alarm hides which one broke |
| Lambda duration approaching timeout | Recurrence materialisation (52 conditional puts) and the cancellation consumer are the two that can grow |
| DLQ depth, per consumer | Especially the notifier — see above |
| DynamoDB throttles, per table and per index | GSI2 is queried by date; a busy date is a hot partition |
| `ConditionalCheckFailedException` rate | Normal at low levels (two clients racing). A spike means something else |
| EventBridge Pipe failures | The CDC path is how *every* domain event reaches its consumer; if it stalls, nothing is emitted and nothing errors |
| Scheduler invocation success | A cron that silently does not fire produces no reminders and no error |
| Cost anomaly alarm | The §12 budget is $2–10/mo; a runaway loop or a mis-scoped log is the realistic way that becomes $200 |

### Questions

- **What is an alarm versus a dashboard?** The only genuinely page-worthy events look like:
  notifier DLQ non-empty, SES bounce rate climbing, cron did not fire. Everything else is a
  morning-check.
- **Where do alarms go?** There is no ops team — it is one developer. Email? The same SES
  that might be the thing that is broken?
- ~~Is there a synthetic check that books and cancels a lesson end-to-end?~~ **Settled
  2026-08-30** — [ADR-013](adr/ADR-013-testing-requirement.md) decision 3c. Its second
  Playwright flow *is* that check: run in continuous integration (CI) it is a test, run on a
  schedule against production — as a dedicated test coach and test family, since there is no
  long-running staging environment any more (ADR-027 decision 7) — it is the canary. It remains the only thing that catches the
  change-data-capture (CDC) path stalling, because every write still succeeds while it does.

---

## 5. Structured logging

- **Do the Lambdas emit structured JSON** with a correlation id threaded from API Gateway
  through the event bus to the consumer? Without it, "why did this client not get their
  email" means reading six log groups by timestamp.
- **What must never be logged?** A denylist is worth writing down now: contact details,
  `paymentInstructions` (ADR-003 flags it PII-adjacent), student names, coach codes. The
  cheapest PII leak in any system is a debug log.
- **Log retention** — CloudWatch defaults to never expiring, which is both a cost line and a
  compliance surface.

---

## What to settle first

1. **The GSI1 isolation check** — it is the only non-structural boundary in the system, and
   it protects children's data. A shared `core/` helper plus a CI test is a day of work.
2. **SES bounce and complaint monitoring** — the only item here that can take the product
   offline, and it is off by default.
3. **A denylist of what never gets logged** — free to decide now, expensive to retrofit
   after a leak.

Everything else can wait for real traffic, which will say more about what needs watching
than this document can.
