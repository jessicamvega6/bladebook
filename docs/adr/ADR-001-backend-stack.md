# ADR-001: Backend Stack and Project Layout

## Status

**Accepted** — 2026-07-28. Supersedes the "decide at scaffold time" placeholders in §2 and §11 of `docs/architecture.md`.
**Amended** — 2026-07-29. See Amendments below. **The mandatory day-one spike is withdrawn.**

**Amended** — 2026-08-28. This ADR assumed a single environment: *"There is no staging
environment, so getting this wrong means discovering a production 500 window in production."*
[ADR-011](ADR-011-staging-environment.md) adds one. The Cloud Development Kit (CDK) app in
decision 2 becomes environment-parameterised, and decision 3's repo layout is unchanged.

**Amended** — 2026-09-29. Amendment **A6** restates decision 1's role column for all nine
functions. It had not been revised since 2026-07-28, and eight later ADRs changed what the
functions read, write and send.

**Amended** — 2026-09-30. Amendment **A7**: API Gateway is a **REST API**, not an HTTP API,
so that a Web Application Firewall can attach to it ([ADR-019](ADR-019-waf-in-mvp.md)).

**Amended** — 2026-10-01. Amendment **A8**: `api-coach` and `api-checkin` reach DynamoDB
only through per-coach tenant roles, a thirteenth function keeps the client's link item in
step, and `api-coach` gives up GSI1 ([ADR-021](ADR-021-tenant-isolation-at-the-database.md)).
Amendment **A9**: `api-client` does the same with a per-client tenant role
([ADR-022](ADR-022-client-isolation-at-the-database.md)).

**Amended** — 2026-10-05. [ADR-023](ADR-023-rinkside-check-in-joins-the-coach-website.md)
withdraws `api-checkin`: **A3**'s separate check-in bundle on its own origin path becomes an
entry point inside the coach website, and **A5**/**A6**/**A8**'s `api-checkin` rows and
`checkin-tenant` role no longer apply. Twelve functions.

**Amended** — 2026-10-06. [ADR-025](ADR-025-many-coaches-per-skater.md) adds `consumer-family-sync` to `consumers.jar`: thirteen
functions. Its role: `GetItem` and `Query` on the family's partition, `UpdateItem` on the table.

**Amended** — 2026-10-06. [ADR-026](ADR-026-shared-lessons-by-invitation.md) adds `consumer-invite` to `consumers.jar`: fourteen functions.
It reads and writes invitations in both families' partitions and holds `ses:SendEmail` and
`sns:Publish`.

**Amended** — 2026-10-07. [ADR-027](ADR-027-on-demand-dev-environment.md) replaces ADR-011's long-running staging with a **dev** stack built
on demand and destroyed afterwards. A4 criterion 5 now asks how each tool builds and tears down
a second environment from nothing, not how it maintains one.

---

## Amendments

ADRs are append-only: the reasoning below is preserved as the record of what was
decided and why. This section states what has changed since, and takes precedence
where the two conflict.

### A1 — Cold start is no longer a design constraint (2026-07-29)

The owner has deprioritized cold-start latency. It is not a factor in any further
design decision. This removes the constraint that drove roughly half of the
original analysis.

**What is withdrawn:**

- **SnapStart is no longer required** on any function. With it go all of its costs:
  SDK priming in `beforeCheckpoint`, the 14-day snapshot expiry and
  `SnapStartNotReadyException`, the keep-warm Scheduler rule, the 10-second
  `afterRestore` ceiling, the Secrets Manager extension incompatibility, and the
  entropy-in-init trap. Enable it later if latency ever becomes interesting; none
  of it is load-bearing now.
- **The mandatory day-one spike is withdrawn.** It existed solely to measure
  SnapStart restore latency after multi-hour idle. There is nothing left for it
  to validate.
- **The fallback ladder is withdrawn** (memory bump → Quarkus JVM → Quarkus native).
  It was a latency-recovery plan.
- **Assumptions 1, 2, 5 and 7 are moot** — all four concern unmeasured SnapStart
  behaviour.

**What survives, and why:**

- **Spring Boot 4 is still the call.** The original Rationale already found that
  under primed SnapStart the frameworks landed within ~80ms of each other, and
  that the decision therefore turned on ecosystem depth, published support policy,
  and who patches the JVM. Those axes are untouched by this amendment. Micronaut
  is still eliminated on its absent EOL policy; Quarkus-native is still eliminated
  on GraalVM CVE patching duty.
- **The `java25` managed runtime and arm64 stand** — chosen for AWS-managed
  patching and cost, not for latency.
- **`core/` stays framework-free.** Its value was never cold starts; it is what
  makes a framework swap cheap for any reason.
- **The two-API-function split stands**, but now rests entirely on §7's
  per-Lambda least privilege — one `DispatcherServlet` Lambda cannot have narrow
  per-function IAM roles. The secondary argument (fewer snapshot builds per
  deploy) no longer applies.
- **Four framework-free async consumers stand** — simpler, not faster.
- **Alias wiring is now optional but still recommended**, for versioning and
  rollback rather than to make SnapStart apply. The `[$LATEST]` failure mode
  disappears with SnapStart.
- **Decisions 2, 3 and 4** (CDK TypeScript, monorepo, per-coach timezone in the
  model) are unaffected — none rested on latency.

**Net effect:** the same stack, materially less operational surface. Deploy is
Maven → CDK → done, with no snapshot lifecycle to reason about.

### A2 — Assumption 3 resolved (2026-07-29)

The owner has confirmed **no prior Quarkus or Micronaut experience**. This closes
assumption 3 in the direction the decision already anticipated: Spring wins on
corpus depth and AI-assist quality precisely when a framework is new to you.
Prior *Spring* experience remains unstated; if it is also new, the decision holds
but the "budget real time for the first week of setup" note in Consequences
should be read as a firm prediction rather than an aside.

### A3 — Check-in is a third frontend surface, in MVP (2026-08-30)

The check-in app moves from Phase 2 into MVP. This fires the "Revisit if" trigger
that anticipated exactly this, so the monorepo boundary is re-evaluated here.

**Decision 3 (monorepo) holds, and `web/` does not split.** The three surfaces —
coach, client, check-in — share the Forest theme's 35 tokens, the slot-expansion
logic, price and currency formatting, and the same generated API client. Splitting
them turns every one of those into a published package with a version bump, which
is the same cross-runtime drift that ADR-013 decision 3b's shared fixture exists to
prevent. The trigger asked the question; the answer is no.

**What changes instead is inside `web/`:**

- `web/` builds **three bundles from one source tree**, not one bundle with three
  routes. Check-in is used rinkside on a phone; it must not download the schedule
  editor. Vite supports this with multiple entry points sharing a `common/` module.
- Each bundle is a separate CloudFront origin path, so check-in can ship without
  redeploying the coach website.
- ADR-013 decision 3a's "component rendering" requirement now covers three surfaces.

**Two questions this raises are not settled here** and need their own decision:
whether check-in gets its own API Lambda function with a narrower IAM role than
`api-coach`, and what the app does when the rink has no signal. Both are recorded
as open threads in `architecture.md` §11.

