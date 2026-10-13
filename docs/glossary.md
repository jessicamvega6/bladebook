# BladeBook — Glossary

Every acronym and abbreviation used in `architecture.md` and `adr/`. Where a term
carries a project-specific meaning, the third column says what it means *here*
rather than in general.

For domain terms that are **not** acronyms — student, client, `clientRelationship`,
`isMinor` — see §0 of [architecture.md](architecture.md). The **individual values** of the
model's enumerations are defined here, in [Enumerated values](#enumerated-values).

---

## Project & document conventions

| Term | Stands for | In BladeBook |
|---|---|---|
| **Coach website** | *(not an acronym)* | The coach's side of the BladeBook website, used at a desk: schedule editor, week and month views, student roster and `PENDING` approvals, payment dashboard, lesson list, profile. Calls `api-coach`. **Use this term, not "coach app"**, which the older documents used for both surfaces. |
| **Rinkside app** | *(not an acronym)* | The page a coach uses at the rink, at `/coach/rinkside` in the coach website (ADR-023) — also called the **check-in app**. A web page, not a native app, opened in the phone's ordinary browser (Safari or Chrome) from a link or bookmark. *Users are not expected to add it to the home screen (owner, 2026-10-12): they are older, so nothing may depend on it.* and the subject of `FeatureDecriptions/Coach App`. Today's lessons, check-in and no-show, guardian contacts fetched on a tap when there is signal (never cached — ADR-014 decision 9b), and lesson cancellation; works offline (ADR-014). Uses the coach website's sign-in and calls `api-coach` (ADR-023, superseding ADR-014 decisions 10–11). |
| **Client website** | *(not an acronym)* | The client's side of the website: sign-up with a coach code, booking, My Bookings, cancellation and recurrence management, profile. Calls `api-client`. |
| **Dev environment** | *(not an acronym)* | A full second stack — its own table, functions, API, Cognito pool and site — built from the same infrastructure code as production **when there is work for it, and destroyed when that work is done** (ADR-027). One at a time. Its table is created from one import file when it is built: seed data by default, or a masked subset of production on request (`build-dev --masked`), under ADR-011's masking rules — never both (ADR-028). Replaced the long-running **staging** environment on 2026-10-07: production is the only long-running environment. Each masked file is prepared by an AWS Step Functions workflow in the data-loading stack (ADR-027, amended 2026-10-09). |
| **ADR** | Architecture Decision Record | A numbered document capturing one significant decision, why it was made, and what it costs. Append-only: a changed decision gets a new ADR marking the old one "Superseded," rather than an edit. Lives in `docs/adr/`. |
| **MVP** | Minimum Viable Product | Phase 1 in §10 — the sixteen features that must ship before anything else, which has grown from the original eight. |
| **`missedLessonFeeMinor`** | *(not an acronym)* | *Formerly `lateFeeMinor`, renamed 2026-09-30.* The fee for a **missed lesson** — a no-show, or a client's cancellation inside the coach's notice period — one amount for both, in minor units, set **per block in the schedule builder** and stamped on the booking at creation beside `priceMinor` (ADR-015). `0` means no charge — the amount is its own off switch. Stamped so a later policy change cannot rewrite what a client agreed to when they booked. |
| **`settleReminderSentOn`** | *(not an acronym)* | The date the coach was emailed that this lesson is still unpaid (ADR-018). Stamped on the booking so the weekly reminder lists each lesson once, when it first crosses the threshold, rather than every week. |
| **`expiresAt`** | *(not an acronym)* | The table's Time to Live (TTL) attribute: when this item may be deleted, in seconds since 1970. Set per item from a per-item-type window in configuration; absent means never. Set on **settlement**, not creation, for bookings and chargeable cancellation lines, so an unpaid lesson never expires (ADR-017 decision 2). |
| **`bookedIntervalWeeks`** | *(not an acronym)* | The recurrence interval, in weeks, that a lesson was **booked under** — stamped on each occurrence at creation and never updated (ADR-006 decision 4b). **Not the current frequency:** after a client reduces weekly to fortnightly, the remaining lessons still say 1 and the `RECURRENCE#` header says 2. Read only to rebuild a header that was never written. Stamped for the same reason as `priceMinor` — a fact about the moment of booking. |
| **`requiredNoticeHours`** | *(not an acronym)* | *Formerly `lateCancellationHours`, renamed 2026-09-30.* The notice threshold below which a client's own cancellation is charged — from any screen — a coach-level policy, stamped on the booking alongside `missedLessonFeeMinor` (ADR-015 decisions 1a and 3). Stored with it because `noticeHours` alone is meaningless without the threshold it was judged against. Not to be confused with **`noticeHours`**, which nobody sets: it is measured on each cancellation as the gap between `cancelledAt` and the lesson's start. A cancellation is late when `noticeHours < requiredNoticeHours`. |
| **Redrive** | *(not an acronym)* | Sending a message from a dead-letter queue back to the function that failed on it. `redrive-dlq --function <name> [--dry-run]` does it per ADR-010 decision 2a's table — replay, discard, or re-run for the message's date. Never used for the schedule-change consumer, whose recovery is **Reconcile**. |
| **Reconcile** | *(not an acronym)* | `reconcile-schedule --coach <id> [--dry-run]`: the operator's recovery for a failed or lost schedule change (ADR-010 decision 5j). First finishes the coach's unfinished change batches, then checks the current schedule against every upcoming booking and fixes what doesn't match. Safe to run at any time; a second run does nothing. |
| **`WAIVED`** | *(not an acronym)* | A third `paymentStatus` beside `UNPAID` and `PAID` — the coach forgave the charge, so no money is expected (ADR-003, amended 2026-08-30). **Not a refund:** waiving decides money was never owed and is a state change on one booking; a refund returns money already received and would need the ledger this model deliberately does not have. Drops the booking out of the sparse unpaid index exactly as `PAID` does. |
| **PENDING** | *(not an acronym)* | A bucket in the 9pm end-of-day report, **not** a booking status — a lesson whose outcome the coach never recorded, or recorded on a phone that has not regained signal. Reported as unknown rather than as a no-show, so a phone that stops syncing is visible instead of silently accusing students of missing lessons (ADR-014 decision 7). |
| **Service worker** | *(not an acronym)* | A script the browser runs alongside a page, able to serve it from cache when the network is unavailable. ADR-014 decision 5 uses one so the check-in app **opens** inside a rink with no signal; without it, offline capture is pointless because the coach never reaches the page. Scoped to the rinkside page (`/coach/rinkside/`) only. |
| **Offline queue** | *(not an acronym)* | Attendance outcomes recorded on the device while it has no connectivity, held in device storage and replayed when signal returns (ADR-014 decision 1). The only data in BladeBook that exists in exactly one place, on a phone. |
| **Idempotent** | *(not an acronym)* | Safe to apply more than once with the same result. Attendance replay is made idempotent by a conditional write requiring the booking to still be `BOOKED` (ADR-014 decision 3), so a duplicated replay cannot send a family a second payment reminder. |
| **IaC** | Infrastructure as Code | Defining AWS resources in a programming language rather than clicking the console, so infrastructure is reviewable and reproducible. CDK or Terraform — **undecided** (ADR-001 A4). |
| **EIN** | Employer Identification Number | A United States tax identifier. Considered as a gate on coach signup and **rejected** (ADR-016 decision 1): there is no public way to verify one, and a Canadian business has a Canada Revenue Agency Business Number instead. Not collected. |
| **Reply-To** | *(not an acronym)* | The email header naming where a reply goes, as distinct from who sent it. Set to the coach's `businessEmail` on every client-facing message (ADR-016 decision 8) so a family replying to an automated email reaches their coach. The envelope sender stays the application's verified domain. |
| **HCL** | HashiCorp Configuration Language | Terraform's language. Not a general-purpose one — repetition is `for_each` rather than a loop, which is the main ergonomic difference from CDK when standing up fourteen similar Lambda functions. Under evaluation, not adopted (ADR-001 A4). |
| **CI** | Continuous Integration | Automated build/test on push. Where `cdk-nag` runs as a build gate. |
| **UI / UX** | User Interface / User Experience | UX appears in the ADR to distinguish "cold start is a latency problem the user feels" from "cold start is a cost problem," which it isn't. |
| **AI** | Artificial Intelligence | Used specifically to mean "how well an AI coding assistant can help with this framework," which the ADR treats as a real selection criterion for a solo developer. |
| **CSV** | Comma-Separated Values | The financial page's summary export: one row per month, no personal data (ADR-030 decision 7). |
| **YTD** | Year to Date | The financial page's totals for the calendar year: gross (money received) and rink fees, calculated by BladeBook (MVP feature 16; Open-Pending §3, `Q_Rink-Fees.md`). |
| **PCC** | Pelham Civic Center | The one rink in Phase 1; the schedule builder's rink is fixed to it until rink selection ships (Phase 2). |
| **FS** | Figure Skating | Used beside hockey where the two are priced differently, as in rink fees (`Q_Rink-Fees.md`). |
| **BFSC** | Birmingham Figure Skating Club | The club whose freestyle ice is one of PCC's ice types. |
| **USFSA** | United States Figure Skating Association | The old name of US Figure Skating, still widely used. With USA Hockey, one of the two organisations whose number every skater must give in Phase 1 (Open-Pending §2b). |
| **S&P** | Stick and Puck | A hockey practice session; one of PCC's ice types, which can carry its own rink rate. |
| **SOD / EOD** | Start of Day / End of Day | Schedule-builder fields: the first and last time a tab's lessons may run (ADR-008). |
| **LL / LC** | Lesson Length / Lesson Cost | Schedule-builder fields: a tab's lesson length in minutes and its price (ADR-008). |
| **MF** | Missed-lesson Fee | Schedule-builder field: a tab's charge for a no-show or late cancellation (ADR-008, ADR-015). |
| **SD / ED** | Start Date / End Date | Schedule-builder fields for a temporary tab (ADR-008). |
| **USD / CAD** | US Dollar / Canadian Dollar | The two currencies a coach can choose at sign-up; stamped onto every booking. |
| **RFC** | Request for Comments | An internet standard; RFC 2606 reserves `example.com`, which masked emails use. |
| **HTML** | HyperText Markup Language | The format of the web pages and of BladeBook's emails. |
| **URL** | Uniform Resource Locator | A web address. |
| **PIT** | *(PITest, a tool name)* | The mutation-testing tool run on `core/` (ADR-013). Not to be confused with PITR. |
| **CLI** | Command-Line Interface | A program run by typing commands in a terminal, such as the operator's `reconcile-schedule` and `build-dev`. |
| **GB / MB** | Gigabyte / Megabyte | Units of data size, used in storage and cost estimates. |

