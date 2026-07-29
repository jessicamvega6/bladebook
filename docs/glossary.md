# BladeBook — Glossary

Every acronym and abbreviation used in `architecture.md` and `adr/`. Where a term
carries a project-specific meaning, the third column says what it means *here*
rather than in general.

For domain terms that are **not** acronyms — student, client, `clientRelationship`,
`isMinor` — see §0 of [architecture.md](architecture.md).

---

## Project & document conventions

| Term | Stands for | In BladeBook |
|---|---|---|
| **ADR** | Architecture Decision Record | A numbered document capturing one significant decision, why it was made, and what it costs. Append-only: a changed decision gets a new ADR marking the old one "Superseded," rather than an edit. Lives in `docs/adr/`. |
| **MVP** | Minimum Viable Product | Phase 1 in §10 — the eight features that must ship before anything else. |
| **IaC** | Infrastructure as Code | Defining AWS resources in a programming language rather than clicking the console, so infrastructure is reviewable and reproducible. We use CDK. |
| **CI** | Continuous Integration | Automated build/test on push. Where `cdk-nag` runs as a build gate. |
| **UI / UX** | User Interface / User Experience | UX appears in the ADR to distinguish "cold start is a latency problem the user feels" from "cold start is a cost problem," which it isn't. |
| **AI** | Artificial Intelligence | Used specifically to mean "how well an AI coding assistant can help with this framework," which the ADR treats as a real selection criterion for a solo developer. |

---

## AWS platform

| Term | Stands for | In BladeBook |
|---|---|---|
| **AWS** | Amazon Web Services | The only cloud provider in the design. |
| **IAM** | Identity and Access Management | AWS's permission system. §7 mandates one IAM **role** per Lambda, each granted only the actions that function needs — no wildcards. |
| **ARN** | Amazon Resource Name | The unique identifier for any AWS resource. Relevant because invoking a Lambda's *unqualified* ARN silently bypasses SnapStart — always point at the alias. |
| **VPC** | Virtual Private Cloud | A private network inside AWS. BladeBook deliberately uses **no** VPC: it's what would force a NAT Gateway and blow the budget. |
| **NAT** | Network Address Translation | NAT Gateway lets resources inside a VPC reach the internet — ~$32/month, always on. Avoiding it is the single biggest cost decision in §2. |
| **S3** | Simple Storage Service | Object storage. Hosts the React build and the daily report archive. |
| **SES** | Simple Email Service | Email delivery. The primary notification channel. |
| **SNS** | Simple Notification Service | Used here only for SMS, on a per-student opt-in. |
| **KMS** | Key Management Service | Encryption key management for DynamoDB, SES, and the reports bucket. |
| **CMK** | Customer Managed Key | A KMS key you create and control, versus an AWS-managed default. §7 allows either. |
| **SSE-KMS** | Server-Side Encryption with KMS | Encryption-at-rest mode for the S3 reports bucket. |
| **WAF** | Web Application Firewall | Optional managed rule sets (SQLi/XSS, rate limiting) on CloudFront/API Gateway. ~$8–15/mo, the largest optional line item. |
| **CDN** | Content Delivery Network | CloudFront — caches the static React site at edge locations. |
| **CDK** | Cloud Development Kit | AWS's IaC framework. ADR-001 chose the **TypeScript** binding. |
| **L2** | CDK "Level 2" construct | An opinionated, high-level CDK class with sensible defaults. For some runtimes it also builds your code: `NodejsFunction` takes a `.ts` entry point and runs esbuild for you. **No `JavaFunction` L2 exists in any CDK language** (`aws-lambda-java-alpha` is not published), so for Java you run Maven yourself and hand `Code.fromAsset()` a path to the built JAR. That cost is identical in CDK-Java and CDK-TypeScript, so it can't favour either — but it's why `cdk.json` has to invoke Maven, or CDK will happily deploy a stale JAR. |
| **jsii** | JavaScript Interop Interface | The tool that generates CDK's Java/Python/.NET bindings from the TypeScript source. Why TypeScript is the most mature CDK language: it's the original, the rest are generated. |
| **cdk-nag** | *(not an acronym — a tool name)* | Rule packs that fail a CDK build on wildcard IAM actions, unencrypted buckets, missing Block Public Access. Automates most of §7's checklist. |
| **SAM** | Serverless Application Model | An AWS IaC alternative to CDK, considered and not chosen. |
| **SSM** | AWS Systems Manager | Parameter Store — holds the default coach timezone used to pre-fill onboarding. |
| **RDS** | Relational Database Service | Managed Postgres/MySQL. Not used — it's the ~$20–45/mo option DynamoDB replaced. Appears in the ADR because AWS's headline SnapStart benchmarks were measured against it, on a data path BladeBook doesn't have. |
| **EC2** | Elastic Compute Cloud | Ordinary virtual machines. Relevant only as the billing model behind Lambda Managed Instances, which is disqualified on budget. |
| **EFS** | Elastic File System | Network filesystem for Lambda. Foreclosed by SnapStart. |
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
| **GSI1** | — | "By student" — client-facing views. `GSI1PK = STUDENT#<studentId>`. |
| **GSI2** | — | "By date, global" — the one that makes cross-coach "everyone with a lesson today" a single query instead of a table scan. `GSI2PK = DATE#<yyyy-mm-dd>`. This index is the reason DynamoDB is viable here. |
| **CDC** | Change Data Capture | Deriving events from committed database writes rather than publishing them separately. DynamoDB Streams → EventBridge Pipe → bus. Avoids the dual-write problem where the DB write succeeds and the event publish fails. |
| **`COACH#` / `STUDENT#` / `SLOT#` / `BOOKING#` / `DATE#`** | *(key prefixes)* | Type tags on composite keys — the convention that lets one table hold several entity types. |