---

### A4 — Infrastructure as Code (IaC) is re-opened: CDK or Terraform (2026-09-04)

**Decision 2 never compared CDK to Terraform.** It is titled *"IaC — CDK TypeScript"*, which
reads like a tool selection, but its entire content is about making CDK-TypeScript work
correctly: the missing `aws-lambda-java-alpha` construct, the two lines of `cdk.json` that
stop `cdk deploy` shipping a stale JAR, SnapStart alias wiring, `cdk-nag` in continuous
integration (CI). The alternative the panel actually weighed was **CDK-TypeScript versus
CDK-Java** — visible in its own reasoning, *"In CDK-Java the Maven task is the app command,
so the rebuild happens for free."*

That is a language choice inside CDK. **Terraform was never on the table**, and the record
implied an evaluation that did not happen. This amendment corrects that.

**Decision 2 is no longer treated as settled.** CDK and Terraform are both open, and the
choice is recorded in `Open-Pending.md` §1. *Corrected 2026-10-04: an earlier version of this
amendment said the choice would be made by building one function in both tools. That was never
the owner's plan, and it has been removed.*

#### Why now

Two reasons, and the second is the load-bearing one:

1. The owner wants to learn Terraform, which is a legitimate input on a solo project — the
   HashiCorp Configuration Language (HCL) is the more portable skill, and BladeBook is the
   system available to learn it on.
2. **This is the moment when switching is free.** `infra/` is currently a line in a
   repo-layout diagram; no infrastructure code exists. Once eight Lambda functions, an HTTP
   API, a Cognito user pool and a staging stack are deployed through CloudFormation, moving
   to Terraform means importing every resource into state. The cost of this decision rises
   steeply and soon, so deferring it is not free either.

#### Criteria for the choice

Recorded before choosing, deliberately. A choice made on how a tool felt on the day is
exactly how decision 2 acquired an unexamined assumption in the first place.

| # | Criterion | Why it matters here |
|---|---|---|
| 1 | **Can §7's least-privilege rule be enforced as a build gate?** | **Hard requirement.** `cdk-nag` currently fails the build on wildcard IAM actions, unencrypted buckets and missing Block Public Access — that *is* §7's checklist, automated. Terraform must show `checkov` or `tfsec` doing the same job before it can win. |
| 2 | **Does deploy reliably rebuild the JAR?** | This was decision 2's strongest concrete objection to CDK-TypeScript, and it cost two lines to neutralise. Terraform must be checked for the same trap: does `terraform apply` after a handler edit upload the previously-built artifact with no error? |
| 3 | **Preview quality** | `terraform plan` is expected to read more clearly than `cdk diff`, above all on IAM policy changes. |
| 4 | **Toolchain cost** | CDK keeps `infra/` in TypeScript alongside `web/`. Terraform adds HCL as a fourth language on a one-person project. |
| 5 | **Two environments** | ADR-011 needs staging as a full second stack. Compare CDK context flags against Terraform workspaces or a second `tfvars`. |

*Criterion 5 amended 2026-10-07 by ADR-027: the second environment is dev, built and destroyed on demand. Compare how cleanly each tool creates it from nothing and removes it completely, while production's retained resources stay protected. Since ADR-027 decision 8, dev is also a **separate AWS account**: compare how each tool deploys to two accounts (CDK bootstraps each; Terraform uses a provider or credentials per account).*
| 6 | **Failure recovery** | CloudFormation can wedge a stack in `UPDATE_ROLLBACK_FAILED`; Terraform can drift or lose state. How hard is each to recover from? |

**Decision rule:** criterion 1 is a gate, not a weight — an option that cannot enforce §7 in
CI is disqualified regardless of how it scores elsewhere. Among survivors, 2 and 4 carry the
most weight, because they are the two that recur daily on a solo project.

#### What changes if Terraform is chosen

- `cdk-nag` is replaced by `checkov` or `tfsec`, and §7 must be re-verified against whichever
  is chosen — the packs are not equivalent rule-for-rule.
- Remote state has to exist before anything else does: an S3 bucket plus a lock table, itself
  bootstrapped outside Terraform.
- Decision 3's repo layout changes — `infra/` stops being an npm workspace, and the root
  `package.json` drops to one workspace.
- ADR-013's `infra/` testing line changes: Jest with CDK `assertions` no longer applies.

#### What does not change either way

Java Lambda packaging is hand-rolled regardless — decision 2 already established there is no
CDK Java L2 construct. Terraform is arguably more honest here, since it simply points
`filename` at the built JAR rather than appearing to abstract something it does not.

### A5 — The function list, corrected and extended to nine (2026-09-22)

Decision 1's table says *"Six Lambda functions, three build artifacts, six IAM roles."* That
has not been true for some time, and this amendment restates it rather than leaving readers
to reconcile it against six later ADRs.

| Function | Artifact | Trigger | Added by |
|---|---|---|---|
| `api-coach` | `api-coach.jar` | API Gateway | decision 1 |
| `api-client` | `api-client.jar` | API Gateway | decision 1 |
| **`api-checkin`** | **`api-checkin.jar`** | API Gateway | **ADR-014 decision 11** |
| `consumer-booking-confirmation` | `consumers.jar` | bus | decision 1 |
| `consumer-payment-reminder` | `consumers.jar` | bus | decision 1 |
| **`consumer-change-notifier`** | `consumers.jar` | bus | ADR-006 decision 5 |
| **`consumer-schedule-change`** | `consumers.jar` | Streams → Pipe → bus | ADR-009 / ADR-010 decision 5 |
| `sched-day-reminder` | `consumers.jar` | Scheduler ~7:00am | decision 1 |
| `sched-daily-report` | `consumers.jar` | Scheduler ~9:00pm | decision 1 |

**Nine functions, four build artifacts, nine IAM roles.** Two operational functions sit
outside this list and outside the request path: the PII access-log aggregator (ADR-012) and
the staging mask shape-check (ADR-011, staging only).

`api-checkin` is a third Spring Boot artifact, which is the real cost of ADR-014 decision 11
— the consumers still share one JAR across six handler entry points, so only the API tier
grew. The reasoning for splitting on a trust boundary is decision 1's own: the check-in
device is a third boundary, and a more physically exposed one than either of the first two.

**One limit is recorded in ADR-014 decision 11a and repeated here** because this table
invites the wrong inference: per-function IAM roles cannot separate item types within the
single table. DynamoDB conditions on the partition key, not on sort-key prefixes, so a role
permitted to write `CANCELLED#` lines can write `SCHEDULE#DATE#` items too. Roles bound
cross-tenant index reads and outbound service reach; routing and token scope do the rest.

### A6 — The execution roles, restated for nine functions (2026-09-29)

Decision 1's *Role* column was written for six functions against a model that still had
slot records. Since then: slots were removed and the booking item became the lock (ADR-004
decision 2); cancellation, holds and recurrence headers arrived (ADR-006, ADR-009);
idempotency guards were added to every consumer (ADR-010 decision 2); SMS senders must check
the opt-out list and write back suppression (ADR-007 decision 9); every client-facing email
reads the coach profile for its Reply-To (ADR-016 decision 8); and `api-checkin` exists
(ADR-014 decision 11). This table replaces decision 1's *Role* column, which is left as
written.