---

## AWS platform

| Term | Stands for | In BladeBook |
|---|---|---|
| **AWS** | Amazon Web Services | The only cloud provider in the design. |
| **TTL** | Time to Live | DynamoDB's built-in expiry. The table names one attribute — here `expiresAt`, in seconds since 1970 — and DynamoDB deletes each item some time after the timestamp it carries, typically **within a few days**, at no write cost. Items without the attribute never expire. Unlike an S3 lifecycle rule, it is per item: changing a policy does not re-date items already written (ADR-017). |
| **Deep Archive** | *(S3 Glacier Deep Archive — a storage class, not an acronym)* | S3's cheapest, slowest storage. Reading an object needs a **restore taking up to 12 hours**, objects are billed for at least 180 days, and each is billed as at least about 40 KB. Used for the archive of expired items, for the friction rather than the price: archived children's data cannot be read casually (ADR-017 decision 6). |
| **IAM** | Identity and Access Management | AWS's permission system. §7 mandates one IAM **role** per Lambda, each granted only the actions that function needs — no wildcards. |
| **AWS Organization** | *(not an acronym)* | AWS's grouping of several accounts under one owner. BladeBook has two: production and dev (ADR-027 d8). |
| **Stack** | *(not an acronym)* | A group of AWS resources that the infrastructure code creates, updates and deletes together, as one unit, inside one account: a CloudFormation stack in CDK, a separate configuration with its own state in Terraform. A stack groups what changes together; it is **not** a security boundary — an account is. The production account holds the **application stack** (deployed often) and the **data-loading stack** (the masking workflow, transform Lambda, export and masked buckets, load log and dev's access-log bucket; deployed rarely, ADR-027 d9). The dev account holds an **account stack** (Cognito and test accounts) and an **application stack** built from the seed or masked file and destroyed afterwards (ADR-028). |
| **IAM Identity Center** | *(not an acronym)* | AWS's single sign-in across the accounts in an Organization, with multi-factor authentication (ADR-027 d8). |
| **DNS** | Domain Name System | Maps names to addresses. The domain's zone is in production; `dev.<domain>` is delegated to the dev account (ADR-027 d8). |
| **ARN** | Amazon Resource Name | The unique identifier for any AWS resource. Relevant because invoking a Lambda's *unqualified* ARN silently bypasses SnapStart — always point at the alias. |
| **VPC** | Virtual Private Cloud | A private network inside AWS. BladeBook deliberately uses **no** VPC: it's what would force a NAT Gateway and blow the budget. |
| **NAT** | Network Address Translation | NAT Gateway lets resources inside a VPC reach the internet — ~$32/month, always on. Avoiding it is the single biggest cost decision in §2. |
| **S3** | Simple Storage Service | Object storage. Hosts the React build, the daily report archive, the TTL archive (ADR-017), and the dev load's export and masked buckets (ADR-027). |
| **SES** | Simple Email Service | Email delivery. The primary notification channel. |
| **SNS** | Simple Notification Service | Used here only for SMS, opted into per phone number (ADR-007 decision 8a). |
| **KMS** | Key Management Service | Encryption key management. The table and every bucket use AWS-managed keys (`aws/dynamodb`, `aws/s3`). |
| **CMK** | Customer Managed Key | A KMS key you create and control, versus an AWS-managed default. §7 allows either. |
| **SSE-KMS** | Server-Side Encryption with KMS | Encryption-at-rest mode used for every S3 bucket, with the AWS-managed `aws/s3` key. |
| **WAF** | Web Application Firewall | **In MVP** (ADR-019): one web ACL on the REST API's stage and the Cognito user pool, with AWS managed rules (SQLi/XSS, known bad inputs, IP reputation) and per-address rate limits. The reason the API is a REST API: WAF cannot attach to an HTTP API. ~$10/mo per environment. |
| **CORS** | Cross-Origin Resource Sharing | The browser rule that a page on one domain may call an API on another only if the API says so. Needed because the site (CloudFront) and the API (API Gateway) are on different addresses (ADR-019). |
| **ACL** | Access Control List | Here, a WAF **web ACL**: the set of rules attached to the API's stage and the Cognito user pool (ADR-019). |
| **CDN** | Content Delivery Network | CloudFront — caches the static React site at edge locations. |
| **CDK** | Cloud Development Kit | AWS's IaC framework. ADR-001 chose the **TypeScript** binding; re-opened against Terraform by A4 (undecided). |
| **L2** | CDK "Level 2" construct | An opinionated, high-level CDK class with sensible defaults. For some runtimes it also builds your code: `NodejsFunction` takes a `.ts` entry point and runs esbuild for you. **No `JavaFunction` L2 exists in any CDK language** (`aws-lambda-java-alpha` is not published), so for Java you run Maven yourself and hand `Code.fromAsset()` a path to the built JAR. That cost is identical in CDK-Java and CDK-TypeScript, so it can't favour either — but it's why `cdk.json` has to invoke Maven, or CDK will happily deploy a stale JAR. |
| **jsii** | JavaScript Interop Interface | The tool that generates CDK's Java/Python/.NET bindings from the TypeScript source. Why TypeScript is the most mature CDK language: it's the original, the rest are generated. |
| **cdk-nag** | *(not an acronym — a tool name)* | Rule packs that fail a CDK build on wildcard IAM actions, unencrypted buckets, missing Block Public Access. Automates most of §7's checklist. |
| **SAM** | Serverless Application Model | An AWS IaC alternative to CDK, considered and not chosen. |
| **SSM** | AWS Systems Manager | Parameter Store — holds the default coach timezone used to pre-fill onboarding. |
| **PITR** | Point-in-Time Recovery | A DynamoDB feature that continuously captures changes and lets a table be restored to any second in the last **35 days**. **On**, with deletion protection (ADR-010 d7). It is the only thing that would recover from a bug in the schedule-change cancellation consumer, whose job is to delete bookings in bulk. Restores to a **new** table, never in place, so using it is a runbook rather than a button. |
| **DLQ** | Dead-Letter Queue | Where a message goes after its retries are exhausted. ADR-010 gives one to every asynchronous consumer. The unit is *queue + depth alarm*, never the queue alone — a dead-letter queue nobody drains is a silent failure with extra steps. |
| **Dead man's switch** | *(not an acronym)* | Named for the train control that brakes when the driver lets go: **inaction produces the safe outcome**. In ADR-010 it is how a cron that fails to fire is detected — a job that does not run emits no error and no metric datapoint, so there is nothing to alarm on. Instead the alarm watches for *evidence of life* (an `Invocations` datapoint) and fires when the heartbeat stops. |
| **`treatMissingData`** | *(CloudWatch alarm setting)* | How an alarm reads an absence of data. Must be **`breaching`** for a dead man's switch. The default, `missing`, ignores gaps — producing an alarm that is visible, configured, and structurally incapable of firing, which is worse than no alarm because it looks like coverage. |
| **RDS** | Relational Database Service | Managed Postgres/MySQL. Not used — it's the ~$20–45/mo option DynamoDB replaced. Appears in the ADR because AWS's headline SnapStart benchmarks were measured against it, on a data path BladeBook doesn't have. |
| **EC2** | Elastic Compute Cloud | Ordinary virtual machines. Relevant only as the billing model behind Lambda Managed Instances, which is disqualified on budget. |
| **EFS** | Elastic File System | Network filesystem for Lambda. Foreclosed by SnapStart. |
| **AZ** | Availability Zone | One of the separate data centres within an AWS region; AWS services such as DynamoDB and Lambda spread across several (ADR-010). |
| **STS** | Security Token Service | The AWS service that issues temporary credentials. Each API request assumes a tenant role through it (ADR-021, ADR-022). |
| **SLA** | Service Level Agreement | A published guarantee. Cited as *absent*: AWS documents no frequency for the environment recycle that can invalidate a SnapStart snapshot. |
| **`$LATEST`** | *(Lambda's reserved version name)* | The unpublished working version of a function. **SnapStart does not apply to `$LATEST`** — it silently does nothing, with no error. Seeing `[$LATEST]` in CloudWatch logs means the alias wiring broke and users are waiting seconds to book. |
| **Alias** | *(not an acronym)* | A named pointer to a published Lambda version (`live`). API Gateway must integrate with the **alias**, never the unqualified function ARN — this is what makes SnapStart apply and what keeps the previous version serving during a snapshot build. |
| **λ** | *(symbol, not acronym)* | Denotes a Lambda function in the §3 architecture diagram. |

---

## Data layer

| Term | Stands for | In BladeBook |
|---|---|---|
| **DDB** | DynamoDB | Shorthand in diagrams. (DynamoDB itself is a product name, not an acronym.) |
| **PK** | Partition Key | First half of a DynamoDB primary key; determines which physical partition an item lives on. Ours is `COACH#<coachId>`, which is what structurally isolates one coach's data from another's. |
| **SK** | Sort Key | Second half. Enables range queries like `begins_with(SK, "STUDENT#")`. |
| **GSI** | Global Secondary Index | An alternate key layout over the same table, enabling queries the main keys can't serve. |
| **GSI1** | — | "By client" — client-facing views. `GSI1PK = CLIENT#<clientId>`. Keyed by student until ADR-022 re-keyed it so the database can hold a client to their own bookings. |
| **GSI2** | — | "By date, global" — the one that makes cross-coach "everyone with a lesson today" a single query instead of a table scan. `GSI2PK = DATE#<yyyy-mm-dd>`. This index is the reason DynamoDB is viable here. |
| **CDC** | Change Data Capture | Deriving events from committed database writes rather than publishing them separately. DynamoDB Streams → EventBridge Pipe → bus. Avoids the dual-write problem where the DB write succeeds and the event publish fails. |
| **`COACH#` / `STUDENT#` / `SLOT#` / `BOOKING#` / `DATE#`** | *(key prefixes)* | Type tags on composite keys — the convention that lets one table hold several entity types. |

---

## API & authentication

| Term | Stands for | In BladeBook |
|---|---|---|
| **API** | Application Programming Interface | The backend contract the React app calls. |
| **API GW / APIGW** | API Gateway | The AWS service fronting our Lambdas. We use the **REST API** flavour (~$3.50/M requests) rather than the cheaper HTTP API, because only a REST API can take a Web Application Firewall (ADR-019, ADR-001 A7). |
| **HTTP** | Hypertext Transfer Protocol | — |
| **JSON** | JavaScript Object Notation | Wire format for the API and for `report.json`. |
| **JWT** | JSON Web Token | Cognito's signed token. Critically: `coachId`/`clientId` is read from the **verified JWT claim**, never from the request body — that's what makes tenant isolation structural rather than a code convention. |
| **Tenant role** | — | An IAM role an API function assumes **per request**, tagged with the caller's identity (`coachId`, or `clientId` + `coachId` + `linkStatus`), whose policy uses `dynamodb:LeadingKeys` so DynamoDB itself refuses any other coach's or client's partition. The database half of the two-gate isolation in ADR-021 (`coach-tenant`; `checkin-tenant` withdrawn by ADR-023) and ADR-022 (`client-tenant`). |
| **TLS** | Transport Layer Security | Encryption in transit; `aws:SecureTransport` is enforced on the reports bucket. |
| **MFA** | Multi-Factor Authentication | Offered to coaches, who hold the most sensitive data. |
| **RW** | Read/Write | Permission shorthand in the ADR's IAM table. |
| **4xx / 5xx** | HTTP status classes | Client errors / server errors. The ADR requires the React client to retry once on 5xx for idempotent GETs, because a SnapStart snapshot in the wrong state returns an *error*, not a slow response. |
| **401 / 408 / 409 / 500** | Specific status codes | Unauthorized / Request Timeout / Conflict / Internal Server Error. Each maps to a named SnapStart failure mode in the ADR. |

---

## Java & runtime

| Term | Stands for | In BladeBook |
|---|---|---|
| **JVM** | Java Virtual Machine | The Java runtime. Its startup cost is the entire reason SnapStart, Quarkus, and Micronaut were debated at all. |
| **JDK** | Java Development Kit | Compiler + tooling. We target Java 25. |
| **JAR** | Java ARchive | The deployable artifact. Three of them: `api-coach.jar`, `api-client.jar`, `consumers.jar`. |
| **SDK** | Software Development Kit | Usually "AWS SDK v2 for Java" — the library our code uses to call DynamoDB, SES, and SNS. |
| **DI** | Dependency Injection | How a framework supplies collaborators to your classes. Spring does it at runtime via reflection; Quarkus and Micronaut do it at compile time, which is most of their startup advantage — and most of what SnapStart makes moot. |
| **SnapStart** | *(not an acronym)* | A Lambda feature that snapshots a function's initialized memory and restores it on cold start. Free. Its documented caveat is central to ADR-001: it "works best... at scale," and BladeBook is low-traffic by design. |
| **CRaC** | Coordinated Restore at Checkpoint | The OpenJDK API SnapStart builds on. Gives you `beforeCheckpoint` (run before the snapshot — where priming goes) and `afterRestore` (run on wake — hard 10-second ceiling). |
| **Priming** | *(not an acronym)* | Doing real work in `beforeCheckpoint` so it's already done at restore. We prime at the **SDK level**: a real DynamoDB query against a synthetic empty partition. Rejected: *invoke* priming, which would require fabricating an authenticated identity and freezing it into a persisted snapshot. |
| **AOT** | Ahead-Of-Time compilation | Doing at build time what a JVM normally does at startup. Micronaut's core technique. |
| **GraalVM** | *(product name)* | Compiles Java to a native binary — fastest cold start, but shifts JVM CVE patching from AWS to you. That's what disqualified the Quarkus-native path. |
| **Jakarta EE** | Jakarta Enterprise Edition | The renamed Java EE spec. Version 11 comes with Spring Boot 4 and is part of why Boot 3-era examples won't copy-paste. |
| **LTS** | Long-Term Support | A release line with a published support window. |
| **EOL** | End of Life | No more security patches. Micronaut's *lack of a published* EOL policy is what eliminated it — not its performance. |
| **CVE** | Common Vulnerabilities and Exposures | The public vulnerability catalogue. "Who responds to a JVM CVE" is a first-order question here because §7 commits to child-data obligations. |
| **OSS** | Open Source Software | As in "all Spring Boot 3.x lines lost OSS support at end of 2025." |
| **al2023** | Amazon Linux 2023 | The OS behind Lambda runtimes. `provided.al2023` means a custom runtime — i.e. patching is yours. |
| **arm64** | *(architecture, not acronym)* | AWS Graviton processors — cheaper per ms than x86 and our build target. |
| **UUID** | Universally Unique Identifier | Must be generated **inside the handler**, never at init: snapshots are cloned across environments, so anything created pre-checkpoint is reused everywhere. |
| **npm** | node package manager | JavaScript dependency tool. `web/` and `infra/` are npm workspaces. |
| **TS** | TypeScript | Frontend language and the chosen CDK binding. |
| **DOM** | Document Object Model | The browser API surface. Cited as why `web/` and `infra/` need separate `tsconfig.json` files. |

---

## Performance & measurement

| Term | Stands for | In BladeBook |
|---|---|---|
| **p50 / p99** | 50th / 99th percentile | Median and near-worst-case latency. The ADR's spike gate is stated in p99 because the number that matters is the unlucky booking, not the typical one. |
| **Cold start** | *(not an acronym)* | The delay when a request hits a Lambda with no warm execution environment. Constant at BladeBook's traffic, which is exactly why it's a UX concern. |
| **ms** | milliseconds | — |
| **req/s** | requests per second | Sustained traffic. ~9 req/s is the threshold above which Lambda Managed Instances becomes worth revisiting. |

---

## Time & scheduling

| Term | Stands for | In BladeBook |
|---|---|---|
| **tz** | timezone | Stored per coach as a required IANA identifier from the first write. |
| **IANA** | Internet Assigned Numbers Authority | Publisher of the canonical timezone database — `America/New_York`, not `EST`. The distinction matters: IANA identifiers survive DST, fixed offsets don't. |
| **UTC** | Coordinated Universal Time | `Booking.startsAtUtc` — the unambiguous instant, stored alongside local-date keys so no historical row becomes ambiguous when a second timezone appears. |
| **DST** | Daylight Saving Time | Handled by EventBridge Scheduler's native IANA support rather than by our own arithmetic. |
| **ISO-8601** | *(ISO standard 8601)* | The date/time format standard — `2026-07-29T14:30:00Z`. |
| **cron** | *(from "chronos")* | Recurring schedule syntax. Drives the 7am reminders and 9pm reports. |

---

## Privacy, security & compliance

| Term | Stands for | In BladeBook |
|---|---|---|
| **PII** | Personally Identifiable Information | Names, emails, phone numbers. §7 minimizes collection to what scheduling and contact actually require. |
| **PCI** | Payment Card Industry (Data Security Standard) | The card-data security standard. BladeBook takes no card payments, so it stays out of scope (ADR-003). |
| **TIN** | Taxpayer Identification Number | A United States tax identifier, of which the EIN is one kind (ADR-016). Not collected. |
| **COPPA** | Children's Online Privacy Protection Act | US federal law governing data about children under 13. Applies where `isMinor = true`. §7 flags it for legal review before launch — it is not a hand-wave. |
| **SQLi** | SQL injection | A WAF-blocked attack class. Largely inapplicable to DynamoDB, but the managed rule set covers it anyway. |
| **SQL** | Structured Query Language | Relational query language. Not used — DynamoDB isn't relational. |
| **XSS** | Cross-Site Scripting | Injecting script into a page another user views. Covered by WAF managed rules. |

---

## Messaging

| Term | Stands for | In BladeBook |
|---|---|---|
| **SMS** | Short Message Service | Text messages, via SNS. **Opt-in per phone number** (ADR-007 decision 8a), both for cost and for consent. In MVP the only text is the coach's late-cancellation alert, which opens `BladeBook:`; texts to clients are **Phase 2** and open `<Coach name> via BladeBook:` (ADR-007, amended 2026-10-12). |
| **10DLC** | 10-Digit Long Code | The US registration regime for application-to-person SMS on a normal-looking number. ~$2/mo plus one-time registration — required before any text can send. |
| **A2P** | Application-to-Person | Messages sent by software rather than a human — the category 10DLC registration governs. |
| **TCPA** | Telephone Consumer Protection Act | United States law on consent for automated texts and calls. ADR-007 notes it does not require opt-out wording in every message; carrier and CTIA rules are what bite. |
| **CTIA** | Cellular Telecommunications Industry Association | The wireless industry body whose messaging guidelines carriers enforce (ADR-007). |
| **RCS** | Rich Communication Services | Richer messaging that may succeed SMS. Not used; its arrival is a revisit trigger for ADR-007. |
| **GSM-7** | GSM 03.38 7-bit alphabet | The default SMS character set: **160 characters per segment**, which is the budget every BladeBook SMS is built against (ADR-007). Its *extension table* (`[ ] { } \ ~ ^ \|` and `€`) costs two characters each. |
| **UCS-2** | Universal Coded Character Set, 2-byte | The fallback encoding the moment a message contains *any* non-GSM-7 character. Drops the segment to **70** characters — which is why ADR-007 restricts the character set and not just the length. The usual culprits are a typographic apostrophe `’`, an em dash, or an accented name. |
| **Segment** | *(not an acronym)* | One billable SMS unit. Longer messages are split by the carrier, billed per segment, and reassembled with no ordering guarantee. ADR-007 permits exactly one. |

---

## Enumerated values

The model's enums, value by value. Where two enums sit on the same item and are easily
confused, the distinction is stated rather than left to be inferred.

### `CLIENT.clientRelationship` — who the client is to the student

A **client** books, is billed, and is notified. This records why they hold that role.

| Value | Meaning |
|---|---|
| `SELF` | The student is an adult booking for themselves. The client and the student are the same person, and the `client*` contact fields hold that person's own details. |
| `GUARDIAN` | The client books for a student who is a minor: a parent or anyone else responsible for them. *Until 2026-10-01 there was also `PARENT`; it was removed because nothing in the system treated the two differently.* |

> Only `isMinor` gates the child-data obligations in §7. `clientRelationship` never does —
> booking and notification code reads the `client*` fields the same way regardless of value,
> which is the point of having the field at all.

### `STUDENT.studentStatus` — whether this student may book

| Value | Meaning |
|---|---|
| `PENDING` | Created by a client who entered the coach's `coachCode`, or who followed a shared-lesson invitation's consent link and confirmed (ADR-026 d5), and **not yet confirmed** by the coach. **Cannot book.** |
| `ACTIVE` | The coach has confirmed them. They can book. |

> Denormalized onto the `CLIENT#…/STUDENT#…` link item as well, so a client's own roster
> renders without a second read.

### `INVITATION.inviteStatus` — where a shared-lesson invitation stands (ADR-026 d5)

| Value | Meaning |
|---|---|
| `SENT` | Family B has been emailed and hasn't answered. Family A can still withdraw it. |
| `AWAITING_COACH` | Family B confirmed, but skater B isn't yet the coach's student: they're in the coach's pending list. Once the coach accepts, the coach's Accept joins skater B automatically. |
| `CONFIRMED` | Skater B has joined the lesson. |
| `DECLINED` | Family B said no, or the coach declined skater B. |
| `WITHDRAWN` | Family A took the invitation back before Family B confirmed. |
| `EXPIRED` | Family B confirmed, but skater B never joined: the lesson passed before the coach acted, or the coach accepted and the join failed (cancelled, started or full). Family B is told. |

> Not the same as `STUDENT.studentStatus` `PENDING`: an invitation's `AWAITING_COACH` is the
> moment the invited skater has a `PENDING` student record with the coach.

### `BOOKING.bookingStatus` — what this slot actually is

| Value | Meaning |
|---|---|
| `BOOKED` | A real lesson, claimed by a client, not yet happened. |
| `CHECKED_IN` | The coach marked the student present. |
| `NO_SHOW` | The lesson time passed and the student did not appear. **Charged the lesson's `missedLessonFeeMinor`** under the same rule as a late cancellation, since a no-show is a cancellation with zero notice (ADR-015). That fee is `0` in MVP, but the no-show still stays `UNPAID` until the coach marks it paid or waived (ADR-015 decision 4, amended 2026-09-30). **Coach-marked, explicitly** — the check-in app offers present/absent as two buttons (ADR-014 decision 6); it is never inferred from a booking simply sitting unrecorded. What it costs the family is set per block by the coach: it emits its own event, which drives the payment reminder (ADR-015 decision 5). |
| `COACH_HELD` |  A slot the coach kept unbookable after cancelling: |

### `BOOKING.paymentStatus` — whether the money arrived

| Value | Meaning |
|---|---|
| `UNPAID` | The state at creation. While unpaid, the item carries `GSI3PK`/`GSI3SK`, so it appears in the coach's outstanding-lessons view. |
| `PAID` | The coach marked it paid. This is the **only** way it changes — nothing else in the system observes money changing hands. Marking it paid `REMOVE`s the GSI3 attributes, so the row drops out of the sparse index entirely and the index never grows with history. |

> Distinct from `paymentReminderSent` / `paymentReminderCount`, and deliberately so: those record that we **asked**,
> the other records that they **paid**.

### `BOOKING.paidVia` — how the client paid

Set by the coach when marking a lesson paid (ADR-003 decision 4, amended 2026-10-12). Only the
payment types the coach has on their profile are offered, plus `OTHER`; no free text. Optional,
editable afterwards, seen only by the coach; a waived lesson has none.

| Value | Meaning |
|---|---|
| `CASH` | Paid in cash; offered only if the coach turned on *I accept cash* (`acceptsCash`). |
| `CASHAPP` | Paid to the coach's Cashapp handle. |
| `VENMO` | Paid to the coach's Venmo handle. |
| `PAYPAL` | Paid to the coach's PayPal handle. |
| `OTHER` | Any other way: cheque, Interac e-transfer, or a payment type the coach has since removed. |

### `SKATER.skatingOrg` — which organisation issued the skater's number (ADR-029)

| Value | Meaning |
|---|---|
| `USFS` | US Figure Skating (formerly USFSA). A member number; Learn to Skate USA numbers are a separate series. |
| `USA_HOCKEY` | USA Hockey. A 14-character registration number, new every season. |

Phase 2 adds `SKATE_CANADA` and `HOCKEY_CANADA`.

### `CHANGE_BATCH.cancelledBy` — *who* cancelled

| Value | Meaning |
|---|---|
| `CLIENT` | A client cancelled their own booking, or shortened / ended a recurrence. |
| `COACH` | The coach cancelled from the week view. |
| `SCHEDULE_CHANGE` | Nobody cancelled these directly — a schedule save made them impossible. |

### `CHANGE_BATCH.batchSource` — *what kind* of action produced the batch

*`CHANGE_BATCH` was `CANCELLATION_BATCH` (header `CANCELBATCH#`) until 2026-09-30, when a
batch began to hold re-priced lessons as well as cancelled ones (ADR-020). A direct
cancellation still produces a change batch — one holding only cancellation lines.*

Sits alongside `cancelledBy` and answers a different question: `cancelledBy` says who acted,
`batchSource` says what they did. A coach cancelling one lesson is `COACH` + `LESSON`; a coach
saving a temp that wipes out a week is `SCHEDULE_CHANGE` + `DATE_OVERRIDE`.

| Value | Meaning |
|---|---|
| `DEFAULT` | A change to the coach's default weekly pattern. |
| `DATE_OVERRIDE` | A change to one or more specific dates — a camp, a blackout, a temporary schedule. Bounded by the date range it covers. |
| `LESSON` | A single lesson was cancelled on its own — by the coach, or by a client from My Bookings. |
| `DAY` | The coach cancelled everything remaining on one day |
| `WEEK` | The coach cancelled a whole Sun–Sat week  |
| `RECURRENCE` | A client moved a recurrence's end date earlier, reduced its frequency, or cancelled all future lessons in it. An occurrence inside the late-cancellation threshold is charged like any late client cancellation (ADR-015 decision 1a); `source` itself plays no part in whether a line is charged. |

### `executionStatus` — whether the cancellation has been carried out

Carried by the `CHANGEBATCH#` header and by each `CANCELLED#` and `REPRICED#` line (ADR-010 decision 5f, ADR-020).
It is a different question from `notificationStatus` below: this one asks whether the
booking has been deleted, that one asks whether anyone has been told.

| Value | Meaning |
|---|---|
| `PLANNED` | Written as part of the plan (ADR-010 decision 5c); the booking has not been deleted yet. |
| `EXECUTED` | On a line: the booking is deleted. On the header: every line is `EXECUTED` or `SKIPPED` — this transition is what triggers the notifier. |
| `SKIPPED` | Lines only. When re-checked just before being carried out, the record no longer applied — see `skippedReason` below (ADR-010 decision 5i). Not notified, except `LESSON_PASSED`, which is reported to the coach. |

### `CHANGE_BATCH.planStatus` — whether the plan is fully written (ADR-010 decision 5h)

| Value | Meaning |
|---|---|
| `WRITING` | The header exists and plan records are being written. **No booking is changed while the plan is in this state.** A resume fills in only the missing records. |
| `COMPLETE` | Every record of the plan is written; carrying it out may begin. |

### `skippedReason` — why a planned record was not carried out (ADR-010 decision 5i)

On `CANCELLED#` and `REPRICED#` lines marked `SKIPPED`.

| Value | Meaning |
|---|---|
| `BOOKING_GONE` | The booking no longer exists — usually the family cancelled it, which produced its own record and message. |
| `NO_LONGER_NEEDED` | The coach's current schedule no longer calls for the change — they restored the slot, or a later batch set a different price. The coach's latest intent wins. |
| `LESSON_PASSED` | The lesson's time passed before the change could be applied. For a cancellation this is the one unrecoverable case — the family was never told — so the coach is told instead. |

### `REPRICED_LESSON.direction` — which way the price moved (ADR-020)

| Value | Meaning |
|---|---|
| `INCREASE` | The block's price or fee went up. Applied only to lessons beyond the booking's `requiredNoticeHours` when the change was carried out. |
| `DECREASE` | The price or fee went down. Applied to every upcoming lesson, including tomorrow's; the family's message is framed as good news. |

### `CANCELLED_LESSON.notificationStatus` — whether the person was told

*The same values are used on `REPRICED_LESSON` lines (ADR-020).*

Recorded per lesson even though the message is sent once per client per batch, because the
question a coach actually asks is *"was this client told about this lesson?"*

| Value | Meaning |
|---|---|
| `PENDING` | The cancellation is recorded; the notifier has not run yet, or is retrying. Not the same as `executionStatus = PLANNED` above. |
| `SENT` | SES (and SNS, where the client opted in) **accepted** the message. It does **not** mean delivered, and it does not mean read. |
| `FAILED` | We tried and could not reach them — a bounced address, an unregistered number.  |
| `SUPPRESSED` | We were **not permitted** to try. The client has texted `STOP`, so the SMS was never attempted. Not a failure — it is the client's own choice. |

---

## Names that look like acronyms but aren't

**DynamoDB**, **CloudFront**, **Cognito**, **EventBridge**, **Lambda**, **Quarkus**,
**Micronaut**, **Spring Boot**, **Maven**, **Vite**, **React**, **Jest**, **JUnit**,
**Glacier**, **Athena**, **Stripe**, **SnapStart**, **GraalVM** — product or project
names. Expanding them is a category error.

**S3** is genuinely "Simple Storage Service" (three S-words → S3), and **EC2** is
"Elastic Compute Cloud" by the same trick. **SES** and **SNS** follow the same
pattern and do expand.