---

## API & authentication

| Term | Stands for | In BladeBook |
|---|---|---|
| **API** | Application Programming Interface | The backend contract the React app calls. |
| **API GW / APIGW** | API Gateway | The AWS service fronting our Lambdas. We use the **HTTP API** flavour (~$1/M requests), not the older REST API. |
| **HTTP** | Hypertext Transfer Protocol | — |
| **JSON** | JavaScript Object Notation | Wire format for the API and for `report.json`. |
| **JWT** | JSON Web Token | Cognito's signed token. Critically: `coachId`/`clientId` is read from the **verified JWT claim**, never from the request body — that's what makes tenant isolation structural rather than a code convention. |
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
| **COPPA** | Children's Online Privacy Protection Act | US federal law governing data about children under 13. Applies where `isMinor = true`. §7 flags it for legal review before launch — it is not a hand-wave. |
| **SQLi** | SQL injection | A WAF-blocked attack class. Largely inapplicable to DynamoDB, but the managed rule set covers it anyway. |
| **SQL** | Structured Query Language | Relational query language. Not used — DynamoDB isn't relational. |
| **XSS** | Cross-Site Scripting | Injecting script into a page another user views. Covered by WAF managed rules. |

---

## Messaging

| Term | Stands for | In BladeBook |
|---|---|---|
| **SMS** | Short Message Service | Text messages, via SNS. **Per-student opt-in**, both for cost and for consent. |
| **10DLC** | 10-Digit Long Code | The US registration regime for application-to-person SMS on a normal-looking number. ~$2/mo plus one-time registration — required before any text can send. |

---

## Names that look like acronyms but aren't

**DynamoDB**, **CloudFront**, **Cognito**, **EventBridge**, **Lambda**, **Quarkus**,
**Micronaut**, **Spring Boot**, **Maven**, **Vite**, **React**, **Jest**, **JUnit**,
**Glacier**, **Athena**, **Stripe**, **SnapStart**, **GraalVM** — product or project
names. Expanding them is a category error.

**S3** is genuinely "Simple Storage Service" (three S-words → S3), and **EC2** is
"Elastic Compute Cloud" by the same trick. **SES** and **SNS** follow the same
pattern and do expand.