**Read the *Items* column as intent, not enforcement.** Per A5 and ADR-014 decision 11a, IAM
cannot tell one item type from another inside the single table. What a role genuinely
enforces is the **Actions**, **Indexes** and **Other services** columns. Which items a
function touches is held by code — `coachId` and `clientId` from the verified token, and
ADR-012's `AccessContext` — and by ADR-013's cross-tenant test.

| Function | DynamoDB actions | Items it touches | Indexes | Other services |
|---|---|---|---|---|
| `api-coach` | `GetItem`, `Query`, `PutItem`, `UpdateItem`, `DeleteItem`, `TransactWriteItems` | Everything under the caller's `COACH#<sub>`: profile, schedules, temp headers, date overrides, students, bookings, holds, cancellation batches and lines. The `CODE#` item at signup and rotation (ADR-002 d2, 2a; ADR-016 d9) | GSI1 (a student's unpaid lessons), GSI3 (the unpaid dashboard). **No GSI2** | none |
| `api-client` | `GetItem`, `Query`, `PutItem`, `UpdateItem`, `TransactWriteItems` | The caller's `CLIENT#<sub>` profile and links. `CODE#` lookup at registration. In the chosen coach's partition: default schedule, date overrides and bookings for availability; a **conditional `PutItem` per booking** with `ReturnValuesOnConditionCheckFailure` (ADR-004 d2, ADR-006 d4); the `RECURRENCE#` header (ADR-006 d4a) and its query (pattern 21). Registration, profile fan-out and cancellation as transactions (ADR-002 d1, d4; ADR-009 d2, d4; ADR-010 d5f) | GSI1 (own bookings, after the link check in §7). **No GSI2, no GSI3** | none |
| `api-checkin` | `GetItem`, `Query`, `PutItem`, `UpdateItem`, `DeleteItem`, `TransactWriteItems` | The caller's bookings, one student for the contact reveal, conditional attendance update, cancellation (ADR-014 d9, d11; ADR-009 d5a) | **None** | none |
| `consumer-booking-confirmation` | `GetItem`, `UpdateItem` | Student (contact), coach profile (Reply-To), booking (`confirmationSent`) | none | `ses:SendEmail` |
| `consumer-payment-reminder` | `GetItem`, `UpdateItem`, `TransactWriteItems` | Student, coach profile (instructions, handles, Reply-To), booking (`paymentReminderSent`); client profile and students on SMS suppression | none | `ses:SendEmail`, `sns:Publish`, `sns:CheckIfPhoneNumberIsOptedOut` |
| `consumer-change-notifier` | `GetItem`, `Query`, `UpdateItem`, `TransactWriteItems` | One batch's cancellation and re-price lines (ADR-010 d5f, ADR-020); client profiles or students for contact; coach profile (Reply-To, and the recipient when a client cancelled); lines (`notificationStatus`); suppression write-back | none | `ses:SendEmail`, `sns:Publish`, `sns:CheckIfPhoneNumberIsOptedOut` |
| `consumer-schedule-change` | `GetItem`, `Query`, `PutItem`, `UpdateItem`, `TransactWriteItems` | Schedule and overrides for the conflict and re-price tests; bookings in range — or all the coach's upcoming bookings, when invoked directly by `reconcile-schedule` (ADR-010 d5j); batch header, cancellation and re-price lines; conditional price updates on bookings (ADR-010 d5a–d5k, ADR-020) | none | none |
| `sched-day-reminder` | `GetItem`, `UpdateItem`, `TransactWriteItems` + `Query` on GSI2 | Bookings for today, student, coach profile (Reply-To), booking (`remindedOn`), suppression write-back | **GSI2** | `ses:SendEmail`, `sns:Publish`, `sns:CheckIfPhoneNumberIsOptedOut` |
| `sched-daily-report` | `GetItem` + `Query` on GSI2 | Bookings for today, student names, coach profile (the recipient) | **GSI2** | `ses:SendEmail`; `s3:PutObject` on `coach=*/date=*/` in the reports bucket |
| **`sched-drift-check`** — *twelfth function, added 2026-09-30 by [ADR-010](ADR-010-availability-and-reliability.md) decision 5k* | `Query` on GSI2 and the main table, `GetItem` — **read-only, no writes** | Upcoming bookings for the next 30 days, each such coach's schedule, overrides and recent batch headers | **GSI2** — a cross-tenant read, held only by a scheduled job | `sns:Publish` to the operator alert topic only (ADR-010 decision 4); CloudWatch metrics |
| **`sched-unpaid-reminder`** — *eleventh function, added 2026-09-30 by [ADR-018](ADR-018-unpaid-lesson-reminder-to-coach.md)* | `Scan` on GSI3, `GetItem`, `UpdateItem` | Unpaid lessons across coaches, student names, coach profiles (the recipient), booking (`settleReminderSentOn`) | **GSI3, scanned** — a cross-tenant read, held only by a scheduled job | `ses:SendEmail` |
| **`consumer-ttl-archiver`** — *tenth function, added 2026-09-30 by [ADR-017](ADR-017-data-retention-ttl-and-archive.md)* | **None** — reads the table's stream only | Items removed by Time to Live, from the stream's old image | none | `s3:PutObject`, `s3:PutObjectTagging` on the archive bucket |

**Every function also** writes to its own log group, and those that return or read personally
identifiable information (PII) write to the separate access-log group (ADR-012 decision 6).
Every asynchronous consumer can send to its own dead-letter queue (ADR-010 decision 2).
Key-management permissions follow whichever keys encrypt the table and bucket (§7).

**Three observations the table makes visible:**

- **GSI2 is held by exactly two functions**, both scheduled jobs. It is the one index that
  crosses tenants, and no function a person can call holds it.
- **Suppression write-back puts a client-profile write in three consumers.** ADR-007 decision
  9 requires flipping `smsOptIn` when an opted-out number is found. That is a write into the
  `CLIENT#` partition from functions that otherwise only read and send, and it is the
  broadest thing any consumer does. An alternative is a single small consumer that owns the
  write, fed by the other three; not adopted, but worth knowing before the first one is built.
- **`api-client` reads the coach's partition.** Availability is computed from the coach's
  schedule and bookings (ADR-004 decision 1), so a client function necessarily reads inside
  `COACH#<coachId>`. What it returns is only whether a slot is free, never who holds it (§7).

**Not yet assigned to any function** — work the ADRs require that no role above covers:

- **Sending the SMS opt-in confirmation** (ADR-007 decision 8). It needs `sns:Publish`, which
  `api-client` deliberately lacks. The natural home is a stream consumer on the client
  profile's `smsOptIn` changing from false to true.
- **Profile photo upload and resize** (ADR-016 decision 5). No bucket, upload path or resize
  step is specified yet.
- **The operational functions A5 lists outside the request path** — the PII access-log
  aggregator (ADR-012) and the staging shape check (ADR-011 decision 6b) — plus the staging
  refresh's cross-environment role (ADR-011 decision 7). Each is specified in its own ADR.

### A7 — API Gateway is a REST API (2026-09-30)

The design assumed an **HTTP API** throughout — the cheaper, newer API Gateway type, with a
JWT authorizer that integrates with Cognito. [ADR-019](ADR-019-waf-in-mvp.md) puts a Web
Application Firewall in MVP, and AWS WAF cannot attach to an HTTP API. It can attach to a
**REST API**, so the API becomes one.

- **Price:** about $3.50 per million requests instead of $1 — cents a month at this volume.
- **Token checking:** the REST API's built-in **Cognito authorizer** replaces the HTTP API's
  JWT authorizer. It confirms a token is genuine; unlike the JWT authorizer it cannot tell one
  Cognito app client's token from another's, which ADR-014 decision 10 needs. ADR-019's Open
  list carries the replacement (a small Lambda authorizer is recommended).
- **Nothing else changes.** The two-API-context split, the function list in A5 and the roles
  in A6 are unaffected. References to "the HTTP API" in the original text below — the SnapStart
  alias wiring, the day-one spike — are the historical record.

### A8 — Coach-facing functions use per-coach tenant roles (2026-10-01)

[ADR-021](ADR-021-tenant-isolation-at-the-database.md) adds a database gate under the code
gate: DynamoDB itself refuses a coach-path request for any partition but the caller's. These
rows replace A6's for the functions they name. Every other A6 row stands.

| Function | Execution role | Tenant role (assumed per request, tagged `coachId`) | Indexes |
|---|---|---|---|
| `api-coach` | `sts:AssumeRole`, `sts:TagSession`, `sts:SetSourceIdentity` on `coach-tenant`. **No DynamoDB actions** | `coach-tenant`: `GetItem`, `Query`, `PutItem`, `UpdateItem`, `DeleteItem`, `ConditionCheckItem` where `LeadingKeys = COACH#${aws:PrincipalTag/coachId}`; plus `PutItem`, `UpdateItem`, `DeleteItem`, `ConditionCheckItem` on `CODE#*`, attributes `PK`, `SK`, `coachId`, `coachFirstName`, `coachLastName`, `profilePhotoKey` only (ADR-021 d5, ADR-022 d7) | **GSI3 only** — GSI1 is dropped; a student's unpaid lessons come from GSI3 filtered on `studentId` (ADR-021 d4) |
| `api-checkin` | The same, on `checkin-tenant`. **No DynamoDB actions** | `checkin-tenant`: ADR-014 decision 11's actions, where `LeadingKeys = COACH#${aws:PrincipalTag/coachId}` | **None** |
| **`consumer-student-link`** — *thirteenth function* | `UpdateItem`, `DeleteItem` | — | none. No other service. Triggered by `StudentChanged` through the bus (ADR-021 d6) |

**Thirteen functions.** `api-coach` no longer writes the client's link item; it writes
only the `STUDENT#` item, and `consumer-student-link` follows. Transactions are authorised
per item against the actions above, which is why A6's `TransactWriteItems` becomes
`ConditionCheckItem` plus the write actions here.

A6's *"Read the Items column as intent, not enforcement"* no longer holds for these two API
functions' **tenant** boundary: DynamoDB now enforces it. It still applies to item types within a
partition (ADR-014 decision 11a, first point).

### A9 — `api-client` uses a per-client tenant role (2026-10-01)

[ADR-022](ADR-022-client-isolation-at-the-database.md) does for clients what A8 does for
coaches. This row replaces A6's `api-client` row.

| Function | Execution role | Tenant role (assumed per request) | Indexes |
|---|---|---|---|
| `api-client` | `sts:AssumeRole`, `sts:TagSession`, `sts:SetSourceIdentity` on `client-tenant`, and `sts:AssumeRole` on `code-lookup` for the coach-code step before sign-in. **No DynamoDB actions** | `client-tenant`, tagged `clientId`, `coachId`, `linkStatus`: full item access where `LeadingKeys = CLIENT#<clientId>`; `GetItem`/`Query` on `COACH#<coachId>` limited to an attribute allowlist, and **only when `linkStatus = ACTIVE`** — a pending family reads nothing there; `PutItem`/`UpdateItem`/`DeleteItem`/`ConditionCheckItem` on `COACH#<coachId>` with `ReturnValues` held to `NONE`; `GetItem` on `CODE#*` for `coachId` and the coach's name and photo key only. **`code-lookup`** (untagged, before sign-in): that same `CODE#*` read and nothing else | **GSI1**, now keyed `CLIENT#<clientId>`, under the same `LeadingKeys` condition. No GSI2, no GSI3 |

`ReturnValuesOnConditionCheckFailure` is no longer used on the client path (ADR-022
decision 8). The `RECURRENCE#` header now lives in the client's partition (ADR-022
decision 5).

---

## Context

Four constraints did the actual work here. Everything else was noise.

**1. One developer, for years.** Not one developer for a sprint. The cost that compounds is not build time or milliseconds — it is how often you get stuck at 11pm with no one to escalate to. Every advocate in the panel, including the Quarkus and Micronaut advocates arguing *against their own profiles*, independently conceded that ecosystem depth and AI-assistance quality rank Spring Boot > Quarkus > Micronaut, and CDK-TypeScript > CDK-Java. When three advocates each volunteer the same point against their own case, that is the most credible evidence in the panel, and it is the single largest multiplier on a solo project.

**2. BladeBook is the traffic profile AWS explicitly warns about.** From the SnapStart docs, verbatim: *"SnapStart works best when used with function invocations at scale. Functions that are invoked infrequently might not experience the same performance improvements."* BladeBook is infrequently invoked by design, and §7's one-role-per-Lambda mandate fragments that already-thin traffic across ~6 functions. This is not a footnote — it invalidates the planning numbers all three profiles were built on (see Rationale).

**3. Cold start is a UX question, not a cost question.** At tens of bookings/day, Lambda compute is inside the free tier under every option considered. The §12 estimate of ~$2–6/mo idle is dominated by S3/CloudFront and the SMS number. No profile threatened the budget. Anyone arguing a framework choice on AWS dollars is arguing about pennies — the real currencies are latency, developer-hours, and patching obligations.

**4. Minors' data raises the floor on maintenance.** §7 commits to COPPA-adjacent handling and legal review pre-launch. That makes "who patches the JVM" a first-order question, not an ops detail. A custom runtime (GraalVM native on `provided.al2023`) transfers CVE patching from AWS to one person. A framework with no published EOL policy transfers upgrade scheduling to the same person, on someone else's timetable.

Additional context that materially changed the answer: the panel's own cited benchmarks do not describe this system. AWS's headline Spring/SnapStart numbers (6195 → 1425 → 782ms) come from a workload talking to **RDS Postgres through RDS Proxy inside a VPC** — BladeBook is DynamoDB over a public TLS endpoint, and the one recent independent measurement on that path found SnapStart *regressing* cold duration versus a plain JVM because the snapshotted SDK sockets are dead on restore. The Micronaut and Quarkus numbers (696ms, 666ms p50) come from one-hour `hey` load tests generating cold starts via **concurrency scale-up**, with the author himself discounting early samples due to "SnapStart tiered cache effects." Nobody has published a measurement of SnapStart restore latency after multi-hour idle. That is exactly and only what BladeBook will ever produce.

---

## Decision

| # | Decision | Call |
|---|---|---|
| 1 | Java Lambda framework | **Spring Boot 4** (`aws-serverless-java-container` 3.x) on the **`java25` managed runtime**, **arm64**, **SnapStart enabled with SDK-level priming** — for the two synchronous API functions **only**. The four asynchronous consumers use **plain `RequestHandler` classes with no framework and no SnapStart**. |
| 2 | IaC language | **AWS CDK in TypeScript**, with the Maven build wired into `cdk.json`'s app command so `cdk deploy` cannot ship a stale JAR. |
| 3 | Repo layout | **Monorepo.** `backend/` (Maven multi-module) + `web/` (Vite/React) + `infra/` (CDK TS), with `web` and `infra` as npm workspaces. |
| 4 | Coach timezone | **Per-coach IANA timezone in the data model from day one; single-timezone scheduler fan-out for MVP.** The reversible half is deferred; the irreversible half is not. |

### 1. Framework — the concrete shape

Six Lambda functions, three build artifacts, six IAM roles — *superseded: see A5 for the
nine functions and A6 for their current roles; the table below is the original record*:

| Function | Artifact | Framework | SnapStart | Role (§7) |
|---|---|---|---|---|
| `api-coach` | `api-coach.jar` | Spring Boot 4 | **Yes** + priming | RW on `PK = COACH#<sub>`; no GSI2 |
| `api-client` | `api-client.jar` | Spring Boot 4 | **Yes** + priming | Query GSI1; conditional `TransactWriteItems` on slot+booking only |
| `consumer-booking-confirmation` | `consumers.jar` | none | No | `GetItem` on student; `ses:SendEmail` |
| `consumer-payment-reminder` | `consumers.jar` | none | No | `GetItem` on student; `ses:SendEmail`, `sns:Publish` |
| `sched-day-reminder` | `consumers.jar` | none | No | `Query` on GSI2; `ses:SendEmail`, `sns:Publish` |
| `sched-daily-report` | `consumers.jar` | none | No | `Query` on GSI2; `ses:SendEmail`; `s3:PutObject` on `coach=*/date=*/` |

One JAR backs four consumer functions via four distinct handler entry points (`com.bladebook.consumers.DailyReportHandler::handleRequest`, etc.). One build, four functions, four narrow roles — no framework feature required to get there.

**`core/` is framework-free.** Domain types, DynamoDB access, and event serialization are plain Java against AWS SDK v2, with zero Spring annotations. No `@Component`, no `@Autowired`, no `@Value` below the controller layer. This is non-negotiable and is the project's primary insurance policy (see Consequences).

*As of [ADR-012](ADR-012-pii-access-logging.md) decision 5a this boundary is **enforced** rather than trusted: an ArchUnit rule in continuous integration (CI) fails the build if any class outside `com.bladebook.core.data` references `DynamoDbClient`. The rule exists for personally identifiable information (PII) access logging, but this is the first thing that actually holds the `core/` boundary in place.*

**Priming is SDK-level, not invoke-level.** In a `beforeCheckpoint` CRaC hook, construct the `DynamoDbClient` and execute a real `Query` against a reserved synthetic partition `COACH#__PRIME__` that owns no records. Do **not** implement invoke priming (self-invoking the controller pre-snapshot). Kazulkin's matched measurements put full API-Gateway-event priming at p50 604ms versus DynamoDB-request priming at p50 666ms — ~60ms — and invoke priming would require shipping a production code path that fabricates an authenticated identity without a verified JWT, then freezing whatever it touched into a snapshot persisted for up to 14 days. On a system §7 flags for COPPA review, 60ms does not buy that.

**Secrets never touch init or `afterRestore`.** Fetch lazily inside the handler with an in-memory cache. Two documented reasons: the `afterRestore` hook has a hard 10-second ceiling (exceeding it yields `SnapStartTimeoutException` → 408), and the Secrets Manager / Parameter Store Lambda extension is *explicitly incompatible* with SnapStart (it generates credentials during init → expired-credential 401s). MVP has no third-party secrets — SES/SNS/DynamoDB all authenticate via the execution role — so exposure is near zero today. It becomes load-bearing the moment Stripe arrives in Phase 2.

**All entropy and IDs are generated inside the handler**, never in a field initializer or `@Bean` method. Snapshots are cloned across every restored environment; anything unique created before the checkpoint is reused everywhere. Use `UUID.randomUUID()` / `SecureRandom` at request time. Add this to the pre-launch review checklist.

### 2. IaC — CDK TypeScript, with the build graph reattached

```json
{ "app": "npm run build:backend && npx ts-node --prefer-ts-exts bin/bladebook.ts" }
```

where `build:backend` is `mvn -q -f ../backend/pom.xml package`. This exists because there is **no `JavaFunction` L2 construct in any CDK binding** — verified: `@aws-cdk/aws-lambda-nodejs`, `aws-lambda-python-alpha`, and `aws-lambda-go-alpha` all exist; `aws-lambda-java-alpha` returns 404 on npm. Java asset wiring is hand-rolled regardless of language. In CDK-Java the Maven task *is* the app command, so the rebuild happens for free; in CDK-TS the app command is `ts-node` and has no dependency on Maven, so `cdk deploy` after a handler edit will happily upload the previously-built JAR with no error. Two lines of `cdk.json` restore that link. This was the strongest concrete objection to CDK-TS in the panel and it costs two lines to neutralize.

**Alias wiring is day-one, not later.** For each SnapStart function: enable SnapStart on published versions, create `new lambda.Alias(this, 'live', { version: fn.currentVersion })`, and integrate **the alias** with the HTTP API — never the unqualified function ARN. Two independent failure modes hinge on this: (a) pointing any consumer at the unqualified ARN invokes `$LATEST`, where SnapStart silently does not apply, with no error and no warning — the only symptom is `[$LATEST]` in CloudWatch and a 3–5 second wait for a client trying to book; (b) during a snapshot build the version is `Pending`, and direct invocation returns `409 ResourceConflictException` → a 500 through API Gateway. The alias keeps serving the previous version through that window. There is no staging environment, so getting this wrong means discovering a production 500 window in production.

`cdk-nag` (AwsSolutions pack) runs in CI and fails the build on wildcard actions, unencrypted buckets, missing Block Public Access, and missing TLS-only bucket policies — which is §7's checklist, automated.

### 3. Repo layout

```
bladebook/
├── docs/architecture.md, docs/adr/
├── backend/                 # Maven multi-module, Java 25, arm64 target
│   ├── core/                # framework-free: domain, DynamoDB, events
│   ├── api-coach/           # Spring Boot 4 → λ api-coach
│   ├── api-client/          # Spring Boot 4 → λ api-client
│   └── consumers/           # 4 plain RequestHandlers, one JAR
├── web/                     # React + TS + Vite      (npm workspace)
├── infra/                   # CDK TypeScript         (npm workspace)
├── package.json             # workspaces: ["web", "infra"]
└── Makefile                 # build / test / deploy / spike
```

`web` and `infra` are separate workspaces because they target different environments (DOM+bundler vs Node+ts-node) and need separate `tsconfig.json` files — sharing one is a persistent source of module-resolution confusion.

Locally, `api-coach` runs on `:8080` and `api-client` on `:8081` as ordinary `main()` processes; Vite proxies `/api/coach/*` → 8080 and `/api/client/*` → 8081. Local topology therefore matches production topology exactly, including the trust boundary between the two.

### 4. Coach timezone

**Store, from the very first write:**
- `Coach.coachTimezone` — required, non-null, IANA identifier (`America/New_York`). No default constant is ever read at runtime by scheduling logic; the onboarding form pre-fills from an SSM parameter, but the value written to the record is the source of truth.
- `Booking.startsAtUtc` — ISO-8601 instant, alongside the existing local-date key components.
- `Booking.coachTz` — denormalized onto the item at write time.

**Keep unchanged:** `SLOT#<date>#<startTime>#<slotId>` and `GSI2PK = DATE#<yyyy-mm-dd>` remain the coach's *local* date. "Everyone with a lesson today" means the coach's today; that is the correct partition and it does not change.

**MVP behavior:** one EventBridge Scheduler rule per job, pinned to the launch timezone using Scheduler's native IANA timezone support (`America/New_York`), which handles DST transitions for you — you will never write DST arithmetic. The reminder and report Lambdas read `booking.coachTz` and filter, rather than assuming.

**Generalization when a second timezone appears:** add one Scheduler rule per timezone group. Each fires at 7am/9pm local and queries `DATE#<today-in-that-tz>`, filtering results on `coachTz`. At tens of bookings/day globally, over-fetching a shared date partition and filtering client-side is free. **No data migration, no key redesign, no backfill.**

---

## Rationale

### Framework: why the cold-start argument does not decide this, and what does

The panel's decisive finding is one that no single advocate made but two independent skeptics converged on: **under primed SnapStart, framework choice buys almost nothing.** On matched pairs from the same author, same app, same 1024MB:

| Configuration | cold p50 | cold p99 |
|---|---|---|
| Quarkus JVM + SnapStart + DynamoDB priming | 666 ms | 1117 ms |
| Quarkus native (GraalVM) | 563 ms | 606 ms |
| Micronaut 4 + SnapStart + DynamoDB priming | 743 ms | 1300 ms |
| Micronaut 4 + SnapStart + API-GW event priming | 696 ms | 918 ms |
| Micronaut 4 native | 687 ms | 884 ms |

Primed SnapStart lands every framework in a ~660–750ms p50 band. Native buys ~100ms at p50. SnapStart snapshots the *result* of initialization, which is precisely the thing Quarkus and Micronaut optimize — their entire architectural pitch is largely snapshotted away. The Micronaut advocate stated this against itself: *"The dominant variable is priming quality, not framework."* The Quarkus critic reached the same conclusion independently: *"The profile exists to buy ~100ms at p50."*

Once latency is off the table, the remaining axes are ecosystem, support policy, and who patches what — and Spring Boot wins all three:

- **Ecosystem.** Conceded by both rival advocates unprompted. For a solo dev leaning on AI assistance and search, this is the compounding variable.
- **Support policy.** Spring publishes explicit support windows. Quarkus publishes an LTS cadence (6-month lines, 12-month support). Micronaut, per `endoflife.date`, *"no longer publicly available"* — only the newest major gets security updates, Micronaut 4 active development ended 2026-05-13, and Micronaut 5 is ten weeks old and already at 5.1.10. An unbounded, unscheduled, security-forced major upgrade every ~2–3 years with no published notice window is not something a solo developer on a child-data system should sign up for. **Micronaut is eliminated on this, not on latency.**
- **Runtime patching.** Managed `java25` means AWS patches the JVM through 2029-06-30. GraalVM native on `provided.al2023` means *you* rebuild and redeploy every function on every GraalVM/JDK CVE. **Quarkus native is eliminated on this**, reinforced by 5–15 minute builds (per the very benchmark that advocated for it), no attachable debugger, hand-written Docker `BundlingOptions`, and the fact that Quarkus's *current official* Lambda guide still documents the `provided` runtime that AWS create-blocked in February 2024 — with the tracking issue (quarkus#48034) open, unassigned, and unanswered for 14 months.

That leaves Spring Boot 4 + SnapStart versus Quarkus JVM + SnapStart, separated by ~80ms p50 and a large ecosystem gap. Spring wins.

### Skeptic objections I accepted

**Accepted: the Spring Boot 3.x recipe is EOL, and the "you already know it" pitch is weaker than advertised.** The Spring advocate's exact citation — `aws-serverless-java-container-springboot3` 2.1.5 on Spring Boot 3.4.5 — is dead: all Boot 3.x lines lost OSS support at end of 2025, and the container project deleted its `springboot3` modules in 3.0.2. The supported path is Boot 4 / Spring Framework 7 / Jakarta EE 11 / Jackson 3, which is thin in blog coverage and thin in training data. **This is reflected in the decision (Boot 4, container 3.x) but I discount its weight**, for a reason the critic missed: Micronaut 5 *also* forced Jackson 3 and a Java 25 baseline, and the whole Java ecosystem is mid-migration. Jackson 3 is a floor across the field, not a Spring-specific tax. And Boot 3→4 changes dependencies and module structure, not the programming model — `@RestController`, constructor DI, and bean validation transfer essentially unchanged. That is a far smaller delta than learning compile-time DI in a new framework.

**Accepted, and it drove the architecture: the "one Spring app locally" pitch contradicts §7's per-Lambda least privilege.** The Spring critic was right that you cannot have both a single `DispatcherServlet` Lambda and per-function IAM roles, and that the advocate presented both as if you could. My resolution splits the difference at **two** API contexts rather than four — along the trust boundary that actually matters (coach-authenticated vs client-authenticated), not along routes — and moves the four async consumers out of Spring entirely. Two contexts means two snapshot builds (~4–10 min per deploy, not 8–20), two local processes, and a Vite proxy that makes local topology *identical* to production. The union-role problem is confined to "everything a coach can do to their own tenant," which is a defensible boundary you can point at during legal review.

**Accepted: the published cold-start numbers do not describe BladeBook.** Three independent critics landed on this from three different angles — wrong data path (RDS-in-VPC vs DynamoDB-over-public-TLS), wrong traffic shape (concurrency scale-up vs multi-hour idle), and wrong runtime (Java 21 measurements applied to a Java 25 stack). The correct planning posture is *"unknown, plausibly 1–3s, and nobody has measured it."* This is why the decision carries a mandatory measurement gate and a pre-named fallback ladder rather than a confident number.

**Accepted: the 14-day snapshot expiry is worse than advertised.** AWS's troubleshooting page: *"Your function version becomes Inactive when it hasn't been invoked for 14 days **or when Lambda periodically recycles the execution environment**."* The next invocation returns `SnapStartNotReadyException` — an error, not a slow response — and AWS's own remedy is "wait until the function version reaches the Active state." There is no published frequency or SLA for that second trigger, so a keep-warm cron is a partial mitigation, not a fix. This drove three design choices: SnapStart is **off** on the four async consumers (no snapshot, no expiry, no risk, and nobody cares if the 9pm report takes 4 seconds); an EventBridge Scheduler rule pings both API aliases every 3 days at effectively $0; and the React client must retry once on a 5xx for idempotent GETs, with the booking POST carrying a client-generated idempotency key so a retry is safe. That last item is free — §6.1 already uses a conditional `TransactWriteItems`, so the write is already designed to be safely re-attemptable.

**Accepted: invoke priming has a child-data dimension nobody raised.** Snapshots are persisted, replicated memory images retained up to 14 days. Anything a priming invoke pulls into memory lives there. Combined with the need to fabricate an authenticated identity to prime a JWT-protected route, this is a bad trade for ~60ms. Hence SDK-level priming against a synthetic empty partition.

**Accepted: CDK-TS severs the build graph.** Fixed in `cdk.json` as described. This was the only genuinely new objection to CDK-TS in the panel, and it is two lines.

### Objections I rejected or discounted

**Rejected: `aws-cdk#26604` as evidence CDK-Java is unstable.** The Micronaut critic checked it — opened and closed within two hours, three years ago. Using it to steer a 2026 decision is not honest evidence. CDK-TS wins on jsii-native authorship, TS-first documentation, unconditional Construct Hub TS publishing, `cdk-nag`, and AI-assist quality — it does not need a fabricated stability argument.

**Discounted: "CDK's transitive npm tree is a supply-chain surface."** `aws-cdk-lib` has ~15 direct dependencies and bundles the rest. The Micronaut advocate conceded a cost that is largely not there. Dependabot on the workspace covers it.

**Discounted: the k-i-soft finding that SnapStart *regresses* cold duration on DynamoDB paths (5463ms vs 3320ms), attributed to dead sockets in the snapshot.** It is directly on point — the only recent public measurement on BladeBook's actual data path — but it is a single unreplicated blog whose SnapStart configuration cannot be inspected, and whose priming result (dismissed as "within noise") contradicts Kazulkin's controlled 2.5× priming improvement on the same framework. I do not plan around it, but it is a named trigger in the spike's failure criteria, because if it is right, SnapStart is the wrong tool here and I want to find that out in week one.

**Discounted: "native cold start is flat across memory."** True and mechanistically sound (390/387/390ms at 512/1024/1769MB), but the Quarkus advocate's own cost section then concedes the resulting saving is "cents/month" and the profile is "budget-neutral in AWS dollars." A true fact that does no work.

### IaC and repo layout

CDK-TypeScript was the one point of unanimous agreement across all three critiques, and I found nothing to argue with: CDK is authored in TS with all other bindings jsii-generated, every AWS example and Construct Hub README is TS-first, `cdk-nag` and the `grant*` least-privilege ergonomics are best-exercised there, and TS is already in the repo for React. The "second heavyweight backend language" constraint does not bind on a few thousand lines of infra you touch occasionally — this is one backend language (Java) plus one non-backend language (TypeScript) used for both things that aren't backend logic. The missing `JavaFunction` L2 is a wash: it is absent from every binding.

Monorepo drew no dissent and needs little defense at this size: one commit spans a schema change, its handler, its IAM grant, and its UI. The one real cost — three toolchains in the inner loop (Maven, npm×2) — is inherent to Java-backend + React-frontend and is not created by the monorepo.

### Timezone

**The panel did not cover this; the following is reasoning from §5 and §8 directly, not from panel evidence.**

§11's default lean is "single tz for MVP," and §8 says "MVP can assume a single timezone and generalize later." That is right about the *scheduler* and wrong about the *data*, and conflating the two is how this becomes expensive.

The scheduler half is genuinely cheap to defer: going from one Scheduler rule to N is additive configuration, no code redesign. Defer it.

The data half is not. If bookings are written as naked local date/time strings with no record of which timezone they were written in, then the day a second coach signs up in a different timezone, every historical row becomes ambiguous — and you cannot recover the answer, because the information was never captured. That is a genuine one-way door, and it costs one required field on the coach record plus one attribute on the booking to avoid entirely. Storing `startsAtUtc` alongside the local-date keys costs nothing at write time and makes the eventual "list bookings across timezones" query trivially correct.

So the call is not "single tz" or "per-coach tz" — it is **per-coach in the model, single-tz in the cron**, which pays ~an hour of work now to delete a data migration later. §10 already lists "Multi-timezone scheduling" as Phase 2+; this decision makes that a Phase 2 feature rather than a Phase 2 archaeology project.

---

## Consequences

### What this makes easy

- **§7 falls out of the structure rather than requiring discipline.** Six functions, six roles, no wildcards, and the narrow ones are genuinely narrow — `sched-daily-report` holds `Query` on GSI2 + `ses:SendEmail` + `s3:PutObject` on one prefix and nothing else. That is a control you point a lawyer at, not an assertion about code.
- **Four Lambdas have no cold-start problem at all**, because they have no framework and no latency requirement. Plain `RequestHandler` classes over `core/` will start in the low hundreds of milliseconds and cost nothing to reason about.
- **Two snapshot builds per deploy**, not four or eight. `cdk deploy` is a short break, not a coffee run.
- **Local development mirrors production.** Two `main()` processes, two Vite proxy rules, a real JVM debugger on the actual production code path. No SAM, no Docker, no LocalStack, no Lambda emulation for logic work.
- **One artifact backs four functions** with four roles — the pattern the Quarkus advocate praised as its cleanest security argument, obtained here with no framework feature, just four handler entry points in one JAR.
- **Adding a timezone is additive config.** One more Scheduler rule. No migration.

### What this makes hard

- **You are on Spring Boot 4 / Framework 7 / Jakarta EE 11 / Jackson 3, not the Spring in the tutorials.** Expect search results and AI suggestions to be Boot 3-shaped and to need translation, especially around Jackson 2→3 and the `aws-lambda-java-events` classpath. Budget real time for the first week of setup; the programming model transfers, the dependency graph does not.
- **SnapStart has sharp edges that only bite in production.** The alias wiring, the `$LATEST` silent-no-op, the `Pending`-window 500, the 10-second `afterRestore` ceiling, the Secrets Manager extension incompatibility, and the entropy-in-init trap are all one-time-correct-then-forever-fine — but each is discovered alone if you get it wrong. They are enumerated in the Decision section specifically so they become a setup checklist rather than a series of 11pm surprises.
- **A keep-warm cron exists**, which is aesthetically the thing serverless was supposed to eliminate. It costs ~$0 and it is not optional.
- **Deploy is Maven-then-CDK**, glued by `cdk.json`, forever, because no `JavaFunction` L2 exists.
- **You maintain two test stacks**: JUnit + DynamoDB Local for `backend/`, Jest + CDK `assertions` for `infra/`.

### What this forecloses — and what it deliberately does not

**Forecloses:** provisioned concurrency (incompatible with SnapStart), EFS, and >512MB ephemeral storage on the API functions. Lambda Managed Instances (which does eliminate Java cold starts outright — AWS benchmarked Spring Boot 4.0.6 / Java 25 at a 487ms *worst warm* request) is EC2-instance-billed, only beats standard Lambda above ~9 req/s, and is disqualified by the budget constraint. It remains a known future exit, not an option today.

**Explicitly does not foreclose the framework choice.** `core/` is framework-free by mandate — plain Java, AWS SDK v2, zero Spring annotations below the controller layer. This is the single most valuable thing in this ADR and it is free. If the spike or production tells us Spring + SnapStart cannot meet the latency bar, the fallback is a **controller-layer swap on two functions**, not a rewrite: the domain model, DynamoDB access, key construction, event serialization, transaction logic, and every test against them survive untouched. The Spring critic's sharpest line was *"it is cheap to enter, expensive to leave."* Keeping `core/` clean is what makes it cheap to leave, and it is the reason this decision can be made confidently despite resting on benchmarks that were not run against this database.

### Day-one spike (mandatory, before any feature work)

Deploy one throwaway `api-client`-shaped endpoint: Spring Boot 4, `java25`, arm64, SnapStart on, SDK priming in `beforeCheckpoint`, doing a real DynamoDB `Query`, behind an alias behind the HTTP API. Then **leave it alone overnight** — at minimum 12 hours, ideally 48 and again at 14+ days — and measure restore-to-response from a genuine cold start. Do not use a load generator; a load test measures the wrong thing and is the exact flaw in every benchmark this decision had available.

- **Pass:** p99 ≤ 1.5s after ≥12h idle, no `SnapStartNotReadyException`.
- **Investigate:** p99 in 1.5–2.5s → walk the fallback ladder.
- **Fail:** p99 > 2.5s, or SnapStart measurably slower than the same function with SnapStart off (the dead-socket regression) → the premise is wrong; escalate to step 3 immediately, while there are zero features to port.

**Fallback ladder, named now so it is not invented under pressure:**
1. Verify priming actually executes (check `Restore Duration` in the REPORT line) and that traffic is hitting the alias, not `$LATEST`.
2. Raise memory to 1769MB. Cold start improves materially with memory on JVM workloads and costs pennies at this volume.
3. Port the two API functions to **Quarkus JVM on `java25` + SnapStart + the same priming** — `core/` is untouched, so this is controllers and DI wiring only.
4. Last resort: **Quarkus native for those two functions only**, accepting GraalVM patching duty on two functions rather than six. The four consumers stay on the managed runtime regardless.

---

## Revisit if

**Latency / SnapStart**
- The day-one spike returns p99 > 1.5s after ≥12h idle, or SnapStart measures slower than no-SnapStart on the DynamoDB path.
- A single `SnapStartNotReadyException` or `SnapStartTimeoutException` appears in CloudWatch on a user-facing path — this means the keep-warm cron is insufficient and the undocumented environment-recycle trigger is real for us.
- `[$LATEST]` appears in CloudWatch logs for `api-coach` or `api-client` — alias wiring has silently broken and SnapStart is not applying.
- AWS publishes SnapStart restore benchmarks for genuinely low-frequency invocation and they contradict the spike in either direction.

**Ecosystem / support**
- The Spring Boot 4.x line approaches EOL without a clean 4.x→5 upgrade path, or `aws-serverless-java-container` 3.x stops shipping releases (it is the newest and least-proven dependency in this stack — check quarterly).
- CDK ships a first-party `JavaFunction` L2 — drop the `cdk.json` Maven glue.
- The `java25` managed runtime approaches its 2029-06-30 deprecation.

**Scale / scope**
- Sustained traffic exceeds ~9 req/s, at which point Lambda Managed Instances becomes cheaper than the entire cold-start mitigation stack and eliminates the problem outright. Re-run the budget math.
- A coach signs up outside the launch timezone → add Scheduler rules (config change; the data model already handles it, and this is *not* a reopening of decision #4).
- ~~The Phase-2 check-in app becomes a third frontend surface~~ → **this trigger has fired.** The check-in app was moved into MVP scope on 2026-08-30, so `web/` carries three surfaces from day one rather than two. See the amendment below.
- **The IaC choice in amendment A4 is made** → decision 2 is either confirmed or replaced. Until then neither CDK nor Terraform is settled.
- Phase-2 payments (Stripe) land → real third-party secrets enter the system for the first time, so re-verify the secrets/SnapStart interaction end to end before that code ships. This is currently untested because MVP has nothing to test it with.

**Cost**
- The monthly bill exceeds $10 idle. Most likely culprits in order: WAF (if enabled, +$8–15 — a §7 recommendation that is out of scope here and needs its own decision), the SMS number, and CloudFront.

---

## Assumptions I could not verify

Flagged explicitly, in rough order of how much damage each would do if wrong:

1. **No published measurement exists of SnapStart restore latency after multi-hour idle** — the only scenario BladeBook will ever produce. Every number in the panel comes from concurrency-scale-up load tests or a VPC/RDS workload. **This is the largest unverified assumption in the entire decision** and is the sole reason the day-one spike is mandatory rather than advisory.
2. **Spring Boot 4.x + `aws-serverless-java-container` 3.x + SnapStart on the `java25` managed runtime has no published benchmark or field report I could find.** All cited Spring/SnapStart numbers are Boot 3 on Java 21. Java 25 removed the C1-only tiered-compilation cap for SnapStart, which should help post-restore warmup, but the direction and magnitude for this combination are unmeasured.
3. **The user's prior Spring experience is unknown.** The Spring advocate assumed familiarity; the constraints only state that Java is the known language. This decision is deliberately robust to that gap — Spring wins on corpus depth and AI-assist quality *independently* of prior familiarity, which is the axis that matters most when you have never used a framework before. But if there is substantial existing Quarkus or Micronaut experience, that changes the weighting materially and this decision should be revisited before the spike.
4. **The `aws-serverless-java-container` 3.x release notes** (Spring Framework 7 / Boot 4 / Jakarta EE 11 support, the Jackson 2→3 break in 3.0.0, the `springboot3` module removal in 3.0.2) are reported via the panel's skeptic; I did not read the repository directly. Verify before writing the first `pom.xml`.
5. **The k-i-soft DynamoDB/dead-socket regression finding is a single unreplicated blog post** whose SnapStart configuration cannot be inspected, and whose "priming is within noise" conclusion contradicts a better-controlled measurement. Treated as a spike failure criterion, not as a planning input.
6. **The `provided.al2` deprecation date of 2026-07-31** — three days from today — is reported by the panel and not independently confirmed. It does not affect this decision (we are on the `java25` managed runtime), but it is why the Quarkus-native path is even less attractive than it appears.
7. **Lambda's "periodic execution environment recycle" trigger for the `Inactive` state has no published frequency or SLA.** The keep-warm cron addresses the 14-day timer only. The client-side retry-once-on-5xx is the actual mitigation for the undocumented one.
8. **EventBridge Scheduler's native IANA timezone support handles DST transitions correctly** for the 7am/9pm rules. This is documented behavior but untested by us; verify with a single rule spanning the next DST boundary before relying on it for reminders.