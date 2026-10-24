# BladeBook — Master Decision Record

**What this is.** Every decision in ADR-001 to ADR-033 that is still in force, merged into one
statement of what gets built. Superseded decisions, history, dates and rejected alternatives are
left out. Each section names the ADRs it comes from, for the reasoning.

**Current through:** ADR-033.

**Where this and an ADR disagree, the ADR wins**, and this file needs correcting. When an ADR is
added or amended, update the section it touches here.

**Words used here.** A **skater** (`student` in the model) is the person coached, any age. A
**family** (`client` in the model) is whoever books and is billed: the skater themselves when
an adult, or a guardian. A **lesson time** is a bookable time in a coach's schedule; a **seat**
is one skater's place in a lesson time. Acronyms are defined in [glossary.md](../glossary.md).

---

## Contents

1. [Stack and project layout](#1-stack-and-project-layout)
2. [Functions](#2-functions)
3. [Data model](#3-data-model)
4. [Coach sign-up and profile](#4-coach-sign-up-and-profile)
5. [Family registration, skaters and coaches](#5-family-registration-skaters-and-coaches)
6. [The schedule and the schedule editor](#6-the-schedule-and-the-schedule-editor)
7. [Lesson times, seats and booking](#7-lesson-times-seats-and-booking)
8. [Shared lessons](#8-shared-lessons)
9. [Schedule changes: preview, cancel and re-price](#9-schedule-changes-preview-cancel-and-re-price)
10. [Cancellation](#10-cancellation)
11. [Attendance and the rinkside page](#11-attendance-and-the-rinkside-page)
12. [Payments and the financial page](#12-payments-and-the-financial-page)
13. [Notifications](#13-notifications)
14. [Scheduled jobs](#14-scheduled-jobs)
15. [Sign-in and sessions](#15-sign-in-and-sessions)
16. [Data isolation](#16-data-isolation)
17. [Web Application Firewall](#17-web-application-firewall)
18. [Personal-data access logging](#18-personal-data-access-logging)
19. [Reliability and operations](#19-reliability-and-operations)
20. [Retention and archive](#20-retention-and-archive)
21. [Environments: production and dev](#21-environments-production-and-dev)
22. [Testing](#22-testing)
23. [Continuous integration and deployment](#23-continuous-integration-and-deployment)
24. [Not in MVP](#24-not-in-mvp)
25. [Still undecided](#25-still-undecided)
26. [Source map](#26-source-map)

---

## 1. Stack and project layout

*Sources: ADR-001, ADR-013, ADR-019, ADR-023.*

| Layer | Decision |
|---|---|
| Compute | AWS Lambda on the managed **`java25`** runtime, **arm64**. No SnapStart. |
| API functions | **Spring Boot 4** through `aws-serverless-java-container` 3.x. Two functions, `api-coach` and `api-client`, split on the trust boundary (coach versus family). |
| Event and scheduled functions | Plain `RequestHandler` classes, no framework, all in one `consumers.jar` with one handler entry point per function. |
| Domain code | `backend/core/` is **framework-free**: plain Java and AWS SDK v2, no Spring annotations below the controller layer. |
| API | API Gateway **REST API** with the built-in **Cognito authorizer** on every protected route. Cross-origin resource sharing (CORS) set for the sites' domain. |
| Data | One DynamoDB table, on-demand. |
| Sign-in | One Cognito user pool. Groups `Coach` and `Client`. |
| Events | DynamoDB Streams → EventBridge Pipe → custom EventBridge bus; EventBridge Scheduler for timed jobs. |
| Email / SMS | SES for email; SNS for SMS. |
| Frontend | React + TypeScript + Vite, served from S3 through CloudFront. Theme: **Harbor** (`design/harbor/`). |
| Infrastructure as Code | **CDK (TypeScript) or Terraform — undecided** (see §25). Whichever is chosen must (1) fail the build on least-privilege violations (`cdk-nag`, or `checkov`/`tfsec`), (2) never deploy a stale JAR, (3) build and destroy the dev stack from nothing, and (4) deploy into two AWS accounts through an OpenID Connect (OIDC) deploy role. |

**Repository** — one monorepo:

```
bladebook/
├── docs/                    # architecture.md, adr/, glossary.md, …
├── backend/                 # Maven multi-module, Java 25
│   ├── core/                # framework-free domain, DynamoDB access, events
│   ├── api-coach/           # Spring Boot 4 → api-coach
│   ├── api-client/          # Spring Boot 4 → api-client
│   └── consumers/           # every event and scheduled handler, one JAR
├── web/                     # React + TS + Vite (npm workspace)
├── infra/                   # IaC (CDK TS or Terraform)
└── <root>/fixtures.json     # shared test cases read by Java and TypeScript (§22)
```

- **`web/` builds two sites from one source tree:** the **coach website** and the **family
  website**. The **rinkside page** is a separate entry point inside the coach website at
  `/coach/rinkside`, shipped with it. It loads only today's lessons, attendance, contact reveal
  and cancellation, never the schedule editor.
- **Locally**, `api-coach` runs on `:8080` and `api-client` on `:8081` as ordinary `main()`
  processes, and Vite proxies `/api/coach/*` and `/api/client/*` to them.
- **ArchUnit rule:** no class outside `com.bladebook.core.data` may reference `DynamoDbClient`.
- **Lambda aliases** for versioning and rollback are recommended, not required.
- **The web app retries once** on a server error: an idempotent GET as is, a booking with the
  same idempotency key (§7).
- **Scheduler rules** are one per job, pinned to the launch timezone (`America/New_York`) with
  Scheduler's IANA timezone support. A second timezone is one more rule per job; the data
  already carries each coach's timezone. Verify one rule across a daylight-saving boundary
  before relying on it.

---

## 2. Functions

*Sources: ADR-001 (A5, A6, A8, A9 and later amendments), ADR-010, ADR-017, ADR-018, ADR-021,
ADR-023 (d10), ADR-025, ADR-026, ADR-031, ADR-033.*

**Seventeen functions.**

| Function | Trigger | Job |
|---|---|---|
| `api-coach` | API Gateway | Every coach-website and rinkside route. |
| `api-client` | API Gateway | Every family-website route, plus the coach-code lookup before sign-in. |
| `consumer-booking-confirmation` | `LessonBooked` | Confirmation email per seat. |
| `consumer-payment-reminder` | `CheckInRecorded` | Payment-reminder email. |
| `consumer-schedule-change` | `ScheduleChanged` (and direct invocation by `reconcile-schedule`) | Adds, removes, cancels and re-prices lesson times (§9). |
| `consumer-change-notifier` | `LessonsChanged` | One message per family (or to the coach) per change batch; the coach's late-cancellation SMS. |
| `consumer-student-link` | `StudentChanged` | Keeps the family's link item in step with the coach's `STUDENT#` item; sends the decline email. |
| `consumer-family-sync` | `FamilyChanged` | Copies family and skater details to every coach's `STUDENT#` record and upcoming seats; issues share codes. |
| `consumer-invite` | Seat changes and lesson-time `pendingLeave` changes | Writes read-only copies on seats; sends shared-lesson emails (§8). |
| `consumer-ttl-archiver` | DynamoDB Stream, Time to Live (TTL) removals only | Copies expired items to the archive bucket. |
| `sched-day-reminder` | Scheduler, ~7:00am | Day-of emails to families; the coach's morning email. |
| `sched-daily-report` | Scheduler, ~9:00pm | End-of-day report to the coach; archive to S3. |
| `sched-unpaid-reminder` | Scheduler, weekly | Long-unpaid lessons, to the coach. |
| `sched-drift-check` | Scheduler, nightly | Read-only check for unfinished or missing schedule changes. |
| `sched-lesson-roller` | Scheduler, nightly | Keeps lesson times stored ~15 months ahead. |
| `sched-deadline-sweep` | Scheduler, hourly | Acts on shared-lesson deadlines (GSI4). |
| `auth-post-confirmation` | Cognito post-confirmation, when a new account's email is verified | Adds `Coach` or `Client`, chosen by the app client the person signed up through (ADR-023 d10). |

**Outside the count**, not in the request path: the personal-data access-log aggregator; the
**dev scanner** (in dev's application stack); the **transform Lambda** (in the production
account's data-loading stack).

### Execution roles

IAM enforces the **actions**, **indexes** and **other services** below. It cannot tell item types
apart inside one partition (there is no sort-key condition), so which items a function touches is
held by code and tests.

| Function | DynamoDB | Indexes | Other services |
|---|---|---|---|
| `api-coach` | **None on its own role.** Assumes `coach-tenant` per request (§16). | GSI3 only, via `coach-tenant` | none |
| `api-client` | **None on its own role.** Assumes `client-tenant` per request, and `code-lookup` before sign-in (§16). | GSI1 only, via `client-tenant` | none |
| `consumer-booking-confirmation` | `GetItem`, `UpdateItem` | none | `ses:SendEmail` |
| `consumer-payment-reminder` | `GetItem`, `UpdateItem`, `TransactWriteItems` | none | `ses:SendEmail` (SNS from Phase 2) |
| `consumer-change-notifier` | `GetItem`, `Query`, `UpdateItem`, `TransactWriteItems` | none | `ses:SendEmail`, `sns:Publish`, `sns:CheckIfPhoneNumberIsOptedOut` |
| `consumer-schedule-change` | `GetItem`, `Query`, `PutItem`, `UpdateItem`, `DeleteItem`, `TransactWriteItems` | none | none |
| `consumer-student-link` | `UpdateItem`, `DeleteItem`; `GetItem` on the coach profile | none | `ses:SendEmail` |
| `consumer-family-sync` | `GetItem`, `Query` on the family's partition and the coaches' partitions; `UpdateItem` | none | none |
| `consumer-invite` | Reads; `UpdateItem` limited by `dynamodb:Attributes` to the key fields, `partnerName`, `partnerStatus`, `invitedClientId`, `GSI1PK`, `GSI1SK`, `choiceAnswerBy`. **No `PutItem` or `DeleteItem.`** | as needed for reads | `ses:SendEmail`, `sns:Publish` |
| `consumer-ttl-archiver` | **None** — reads the stream only | none | `s3:PutObject`, `s3:PutObjectTagging` on the archive bucket |
| `sched-day-reminder` | `GetItem`, `UpdateItem`, `TransactWriteItems`, `Query` on GSI2 | **GSI2** | `ses:SendEmail` (SNS from Phase 2) |
| `sched-daily-report` | `GetItem`, `Query` on GSI2 | **GSI2** | `ses:SendEmail`; `s3:PutObject` on `coach=*/date=*/` in the reports bucket |
| `sched-unpaid-reminder` | `Scan` on GSI3, `GetItem`, `UpdateItem` | **GSI3** (scanned) | `ses:SendEmail` |
| `sched-drift-check` | `Query` on GSI2 and the table, `GetItem` — **read-only** | **GSI2** | `sns:Publish` to the operator alert topic only; CloudWatch metrics |
| `sched-lesson-roller` | *Role not yet written* | — | — |
| `sched-deadline-sweep` | *Role not yet written.* One of three functions whose execution role can delete in any coach's partition (with `consumer-schedule-change` and `consumer-student-link`). | **GSI4** (only this function) | none: it sends no email; its emails come from `consumer-invite` and `consumer-change-notifier` (owner, 2026-10-20) |
| `auth-post-confirmation` | **None** | none | `cognito-idp:AdminAddUserToGroup` on this user pool only. Cognito calls it synchronously, so it has no dead-letter queue: if it fails, confirmation fails and the person tries again (ADR-023 d10). |

Every function writes its own log group; those that read personal data also write the separate
access-log group (§18). Every event consumer has a dead-letter queue (§19). Key-management
permissions follow the keys that encrypt the table and buckets.

**Cross-tenant indexes (GSI2, GSI3 scan, GSI4) are held only by scheduled jobs.** No function a
person can call holds one.

---

## 3. Data model

*Sources: ADR-001 d4, ADR-002, ADR-003, ADR-004, ADR-006, ADR-008, ADR-009, ADR-010, ADR-015,
ADR-016, ADR-017, ADR-020, ADR-022, ADR-025, ADR-026, ADR-029, ADR-031, ADR-033.*

### General rules

- **One table**, single-table design. Coach codes, profiles and everything else share it.
- **Money is an integer in minor units** (cents), never a float. Formatted only at the edge.
- **Currency** is `USD` or `CAD`, chosen at coach sign-up, and stamped on every lesson time.
  Amounts in different currencies are never summed.
- **Timezone.** `coachTimezone` (IANA) is required on the coach profile from the first write.
  Every lesson time stores `startsAtUtc` and `coachTz`; seats copy them. Date keys
  (`LESSON#<date>`, `GSI2PK = DATE#<date>`) are the coach's **local** date.
- **Attribute names avoid DynamoDB reserved words** (hence `coachTimezone`, not `timezone`).
- **`expiresAt`** (seconds since 1970) is the table's TTL attribute (§20).
- **The stream** carries old and new images. It has exactly two readers: the EventBridge Pipe and
  `consumer-ttl-archiver`. Further consumers go through the Pipe and bus.
- **Point-in-time recovery on, deletion protection on, `RemovalPolicy.RETAIN`** on the production
  table.

### Items

| Item | PK | SK | Key attributes |
|---|---|---|---|
| Coach profile | `COACH#<coachId>` | `PROFILE` | See §4. `coachId` is the Cognito `sub`. |
| Coach code | `CODE#<coachCode>` | `CODE` | `coachId`, `coachFirstName`, `coachLastName`, `profilePhotoKey` |
| Default schedule | `COACH#<coachId>` | `SCHEDULE#DEFAULT` | `days` (weekday → blocks), `scheduleName`, `scheduleVersion` |
| Temporary schedule header | `COACH#<coachId>` | `SCHEDULE#TEMP#<tempId>` | `scheduleName`, `startDate`, `endDate` |
| Date override | `COACH#<coachId>` | `SCHEDULE#DATE#<yyyy-mm-dd>` | `blocks`, `tempId` |
| Coach's skater record | `COACH#<coachId>` | `STUDENT#<studentId>` | `clientId`, `studentStatus`, `studentName`, contact copies (`clientName`, `clientEmail`, `clientPhone`), `skatingOrg`, `registrationNumber` |
| Lesson time | `COACH#<coachId>` | `LESSON#<date>#<startTime>` | `lessonStatus`, `lessonDate`, `startTime`, `startsAtUtc`, `coachTz`, `durationMinutes`, `priceMinor`, `currency`, `missedLessonFeeMinor`, `requiredNoticeHours`, `maxSkaters`, `seatsTaken`, `shareCount`, `joinOrder`, `blockSeq`, `iceType`, `scheduleVersion`, `pendingLeave`, `dueAt`/`dueKind` |
| Seat | `COACH#<coachId>` | `SEAT#<date>#<startTime>#<studentId>` | See §7 |
| Ended invitation | `COACH#<coachId>` | `SEATEND#<date>#<startTime>#<studentId>#<isoTs>` | `seatOutcome`, `endedAt`, `endedBy` (the family or `SWEEP`; the coach from Phase 2), `studentId`, `studentName`, `clientId`, `inviteId` |
| Change batch | `COACH#<coachId>` | `CHANGEBATCH#<isoTs>#<batchId>` | `batchSource`, `cancelledBy`, acting identity, `affectedFrom`, `affectedTo`, `lessonCount`, `clientCount`, `planStatus`, `executionStatus` |
| Cancellation line | `COACH#<coachId>` | `CANCELLED#<isoTs>#<batchId>#<seatKey>` | `lessonDate`, `startTime`, `durationMinutes`, `priceMinor`, `studentId`, `studentName`, `clientId`, `recurrenceId`, `cancelledAt`, `noticeHours`, `executionStatus`, `skippedReason`, `notificationStatus`, `notifiedAt`, `channels`, `failureReason` |
| Re-price line | `COACH#<coachId>` | `REPRICED#<isoTs>#<batchId>#<seatKey>` | seat, skater, family, date and time, old and new price and fee, `direction`, `executionStatus`, `notificationStatus` |
| Family profile | `CLIENT#<sub>` | `PROFILE` | `clientName`, `clientEmail`, `clientPhone`, `smsOptIn` (Phase 2) |
| Skater | `CLIENT#<sub>` | `SKATER#<studentId>` | `studentName`, `isMinor`, `clientRelationship`, `shareCode`, `skatingOrg`, `registrationNumber` |
| Link (skater ↔ coach) | `CLIENT#<sub>` | `STUDENT#<coachId>#<studentId>` | `studentName`, status, the coach's name |
| Recurrence header | `CLIENT#<sub>` | `RECURRENCE#<coachId>#<recurrenceId>` | `studentId`, `clientId`, `weekday`, `startTime`, `intervalWeeks`, `endDate`, `startedOn`, `recurrenceStatus` |
| Share code | `SKATERCODE#<code>` | `CODE` | the skater's ID and display name |

The family profile is the **source of truth** for contact details, and the `SKATER#` item for who
the skater is. The coach's `STUDENT#` record holds copies.

### Indexes

| Index | Keys | Holds | Read by |
|---|---|---|---|
| **GSI1** | `GSI1PK = CLIENT#<clientId>`, `GSI1SK = SEAT#<date>#<startTime>` | A family's seats, across every coach | `api-client` |
| **GSI2** | `GSI2PK = DATE#<date>`, `GSI2SK = COACH#<coachId>#<startTime>` | Every `BOOKED`, `CHECKED_IN` or `NO_SHOW` seat by local date | `sched-day-reminder`, `sched-daily-report`, `sched-drift-check` |
| **GSI3** (sparse) | `GSI3PK = COACH#<coachId>`, `GSI3SK = UNPAID#<date>#<studentId>` | Seats (and, from Phase 2, chargeable cancellation lines) while `UNPAID` | `api-coach`, `sched-unpaid-reminder` |
| **GSI4** (sparse) | `GSI4PK = DUE`, `GSI4SK = <dueAtUtc>#<coachId>#<itemKey>` | Records with a pending deadline | `sched-deadline-sweep` only |

Held lesson times and `INVITED` seats write no GSI2 keys. An invited seat gets
GSI1 keys only from `consumer-invite` (§8).

### Enumerations

| Attribute | Values |
|---|---|
| `clientRelationship` | `SELF` \| `GUARDIAN` |
| `studentStatus` | `PENDING` \| `ACTIVE` |
| `lessonStatus` | `OPEN` \| `BOOKED` \| `HELD` |
| `seatStatus` | `INVITED` \| `BOOKED` \| `CHECKED_IN` \| `NO_SHOW` |
| `seatOutcome` | `DECLINED` \| `WITHDRAWN` \| `EXPIRED` |
| `paymentStatus` | `UNPAID` \| `PAID` \| `WAIVED` |
| `paidVia` | `CASH` \| `CASHAPP` \| `VENMO` \| `PAYPAL` \| `OTHER` |
| `cancelledBy` | `CLIENT` \| `COACH` \| `SCHEDULE_CHANGE` \| `NO_ANSWER` |
| `batchSource` | `DEFAULT` \| `DATE_OVERRIDE` \| `LESSON` \| `DAY` \| `WEEK` \| `RECURRENCE` \| `RECONCILE` |
| `planStatus` | `WRITING` \| `COMPLETE` |
| `executionStatus` | `PLANNED` \| `EXECUTED` \| `SKIPPED` |
| `skippedReason` | `BOOKING_GONE` \| `NO_LONGER_NEEDED` \| `LESSON_PASSED` |
| `notificationStatus` | `PENDING` \| `SENT` \| `FAILED` \| `SUPPRESSED` |
| `dueKind` | `EXPIRE` \| `ANSWER` |
| `recurrenceStatus` | `ACTIVE` \| `ENDED` |
| `skatingOrg` | `USFS` \| `USA_HOCKEY` \| `LEARN_TO_SKATE_USA` |

`SENT` means SES or SNS accepted the message, not that it was delivered. `SUPPRESSED` means the
number had opted out, so no SMS was attempted.

### Events

| Event | Source | Consumer |
|---|---|---|
| `LessonBooked` | A seat becoming `BOOKED` (one per seat) | `consumer-booking-confirmation` |
| `ScheduleChanged` | A schedule or date-override write | `consumer-schedule-change` |
| `LessonsChanged` | A `CHANGEBATCH#` header reaching `executionStatus = EXECUTED` (new image `EXECUTED`, old image absent or not `EXECUTED`) | `consumer-change-notifier` |
| `CheckInRecorded` | Attendance write, `CHECKED_IN` | `consumer-payment-reminder` |
| `NoShowRecorded` | Attendance write, `NO_SHOW` | Payment reminder — Phase 2 |
| `StudentChanged` | `STUDENT#` modified (`studentStatus`, `studentName`) or removed | `consumer-student-link` |
| `FamilyChanged` | `CLIENT#` `PROFILE` or `SKATER#` modified | `consumer-family-sync` |
| *(name to be set)* | A shared-lesson seat change, or a lesson time's `pendingLeave` written or cleared | `consumer-invite` |
| `DailyReminderDue`, `DailyReportDue`, `UnpaidReminderDue`, `DriftCheckDue`, and the roller's and sweep's (names to be set) | Scheduler | The matching `sched-*` function |

The Pipe **drops TTL removals** (removals whose identity is the DynamoDB service); only the
archiver reads them.

---

## 4. Coach sign-up and profile

*Sources: ADR-002 d2a, ADR-003, ADR-007, ADR-009 d9, ADR-015, ADR-016, ADR-021 d5, ADR-022 d7.*

- **Sign-up is self-serve and ungated.** No invite, approval queue, identity check or business
  identifier (no Employer Identification Number).
- **A coach account is useless until a family enters its code**, and enrolment always needs that
  code handed over outside the site. **There is no public coach directory, searchable profile or
  open join link.**
- **Cognito owns credentials and recovery.** The app never sees a password; recovery is Cognito's
  `ForgotPassword`. No custom recovery form.
- **The login email must be verified** before the account can hold students.
- **Order:** create and verify the Cognito user, then write `COACH#<sub>/PROFILE` and the
  `CODE#` item. **First sign-in completes sign-up** if the profile is missing.

### The profile

| Field | Rule |
|---|---|
| `firstName`, `lastName` | Required |
| `loginEmail` | The Cognito username |
| `businessEmail` | Optional; stored as `loginEmail` when blank. **A different address must be confirmed by a link** (BladeBook's own email, not Cognito's) before it is used. Until then replies go to the address already in use. The profile keeps a list of addresses; an unconfirmed one can't be picked; any but the current one and the login email can be removed. The link opens a page the coach confirms on, so a mail scanner can't confirm it. |
| `phone` | |
| `coachTimezone` | IANA, required |
| `currency` | `USD` \| `CAD`, default `USD`; not changeable in MVP |
| `requiredNoticeHours` | Default **24**; not on the sign-up form; not editable in MVP |
| `coachCode` | System-generated |
| `profilePhotoKey` | Never set in MVP; screens show the coach's **initials** in a circle |
| `paymentInstructions` | Free text; HTML-escaped wherever rendered; treated as personal data |
| `cashappHandle`, `venmoHandle`, `paypalHandle` | Optional |
| `acceptsCash`, `acceptsCashapp`, `acceptsVenmo`, `acceptsPaypal` | Off by default. A type with a handle needs the handle before it can be switched on. Switching it off keeps the handle; switching Cash App, Venmo or PayPal back on asks the coach to confirm the kept handle. |
| `displayPhoneToClients`, `displayEmailToClients` | Off by default |
| `smsCancellationAlerts` | **Unticked until the coach ticks it** — *"Text me when a family cancels late."* Ticking it sends the one-off opt-in confirmation to `phone`. |
| `morningEmailSentOn` | Guard for the morning email (§13) |
| `themeId` | Harbor only in MVP |

### What families see

Shown **only to families the coach has confirmed**, never to a `PENDING` family, never in an SMS
and not on the rinkside page: the phone (if switched on), the business email (if switched on),
and every payment type switched on. They appear on the family website's coach card on Home, at
the top of the booking page, and in the footer of client emails. `paymentInstructions` always
appears in the payment-reminder email.

### Coach code

- Generated at sign-up: **8 random characters** from `ABCDEFGHJKMNPQRTVWXYZ2346789`, shown as two
  groups of four (`7K2Q-M9XT`). Holds nothing of the coach's name.
- Written with `attribute_not_exists(PK)`; on a collision, regenerate.
- Typed in any case, with or without the dash.
- **Never expires.** The coach can rotate it on the profile; the old code is retired at once, and
  families already signed up are unaffected.
- The `CODE#` item's name and photo key are kept in step when the coach renames.

---

## 5. Family registration, skaters and coaches

*Sources: ADR-002, ADR-022, ADR-024, ADR-025, ADR-026 d4, ADR-029, ADR-033.*

### Registration

1. The family enters **one or more coach codes** before an account exists. Each is looked up
   under the `code-lookup` role; the screen shows *"Code found — you're signing up with Dana"*
   with the coach's initials. *Add another coach* adds more codes.
2. They create a Cognito account (email and password) and verify the email.
3. Registration **resolves every code again** inside the signed-in session; coach IDs carried
   over from the browser are never trusted.
4. They register **themselves** (one skater, `isMinor = false`, `SELF`, contact copied from the
   account) or **their children**, one or more (`isMinor = true`, `GUARDIAN`).
5. For each skater they tick which of the entered coaches the skater joins, and give the skater's
   **registration number** (below).
6. Registration writes the `SKATER#` items, and one link and one `PENDING` `STUDENT#` record per
   skater per coach. The coach's name is copied onto each link item.

### Approval

- **Every new skater is `PENDING`** with each coach until that coach approves them — siblings
  added later too. Each coach approves independently.
- A `PENDING` skater **cannot be booked**.
- The coach website's **Students tab title shows the number of pending skaters.** No reminder
  email for waiting approvals.
- **Declining deletes the skater record** (`STUDENT#` immediately; the link follows through
  `consumer-student-link`). Not archived. `consumer-student-link` emails the family
  (*"the coach does not have availability to take on new students"*) from the removed item, so
  the removal's `StudentChanged` event must carry `clientEmail`. The family's account stays.
- `api-coach` writes only the `STUDENT#` item; the link item follows about a second later.

### What a waiting family sees

- A family is **"waiting" with a coach** until that coach approves any of its skaters
  (`linkStatus` is per coach).
- While waiting with every coach, the family sees **only its own account**: profile, skaters and
  the names of the coaches it is waiting on. Nothing of any coach's schedule, availability or
  profile.
- Once any coach approves, the whole site opens. A coach still to approve is named wherever it
  matters (a Home banner per waiting coach, the Coach dropdown, the profile), and nothing of that
  coach is shown. Every waiting message names the coach or coaches.

### Skaters and coaches

- **A skater has one `studentId` for life** and any number of coaches (sign-up takes 1 to 10;
  more can be added later). Each coach holds its own `STUDENT#` record with its own status.
- **A signed-in family can add a coach**: enter the code, choose which skaters (existing or new)
  join. Each new link starts `PENDING`.
- **Adding a skater on the profile** asks which coaches they join, when the family has more than
  one.
- **Family edits write only the family's own partition.** `consumer-family-sync` copies contact
  and skater changes to every coach's `STUDENT#` record, and a skater's name change to their
  upcoming seats.
- **Home shows one card per coach.** An approved coach's card shows the details that coach
  switched on; a waiting coach's shows none.
- One coach removing a skater or cancelling their lessons doesn't affect the skater's lessons with
  other coaches.

### Registration number

- **Every skater gives one**, from one organisation: **US Figure Skating (`USFS`)**, **USA Hockey**
  or **Learn to Skate USA**. Required at sign-up and when a skater is added. It belongs to the
  skater, not the family.
- Stored on `SKATER#`; `consumer-family-sync` copies it to every coach's `STUDENT#` record.
- **Checked for shape only**, in `api-client` and again in the browser: trim, uppercase, match the
  organisation's pattern, cap the length, store the cleaned form. A rejection names the expected
  shape and never suggests a lookup.
  - USA Hockey: 14 characters, 9 digits and 5 letters. The season's check digit is a **setting**.
  - US Figure Skating and Learn to Skate USA: digits only within a loose length range, until the
    formats are known.
- **Never a key** and never in an index.
- Nothing happens when a number lapses.
- **Coaches can download** a file of Student First Name, Student Last Name, Skater Number from the
  Students tab; the download is a logged personal-data read (§18). Its phase is open.

### Share code

Every skater has one, for inviting them to a shared lesson (§8):

- **Shape:** the first 3 letters of the skater's first name (uppercased, accents dropped, non A–Z
  skipped, filled from the last name if the first is shorter), a dash, then **5 random characters**
  from the coach-code set: `MIA-4K7QX`. Typed ignoring case and the dash.
- Issued by `consumer-family-sync` when the `SKATER#` item is created, as a `SKATERCODE#` item
  with `attribute_not_exists(PK)`, copied onto `SKATER#`.
- **Never changes**, including on a rename. The profile shows it with **Copy** only.
- A lookup checks only that the skater exists. The server's read returns the skater's `studentId` and
  display name; the family sees **only the display name** (*"Mia R."*). The ID never leaves
  `api-client`, the browser sends only the code, and the booking resolves the code again itself.

---

## 6. The schedule and the schedule editor

*Sources: ADR-004 d3–5, ADR-006 d2–3, ADR-008, ADR-009, ADR-015 d2, ADR-020, ADR-023 d4,
ADR-026 d1, ADR-031 d13.*

### Shape

- **A schedule is a per-weekday list of blocks**, stored as one item. A day with no blocks has no
  lessons. **Breaks are the gaps between blocks.**
- **A block:** `{ seq, blockName?, startTime, endTime, lessonMinutes, priceMinor,
  missedLessonFeeMinor, maxSkaters, iceType }`. Times are local wall-clock in the coach's
  timezone.
- **Validation:** blocks in one day don't overlap (touching is fine); `endTime` after
  `startTime`.
- **Lesson generation per block:** back-to-back from `startTime`, `floor((end − start) /
  lessonMinutes)` lessons; any remainder is dropped.
- **`lessonMinutes`** is chosen from **30, 45, 60, 90, 120** in the editor (stored as an integer).
- **`maxSkaters`** defaults to **1**; the most a coach may choose is **2**, held as a setting.
  Families never see it.
- **`missedLessonFeeMinor`** is **0** on every block in MVP and the field is hidden.
- **`iceType`** is required per block and never shown to families. The **rink** is fixed to
  Pelham Civic Center (PCC).

### Which schedule applies to a date

```
if SCHEDULE#DATE#<D> exists → its blocks (an empty list means no lessons)
otherwise                   → SCHEDULE#DEFAULT.days[weekday(D)]
```

Deleting a date item restores the default; writing one with empty blocks means no lessons. The
editor keeps those apart.

### Temporary schedules

- Entered as a **date range plus a pattern**, stored as one `SCHEDULE#DATE#` item per date (each
  carrying `tempId`) plus a **header** `SCHEDULE#TEMP#<tempId>` with name, start and end.
- **Date items are written first, the header last.** A temp longer than 99 days is chunked
  across transactions.
- Nothing on the booking path reads the header; it is for listing, naming, overlap checks and
  deleting as a unit.
- **A new temp overlapping an existing one is rejected**, with a message naming it, the shared
  dates and the way out: *"This overlaps **August Camp** (Aug 19–25) on Aug 21–22. Edit August
  Camp to change those days, or choose dates outside it."*
- **Editing a temp** deletes every date item with its `tempId`, writes one per date of the new
  range, then updates the header. Per-date changes inside it are lost on save.
- **Deleting a temp** deletes its header and its date items.

### The editor

- **Two dashboard buttons:** *Edit weekly schedule* (the default; Days mandatory, no dates) and
  *Add time off or a special schedule* (a temp; start and end dates, no Days).
- *Add time off or a special schedule* opens with a choice:
  - **No lessons (time off):** an optional name and a date range, nothing else. Stored as a header
    plus empty-block date items.
  - **Special schedule:** the full form.
- **Form fields:** Name (optional); SOD and EOD, dropdowns 12:00am–11:45pm in 15-minute steps with
  the meridiem in the entries; LL (lesson length menu); LC (lesson cost, in the coach's currency);
  skaters per lesson; ice type; Days (default only) or SD/ED (temp only). MF (missed-lesson fee)
  exists but is hidden in MVP.
- **Tabs are block templates.** Each tab holds one SOD/EOD/LL/LC set and produces one block per
  day it covers. The view opens with one tab and a `+`; `+` adds a tab with SOD, EOD, LL and Days
  cleared; each tab has an `✕`, except when it is the only one. At least one tab is needed for
  **Next**.
- **The slot calendar.** SOD and LL fill the calendar with back-to-back slots to EOD, or to
  7:00pm if EOD is blank. Clicking a slot toggles it; with LL unset, the slot is 30 minutes and
  LL becomes 30. **Every contiguous run of selected slots becomes one block.**
- **Block names.** `seq` is assigned once and never reused or renumbered (the next is one above
  the highest in that schedule). Every surface labels a block by its name, or *Block N* from
  `seq`. Names are coach-only, HTML-escaped and capped at 40 characters. In a temp, the editor
  doesn't ask for a block name until there is a second block. Overlap messages name both blocks
  and their times: *"Monday: Morning ice (6–11:30 AM) and Block 2 (10 AM–5 PM) overlap in time."*
- **Odd-cents warning** (not a block): when a block allows 2 or more skaters and its price
  doesn't split evenly — *"Split 2 ways, $45.01 is $22.51 and $22.50. One family will pay a cent
  more."* Shown whenever the price or skaters-per-lesson changes.
- **Next** runs validation, then the impact preview (§9), then needs the coach's acceptance.
- **Saving needs a sign-in from the last 15 minutes** (§15). The preview doesn't.
- The schedule `Name` is stored; applying a saved schedule is Phase 2.

### Calendars

- **The coach and the family both get a monthly calendar and a Sunday–Saturday week view** with
  previous and next. Clicking a date opens its week. Weeks are in the coach's timezone.
- The month marks every date with an override (one range query on `SCHEDULE#DATE#`).
- **The coach's calendar** is editable and shows who is booked. **The family's** is bookable and
  shows only free or taken.
- **Every lesson time is shown in the coach's timezone, labelled with it**, for every family.
- **A coach with no schedule:** the family sees the ordinary month with every day grey, plus a line
  saying the coach hasn't posted any times yet. The coach sees a prompt to build a schedule.

---

## 7. Lesson times, seats and booking

*Sources: ADR-006 d4–4b, ADR-009 d5, ADR-022 d8, ADR-025, ADR-031, ADR-033.*

### Lesson times

- **Every bookable time is stored** as a `LESSON#<date>#<startTime>` item in the coach's partition,
  made from the schedule. It is the lock: booking changes it from `OPEN` to `BOOKED`.
- **It carries every stamp:** price, currency, missed-lesson fee, notice period, `maxSkaters`,
  `iceType`, `scheduleVersion`. **`priceMinor` is the lesson's total price and the only place it
  is stored.** `maxSkaters` on a booked lesson time is never lowered.
- **`sched-lesson-roller`** keeps lesson times stored to the end of the booking window plus 12
  months (~15 months ahead), creating only those that don't exist. A schedule save adds and
  removes open ones (§9).
- **`HELD`** is a lesson time the coach cancelled and kept unbookable; it has no seats.
- **Availability is one range query on `LESSON#` items.** A family sees free (`OPEN`) or taken
  (`BOOKED` or `HELD`) and nothing else. Its read may include `priceMinor`, `shareCount` and
  `joinOrder`, never the pending leave. A lesson time holds no names.
- The lesson time goes back to `OPEN` when its last seat goes (a family's cancel, or a coach's
  cancel with release), or to `HELD` on a coach's hold.

### Seats

- **One `SEAT#<date>#<startTime>#<studentId>` per skater per lesson.** A private lesson has one
  seat, a shared lesson two.
- **A seat carries** `studentId`, `clientId`, `studentName` (display form), `seatStatus`, copies
  of `startsAtUtc`, `coachTz` and `durationMinutes`, `joinedAt`, `idempotencyKey`, `recurrenceId`,
  `bookedIntervalWeeks`, `inviteId`, `invitedByClientId`, `partnerName`, `partnerStatus`,
  `invitedClientId`, `choiceAnswerBy`, `confirmationSent`, `remindedOn`, `settleReminderSentOn`,
  `outcomeAt`, `recordedAt`, `paymentStatus`, `paidAt`, `markedPaidBy`, `paidVia`, `waivedAt`,
  `waivedBy`, `paymentReminderSent`, and the deadline keys.
- **No amount is ever stored on a seat.** A skater's share is worked out from the lesson time
  wherever it is shown (§8).
- **A seat that ends is moved, not kept**, in one transaction with its delete: cancelled → a
  `CANCELLED#` line; declined, withdrawn or expired → a `SEATEND#` record. Its key is then free
  for the same skater to book again.

### The booking window

Each picked time must fall **between today and the end of the month two months after this one**,
in the coach's timezone (on April 24: April, May, June). A recurring series is checked on its
first date only. A pick outside the window refuses the **whole** request (*"That date is further
ahead than you can book."*). The window only grows, so a retry is never refused by it.

### Booking a time

**One transaction per date:**

- update the lesson time — `lessonStatus = OPEN` and `startsAtUtc` in the future → `BOOKED`;
  `seatsTaken` set; `shareCount` = number of `BOOKED` seats; `joinOrder` lists them;
- put the seat, `BOOKED`, if it doesn't exist;
- with a share code, also put the invited seat (§8);
- with a share code or a sibling, a `ConditionCheckItem` on `COACH#<coachId>/STUDENT#<studentId>`,
  `studentStatus = ACTIVE`, in the same transaction (ADR-033).

Checked before anything is written: the skater is linked and `ACTIVE` with that coach
(`requireActive`, §16), the invited skater or sibling is `ACTIVE` with the coach (the share-check's answer; the transaction's `ConditionCheckItem` stays the authority), each pick is
inside the window, a series' end date is no more than 12 months after its first pick.

**A failed date is attributed by reading the family's own seat key** for that skater (strongly
consistent):

| Seat found | Reported as |
|---|---|
| exists, with this request's `idempotencyKey` | **booked** (a retry found its own write) |
| exists, from another request | **already booked for this skater** |
| none | **unavailable** |

The family never reads another family's seat. "Does not exist" and "taken by someone" are one
message: *"lesson slot either does not exist or is already taken."*

### Recurring bookings

- The family marks a booking **recurring**, picks a frequency — **every 1, 2, 3 or 4 weeks**,
  default 1 — and an **end date no more than 12 months** after the first lesson.
- **Every date is booked when the series is made**, each its own transaction, in parallel, with
  failures collected (never `BatchWriteItem`). **Partial success** is reported:
  *"Booked 22 of 26 lessons. These dates could not be booked: …"*
- Every seat carries a shared **`recurrenceId`** and **`bookedIntervalWeeks`** (never updated).
- **A `RECURRENCE#` header** is written in the family's partition **after** the dates, only if at
  least one date booked. It records what was asked for (`endDate` is the requested end date).
  `recurrenceStatus` is `ACTIVE` or `ENDED`. **The application never deletes a header.**
- **One recurrence per selected slot**: Monday 4pm and Wednesday 4pm are two series.
- **Idempotency.** Every request carries a client-generated **idempotency key**. `recurrenceId` is
  **derived from the key, weekday and start time**. A key seen with a different request body is
  rejected; the app makes a fresh key whenever the request changes. The app retries once on a
  server error with the same key.
- **Header repair.** Whenever a family's bookings load, any `recurrenceId` with at least one
  upcoming lesson and no header gets one rebuilt (from any seat: skater, family, weekday, start
  time; `intervalWeeks` from `bookedIntervalWeeks`; `startedOn` from the first; `endDate` from the
  last), written only if no header exists.
- **A resubmission that drops a slot** the failed attempt included asks: *"You also have
  Wednesdays at 4:00pm booked from your earlier attempt."* **[Keep them] [Cancel them]**. Cancel
  runs *cancel all future lessons* on that series.

### Booking with more than one coach

- **One coach at a time.** The booking pages have a **Coach** dropdown of the selected skater's
  coaches; a coach still to approve that skater is listed but can't be picked. Switching coach
  keeps picks made with other coaches; switching skater clears them.
- *Your picks* groups by coach with a total per coach, never one total.
- **One Repeat and one Until** for the whole booking, applied to every pick.
- Both booking pages show the selected coach's cancellation notice period. With more than one
  coach, the confirm pop-up says *"Coaches can have different cancellation notice periods."*
- **One request per coach.** The result page has one section per coach; a failed coach's section
  says nothing was booked with them and offers **Try again**, which resends only that coach's
  picks.
- **Clash warning, not refusal.** Any overlap in time with the skater's lessons with another coach
  is warned about (*"Mia already has a lesson with Coach Sam at 4:00 on Tue 14 Oct. Book
  anyway?"*), listing every clashing date for a series. Lessons that only touch don't clash. Read
  from the family's seats through GSI1 (which may miss a seat made a second earlier). Only the
  family is warned.
- **My bookings** lists every coach's lessons, each labelled, with a **Coach** filter ("All
  coaches", only coaches with upcoming lessons) beside the skater filter.

### Rescheduling

There is none. Moving a lesson is **book the new time, then cancel the old one**, and the UI
presents it in that order.

---

## 8. Shared lessons

*Sources: ADR-015, ADR-024, ADR-026, ADR-031, ADR-033.*

### Inviting

- Every booking starts private. Other families never see that a time could be shared or how
  many it takes.
- **A *share this lesson* box appears only on times whose block allows 2 or more skaters.** It
  takes one share code; a note says the other family must accept before their skater joins.
- **The code is checked before the booking continues**; a good code shows *"Mia R."*.
- **Only a skater `ACTIVE` with the coach can be invited** (ADR-033). The share step asks
  `POST /api/client/share-check` on `api-client`, body `{ shareCode, coachId }` →
  `200 { displayName, onCoachRoster }`, or 404 if the code doesn't exist. The sender comes from
  the token; the caller must have a skater `ACTIVE` with that coach, else the ordinary 404.
  `api-client` resolves the code to the skater ID (never returned) and reads that coach's
  `STUDENT#<studentId>` projecting only `studentStatus`. `onCoachRoster` is true only for
  `ACTIVE`; `PENDING` and never-a-student both answer false. Covered by the firewall's code-lookup
  rule (§17); writes an access-log line (§18). It is advice for the screen: the booking
  transaction's `ConditionCheckItem` (§7) stays the authority.
- **Refused at the share step:** *"Mia R. isn't one of Coach Dana's students yet. Mia's family can
  sign up with Coach Dana's code, and once Coach Dana accepts Mia you can share a lesson."*
  Nothing is booked.
- **Book stays disabled** while the share-code box has anything in it, until the share-check for
  that exact code and coach answers `onCoachRoster: true`. A check in flight, a failed or
  rate-limited check, and a changed code or coach all keep it off; clearing the box allows a
  private booking (ADR-033 2a, amended 2026-10-20).
- **The booking transaction puts the invited seat**: `INVITED`, the invited skater's `studentId`
  and display name, `inviteId`, `invitedByClientId`; **no `clientId`, no GSI1 keys**. It holds the
  place at once.
- One invitation covers a whole series: one invited seat per date, same `inviteId`.
- **A sibling** in the booking family is added directly, `BOOKED`. A sibling not yet accepted is
  shown as not available to add until the coach accepts them, and can't be picked. No
  invitation.
- **The booking family pays the full price until the invited skater joins.**

### The invited family

- `consumer-invite` **emails them at once** with the invitation.
- `consumer-invite` adds `invitedClientId` and the invited family's GSI1 keys to the invited seat,
  so the invitation shows on their Home and My bookings before they answer.
- **The link opens a confirm page that needs sign-in**; opening it does nothing on its own. The
  page shows any of the skater's clashing lessons; the family chooses **Go ahead** or **Cancel**.
- **Accepting is the invited family's own write**, one transaction per date, after
  `requireActive` (§16), conditional on the seat having **no `clientId`**, being `INVITED`, and
  its `studentId` being the caller's skater. It sets `clientId`, `INVITED → BOOKED` if the lesson
  hasn't started, and `shareCount` goes up. A skater no longer `ACTIVE` with the coach gets the
  ordinary "no longer available".
- **Declining** (same condition as accepting) moves the seat to `SEATEND#` as `DECLINED`.
- **A series joins lesson by lesson**; each date succeeds or fails alone.

### Ending an invitation

| Case | What happens |
|---|---|
| Invited family declines | `SEATEND#` `DECLINED` |
| Booking family withdraws | Allowed only while `INVITED` and `invitedByClientId` is the caller → `SEATEND#` `WITHDRAWN` |
| Booking family cancels their own seat, invited seat `INVITED` | Their cancel ends it `WITHDRAWN` in the same transaction |
| Booking family cancels their own seat after the invited family accepted | An ordinary leave of a shared lesson, in time or late |
| The lesson starts first | `EXPIRED` (the `EXPIRE` deadline). **No earlier cutoff.** The lesson goes ahead private |

When an invitation ends, `seatsTaken` drops and the lesson stays private at the full price, or
reopens if no seat is left.

### Read-only copies

**`consumer-invite` writes them**, about a second after the change, never either family:

- `partnerName` and `partnerStatus` on each seat — the other skater's display name and status;
- `invitedClientId` and GSI1 keys on an invited seat;
- `choiceAnswerBy` on the staying seat while a pending leave waits, with `partnerStatus = LEFT`;
  cleared once answered.

Each family reads only its own seats. The lesson time's pending leave is the authority.

### Price shares

- **Share = `priceMinor ÷ shareCount`**, odd cents one each to the earliest skaters in
  `joinOrder`. Worked out wherever it is shown: booking and cancel pop-ups, My bookings, the
  payment reminder, the coach's Payments page and unpaid list, the weekly unpaid reminder, the
  financial page.
- **`shareCount`** counts skaters splitting the price. It goes up when a skater joins or fills a
  freed place; is set to the remaining skaters when the staying family keeps after an in-time
  leave; **doesn't change on a late leave**. `INVITED` seats don't count.
- **`joinOrder`** appends a joiner. After an in-time leave the leaver stays in it until the staying
  family answers; Keep sets it to the remaining skaters. A late leaver stays in it.

### Leaving

Either family, the same rules. One transaction per date.

- **In time** (outside the notice period): the leaver's seat → `CANCELLED#` line; `seatsTaken`
  drops; the **lesson time** records a **`pendingLeave`** (`leaveId`, `leftStudentId`, `leftAt`,
  `stayingStudentId`, `answerBy`). The staying seat isn't touched; their share stands.
- **Late** (inside the notice period, or a no-show): the leaver's line records their share of the
  missed-lesson fee (charge is Phase 2). The staying skater keeps their share and isn't asked.

**`answerBy`** is whichever comes first: the start of that lesson's notice period, or **7 days
after the leave**.

**The staying family answers:**

- **Keep it private at the full price** — their own write to the lesson time, conditional on the
  pending leave naming their skater as staying: clears it, `shareCount = 1`. The lesson becomes a
  **freed place**.
- **Cancel with no charge** — their seat → `CANCELLED#`, pending leave cleared.
- **No answer by `answerBy`** — the hourly sweep cancels it with no charge (`cancelledBy =
  NO_ANSWER`).

Both emails — *keep at full price or cancel*, and *cancelled, no answer* — are always sent.

### The staying family's card

- Built from the family's own seats: each with `choiceAnswerBy` is a date waiting for an answer;
  who left comes from `partnerName`, the full price from the lesson time. Grouped by
  `recurrenceId`, one card per series; earlier waiting dates from one-off cancels by the same
  skater merge into it.
- **One date:** keep at full price, or cancel with no charge.
- **Several:** one card listing each date with its answer-by and the totals, with **Keep all
  remaining dates**, **Cancel all remaining dates** (confirm: *"No charge. This can't be
  undone."*) and a choice per date. Each date is its own transaction, re-checked first; dates
  that started, were answered or were cancelled are skipped and listed as no longer available.
  Cancel all sends one email listing the dates; the coach isn't emailed.

### Freed places

After a Keep, **Invite a skater** appears on that lesson in **My bookings only**. It works like a
booking-time invitation, for **that one lesson only**.

### Changing a shared series

While **any future lesson in a series has another skater, joined or invited**, a family can only
**cancel one lesson** or **cancel the series**. *End earlier* and *make less frequent* are hidden
until no future lesson is shared.

### Deadlines

| `dueKind` | On | When |
|---|---|---|
| `EXPIRE` | Invited seat still `INVITED` | The lesson's start |
| `ANSWER` | Lesson time | The pending leave's `answerBy` |

An invitation still unanswered at the lesson's start expires with the ordinary "no longer
available" email.

Screens work out *expired* and *cancelled, no answer* from the time itself, never waiting for the
sweep.

### Who sends what

- `consumer-invite`: the invitation, and every outcome email — joined, declined, withdrawn,
  expired ("no longer available"), and "the other skater can't make it — keep or cancel".
- `consumer-change-notifier`: every cancellation email, including *cancel all* and *no answer*.

### Coaches see every skater

The week view, lesson list, payments and rinkside page show every skater in a lesson, each with
their own attendance and payment. A coach cancelling a lesson cancels every seat, and each family
is told.

---

## 9. Schedule changes: preview, cancel and re-price

*Sources: ADR-006 d5–7, ADR-008 d8, ADR-010 d5, ADR-020, ADR-031 d11, d14.*

### One evaluator

**The preview and the background change share one evaluator in `core/`.** It compares the lesson
times the old and new schedules produce and sorts each into:

| Outcome | Execution |
|---|---|
| **Add** | Put a new `OPEN` lesson time with the new `scheduleVersion` |
| **Remove** | Delete an `OPEN` lesson time **only if still `OPEN`**; if a family booked it since the preview, it becomes a **cancel** in the same batch |
| **Cancel** | Move every seat to a `CANCELLED#` line and delete the lesson time, in one transaction |
| **Re-price** | Set the lesson time's new `priceMinor` (and fee); every share follows. A `REPRICED#` line per seat whose share changes |

A `HELD` lesson time the new schedule doesn't produce is removed; one it still produces stays
held. Adding and removing **open** lesson times are part of the save, not batch lines.

`scheduleVersion` lives on `SCHEDULE#DEFAULT` and goes up on every save. Each lesson time records
the version that made it, so a booking can never land on a time the save removed.

### Re-pricing rules

- **Which lesson times:** those the new schedule still produces with the same start and length,
  where the producing block's price differs. Dates under a temporary schedule follow its blocks.
- **Increases** reach only lessons starting **later than `requiredNoticeHours`** from when the
  change is carried out. **Decreases** reach every upcoming lesson.
- **Past lessons are never re-priced.**
- The missed-lesson fee follows the same rules (no effect in MVP; the fee is 0).

### The preview

Shown after validation, before anything is written, for default and temporary changes alike:

- every lesson the change will **cancel**;
- every lesson it will **re-price**, with old and new amounts — *"14 lessons for 6 families will
  change from $50 to $60. Each family will be emailed."*;
- **which lessons an increase won't reach** — *"The new price won't apply to 3 lessons in the
  next 24 hours, which are inside your notice period. They stay at $50."*;
- how long the schedule runs (a temp until its end date; the default indefinitely);
- that accepting emails affected families;
- **a large-price-change warning** when any price changes by **50% or more** of the old price, up
  or down: at the top, in the theme's warning colours with an icon and words, specific (*"This
  lowers the price from $60 to $6 — a 90% cut."*). **Accept stays disabled until the coach ticks
  *"I've checked the new price"*.**

**The preview is advisory.** A booking made after it that the save cancels is cancelled in the
batch, with the ordinary cancellation email. The save goes ahead without asking the coach again.
No booking counter.

### Execution

`api-coach` writes the schedule and nothing else. `ScheduleChanged` reaches
`consumer-schedule-change`, which:

1. **Derives every key from the stream record**: `batchId` from its event ID, the header timestamp
   from its creation time, line keys from those plus the seat key. A retry can only resume.
2. **Claims the batch** by writing the header with `attribute_not_exists(SK)`, `planStatus =
   WRITING`. A failed claim means resume.
3. **Writes the whole plan** — the header and every cancel and re-price line, `PLANNED` — then sets
   `planStatus = COMPLETE`. Nothing is carried out before that. A resume that finds `WRITING`
   re-runs the evaluator and writes only missing lines.
4. **Re-checks each line** against the current schedule and the current lesson time and seats
   before acting; if no longer needed, marks it `SKIPPED` with `BOOKING_GONE`,
   `NO_LONGER_NEEDED` or `LESSON_PASSED`.
5. **Carries out each line in its own transaction**, marking it `EXECUTED` in the same
   transaction.
6. **Marks the header `EXECUTED` last.**
7. The header reaching `EXECUTED` raises `LessonsChanged`; the notifier sends **one message per
   family** covering everything in the batch.

**`LESSON_PASSED`** lines are reported to the coach in the batch notification: *"These lessons
were due to be cancelled, but their time passed before the cancellation could be applied."*

### The coach sees whether it finished

The schedule page shows the latest batch's state from its header, refreshing while it applies:

| State | Shown |
|---|---|
| Not `EXECUTED`, under an hour old | *"Applying your changes to 14 lessons…"* |
| `EXECUTED`, not every family told | *"Changes applied. Emailing 6 families…"* |
| `EXECUTED`, every line notified | *"Done — 6 families emailed."* |
| Not `EXECUTED`, over an hour old | *"We're having trouble applying this change. We've been alerted, and your families haven't been notified yet."* |
| Any `LESSON_PASSED` | The lessons listed, with a prompt to waive them and contact the families |

### Change-batch records

- **Every cancellation in the system** — client, coach, schedule change, sweep — writes a
  `CHANGEBATCH#` header and one line per seat. A single-lesson cancel is a batch of one, written
  in one transaction with header and line already `EXECUTED`.
- Batches and lines live in DynamoDB (the coach reads them); they may additionally be archived to
  the reports bucket under `coach=<coachId>/cancellations/<batchId>.json`.
- Cancelling occurrences of a series doesn't end the series; `recurrenceId` on the line lets the
  coach see "3 of this family's 24 Mondays".

---

## 10. Cancellation

*Sources: ADR-009, ADR-015 d1a, d6, ADR-031 d8–9.*

### General

- **Cancelling never changes the schedule.**
- **Lessons already started, checked in or marked no-show are never cancelled** by any bulk
  action. Day and week scopes run from now forward.
- **A cancellation by the coach, a schedule change or the sweep is never charged.** A family's own
  late cancellation is charged from Phase 2 (§12).
- Every line records `cancelledAt` and `noticeHours` (the gap to the lesson's start).

### By the family

- **My bookings** has a **cancel** button on each lesson, with a confirmation and the line
  *"Bookings cancelled within 24 hours may incur a late cancellation fee."* The booking page shows
  no fee in MVP.
- **Recurrence management** offers exactly three operations, all subtractive:
  - **move the end date earlier** — later dates cancelled as one batch;
  - **reduce the frequency** — `intervalWeeks` may only go up; dates off the new interval
    cancelled as one batch;
  - **cancel all future lessons** — marks the header `ENDED`.
- **"Future" excludes today's lesson.**
- **A frequency change anchors** on the first occurrence that is neither today's nor past; that
  occurrence always survives, and the new interval counts from it.
- **Late occurrences** in any of the three are named in the confirmation with *"may incur a late
  cancellation fee"*.
- **No extending** a series and no increasing its frequency; a family wanting more books another
  series.
- **Shared series:** only cancel one lesson or cancel the series (§8).
- The coach is notified of a family's cancellation **only when it is inside `requiredNoticeHours`**
  (§13).

### By the coach

- **The coach week view** lists the week by time: *Open*, the skater's name, or held.
- **Scopes:** this lesson, this day, this week. Each lesson asks **release** (seats move to
  `CANCELLED#`, the lesson time reopens) or **hold** (seats move to `CANCELLED#`, the lesson time
  becomes `HELD`) — **asked per lesson**, never once for a selection.
- **A hold is permanent.** There is no release action. Families see a held time as taken.
- **"This week"** is the Sunday–Saturday week on screen, from now on. The button states the range
  and count: *"Cancel remaining lessons Wed 14 – Sat 17 (6 lessons)."* A future week cancels all
  of it.
- **Anything larger than one lesson** shows the affected lessons first, states that accepting
  emails families, and needs acceptance — the same preview component as schedule changes.
- **From the rinkside page**, two places: a **cancel section** (whole or part of a day, whole or
  part of a week, specific lessons — "part of" is a multi-select) and a **cancel action on each
  lesson in the check-in list**.
  - **Disabled with no signal:** *"Cancelling needs a connection."*
  - **A cancel from the check-in list always confirms, even for one lesson.** The dialog names the
    lesson (skater, date, time), puts its confirm button away from where the original tap landed,
    keeps the lesson if dismissed, and holds the release-or-hold choice.
- Both surfaces write the same records with `cancelledBy = COACH`.

---

## 11. Attendance and the rinkside page

*Sources: ADR-014, ADR-023, ADR-031 d15.*

### The page

- **`<domain>/coach/rinkside`**, part of the coach website, signed in through the coach website's
  sign-in. Built and tested as an **ordinary browser tab**; nothing depends on Add to Home Screen.
- **Only a signed-in coach can use it** (ADR-023 d7). Until the coach signs in, the page shows only
  the sign-in screen. Every rinkside route needs a valid token **and** the `Coach` group; a family's
  token is refused with 403 (§15).
- Reached from **a large link at the top of the coach's Today page** and **a link at the top of the
  coach's morning email** (§13).
- **A "Your dashboard" link at the top of every screen after sign-in** goes back to the coach
  website's Today page, in the same tab (ADR-023 d8).
- **Offers:** today's lessons, check-in and no-show per seat, a guardian's contact details on a
  tap, and cancellation.
- **Session:** 4 hours from sign-in (§15).

### Offline

- **A service worker scoped to `/coach/rinkside/`** caches the page and today's lessons (skater
  names and times, **no contact details**), fetched whenever the page opens with signal. No other
  part of either site has a service worker.
- **If today's lessons aren't cached:** *"Today's lessons haven't loaded. Open the app with signal
  before you leave for the rink."*
- **If the page opens with signal and finds its offline copy gone** (Safari can clear site data),
  it says so plainly and reloads it.
- **With no signal, attendance is captured on the phone** — the seat and the tap time — and a
  banner, not dismissible while anything is queued, says check-ins are saved on the phone and will
  send when signal returns.
- **Queued entries are sent** as soon as the page is open with signal; on Android and Chrome also
  through **Background Sync** when the page is closed. The queue survives a reload.
- **Only attendance is queued.** Cancelling and contact reveal need signal.

### Recording attendance

- **Two outcomes per seat: present or absent.** Only `CHECKED_IN` raises `CheckInRecorded`;
  `NO_SHOW` raises `NoShowRecorded`.
- **The seat stores `outcomeAt`** (the phone's tap time) and **`recordedAt`** (server time).
  Views read `outcomeAt`.
- **`outcomeAt` is accepted whenever it arrives** if it falls **between one hour before the
  lesson's start and the end of that day** (coach's timezone) and **is not in the future** beyond
  a small clock-skew allowance.
- **Capture is a conditional write: the seat must still be `BOOKED`.** A replay of something
  already recorded fails the condition and is **dropped silently** as success. A replay onto a
  cancelled seat finds no seat.
- **A replay onto a lesson the family cancelled** is shown to the coach as what it is — *"this
  lesson was cancelled by the family at 3:50pm, after you recorded it"* — then cleared. Other
  failures stay visible and queued.
- **Entries the server rejects** (time doesn't fit the lesson) are listed on the phone: *"2
  check-ins couldn't be sent. Tap to see them."* Each shows skater, lesson, what was recorded, the
  phone's tap time and *"The phone's time didn't match the lesson"*, with **Record on the website**
  and **Done**. An entry leaves the phone on Done or after **7 days**; a day before, it is marked
  *"Will be removed tomorrow."*

### Correction

**Capture is rinkside; correction is website-only.** The **coach lesson list** shows skaters with
lessons in a chosen date range with their attended or no-show state, and the coach can change
either way. Correction overwrites deliberately and doesn't carry the capture condition, so a
stale queued replay arriving after it is dropped.

### Contact details

A tap on a skater fetches the guardian's contact details from `api-coach`, shown for that tap
only and never written to the phone. With no signal: *"Contact details need a connection."* Every
reveal is logged when it happens (§18).

---

## 12. Payments and the financial page

*Sources: ADR-003, ADR-015, ADR-018, ADR-020, ADR-030, ADR-031 d7.*

### Model

- **BladeBook never moves money.** It tells families what they owe and lets the coach record that
  it arrived. No ledger, no balance, no credit, no partial payment.
- **Price is flat per lesson**, independent of length.
- **Payment is per seat.** A shared lesson's families pay and are marked separately.
- **The amount a seat owes is its share**, worked out from the lesson time (§8). In MVP every
  skater pays the schedule's price — no personal prices.
- **`paymentStatus`:** `UNPAID` → `PAID` (**mark as paid**, records `paidAt`, `markedPaidBy`) or
  `WAIVED` (**mark as waived**, records `waivedAt`, `waivedBy`). Only the coach sets it. Waiving
  carries no amount.
- **How the client paid (`paidVia`)**: chosen when marking paid from the payment types the coach
  has switched on, plus *Other*. No free text. **Optional, editable afterwards, shown only on coach
  screens.** A waived lesson has none. Stored on the seat, so turning a type off later doesn't
  change past records.
- **GSI3** holds a seat while `UNPAID`; paying or waiving removes it. A skater's unpaid lessons
  for the coach: GSI3 filtered on `studentId`.
- **`paymentReminderSent`** guards the automatic reminder; it is not payment status.

### No-shows and late cancellations

- **A no-show keeps its seat**, `UNPAID`, until the coach marks it paid or waived. The dashboard
  and the weekly reminder show it at its **share of the lesson price, labelled as a no-show**.
- **The missed-lesson fee is 0 in MVP** and nothing is charged for a late cancellation.
- Chargeable from Phase 2: a line is charged only when `cancelledBy = CLIENT` **and**
  `noticeHours < requiredNoticeHours` **and** `missedLessonFeeMinor > 0`, from any screen; a
  no-show is charged too. In a shared lesson the leaver owes their share of the fee.

### The coach's screens

- **Payment dashboard:** lessons in a chosen date range, filter by unpaid, mark as paid (with
  how-paid) and mark as waived. Each amount in its own currency; never a total across currencies.
- **Lesson list:** attendance correction (§11).

### Weekly unpaid reminder

- `sched-unpaid-reminder` runs **weekly, Monday morning** in the launch timezone.
- It scans GSI3 for **past** seats still `UNPAID` and older than a **threshold held in Parameter
  Store**. **No threshold set means it sends nothing.**
- **One email per coach**, to the **login email**: *"You have unpaid lessons from more than
  [threshold] ago. Please mark each one as paid or waived."*, listing date, time, skater and
  amount, a link to the payment dashboard. Lessons with no recorded outcome say *attendance not
  recorded*; no-shows are labelled.
- Each listed seat is stamped **`settleReminderSentOn`**, so a lesson is listed once.

### Financial page

- Shows **year-to-date gross** and **year-to-date rink fees** for the **calendar year**, in the
  coach's currency.
- **Gross is money received:** seats marked paid, at their share, plus missed-lesson fees actually
  collected (in MVP, a no-show marked paid). Waived and unpaid are left out. **A lesson counts in
  the year and month of its lesson date.**
- **A finished year is closed**; a lesson from it marked paid later counts in no year.
- Before the figures, the page says they are **calculated from the lessons marked as paid**, and
  that rink fees are an **estimate to check against what was paid**.
- **Rink fees are calculated by BladeBook** from the rink's terms, which the developer sets. The
  coach can't edit terms, override a month or type in what they paid. **How the fee is calculated
  is undecided**; until then the page shows one reading, marked as such: 15% or $500 a month by the
  coach's choice, a lesson counted in the month it was taught.
- **Download:** a CSV for this year or last — one row per month with gross, rink fees and net, plus
  year totals. **No names or personal data.** Reads live data only, filtered on `expiresAt`.
- Year figures are a range query on the coach's `SEAT#<date>` items.

---

## 13. Notifications

*Sources: ADR-002 d7, ADR-003 d6–7, ADR-006 d6, ADR-007, ADR-009 d9, ADR-010 d3, ADR-016 d8,
ADR-018, ADR-021, ADR-023, ADR-026, ADR-031 d14, ADR-033.*

### Rules for every email

- **Every family gets email.** In MVP there is **no SMS to families**.
- **Every client-facing email sets `Reply-To: businessEmail`.** The sender stays the app's verified
  domain.
- **Emails to the coach about their own account and lessons go to `loginEmail`**: the daily report,
  the morning email and the weekly unpaid reminder.
- Coach-authored free text (`paymentInstructions`, block names) is HTML-escaped.

### Per message

| Message | To | When | Rule |
|---|---|---|---|
| Booking confirmation | Family | Each seat becoming `BOOKED` | Guard `confirmationSent` on the seat |
| Day-of reminder | Family | ~7:00am | **One per lesson per skater**, no digest. Guard `remindedOn` on the seat, keyed on (seat, date) |
| Coach's morning email | Coach | ~7:00am, only if the coach has lessons that day | Lists the day's lessons, **rinkside link first** (a plain link, no sign-in token). Same job as the day-of reminder. Guard `morningEmailSentOn` keyed on (coach, date). No off switch in MVP |
| Payment reminder | Family | `CheckInRecorded` | The seat's amount and the coach's `paymentInstructions`. One per lesson |
| Cancellation or re-price | Family | Batch header `EXECUTED` | **One per family per batch**, listing every cancelled and re-priced lesson. Says cancelled and links to availability; never proposes alternatives. A decrease reads as good news: *"Good news: 3 of your lessons are now $50."* |
| Family cancelled | Coach | A family's cancellation **inside `requiredNoticeHours`** | One email per batch; and one SMS if `smsCancellationAlerts` is on |
| Decline | Family | Coach declines a `PENDING` skater | From `consumer-student-link` |
| Shared-lesson emails | Families | §8 | |
| Weekly unpaid reminder | Coach | §12 | |
| Business-email confirmation link | Coach | New business email | |
| End-of-day report | Coach | ~9:00pm | §14 |

**Routing by actor:** `COACH` and `SCHEDULE_CHANGE` batches go to each affected family; `CLIENT`
batches go to the coach (late ones only); `NO_ANSWER` batches go to the staying family.

**Notification state** on each line: `notificationStatus`, `notifiedAt`, `channels`,
`failureReason`. The notifier reads the batch's `EXECUTED` lines, groups by family, sends, stamps
that family's lines; families already `SENT` are skipped on a retry; `SKIPPED` lines aren't
notified.

### The coach's late-cancellation SMS (the only SMS in MVP)

- Sent only when `smsCancellationAlerts` is on; **one text per cancellation batch**.
- **Template:** `BladeBook: <skater> cancelled <day> <date> <time>. See email.` — for several
  lessons, `BladeBook: <skater> cancelled <n> lessons from <date>. See email.`
- **Every SMS is one 160-character GSM-7 segment, checked in code before `sns:Publish`.**
  Transliterate to GSM-7 first (`’`→`'`, `—`→`-`, `é`→`e`), count extension-table characters
  (`[ ] { } \ ~ ^ |` `€`) as two, and refuse anything that still doesn't fit.
- **No free text in an SMS.** Variable fields have budgets and truncate with a single `.`.
- **The SMS is a pointer; the email is the record.**
- **The opt-in confirmation** goes once to the coach's `phone` when `smsCancellationAlerts` first
  turns on. It is the one message allowed two segments, and carries program identity, message
  frequency, rate disclosure, HELP and STOP.
- **Call `CheckIfPhoneNumberIsOptedOut` before publishing.** If opted out, don't send and record
  `SUPPRESSED`.
- **Consent belongs to the phone number.**
- One length-and-encoding unit test per template.

---

## 14. Scheduled jobs

*Sources: ADR-001 d4, ADR-010 d2a, d5k, ADR-014 d7, ADR-018, ADR-023, ADR-031 d1, d12.*

| Job | When | What it does |
|---|---|---|
| `sched-day-reminder` | ~7:00am | Query `DATE#today` on GSI2; email each seat's family; email each coach with lessons their morning list. |
| `sched-daily-report` | ~9:00pm | Query `DATE#today` on GSI2; split seats into **checked in, no-show, pending** (pending = no outcome recorded; not a stored state); email the coach; archive to S3 at `coach=*/date=*/`. **Writes nothing to the table.** |
| `sched-unpaid-reminder` | Weekly, Monday morning | §12. Off until its threshold is set. |
| `sched-drift-check` | Nightly | §19. Read-only. |
| `sched-lesson-roller` | Nightly | Creates missing lesson times up to the end of the booking window plus 12 months. |
| `sched-deadline-sweep` | **Hourly** | Queries GSI4 for what's due, **re-checks each record**, acts, sets the next deadline or removes it. Its cancellations go through a change batch with `cancelledBy = NO_ANSWER`. |

- **The end-of-day report names each pending skater and lesson** with *"No attendance recorded. If
  you recorded these on the rinkside app, open it with signal to send them; otherwise record them
  on the lesson list."* It is a snapshot and isn't regenerated when a late check-in arrives.
- **Reminders and the report include only `BOOKED`, `CHECKED_IN` and `NO_SHOW` seats.**
- **Each Scheduler trigger carries the date it is for**; jobs never read the clock for it, so a
  replay or re-run works on that date.
- Jobs read the seat's `coachTz` and filter on it.
- The roller and sweep have **no dead-letter queue**: each is safe to run twice, and a completion
  metric drives its missed-run alarm (§19).

---

## 15. Sign-in and sessions

*Sources: ADR-016 d3–4, ADR-023 d2, d4–7, d9–10.*

- **Two Cognito app clients in one user pool:** one for the coach website, rinkside page
  included, and one for the family website (ADR-023 d9). Each has its own sign-in return
  addresses and token settings.
- **Each API checks which app client issued the token.** `api-coach` accepts only the coach app
  client's tokens and `api-client` only the family app client's, refusing others with 403 in the
  same shared check as the group check below. The REST API's Cognito authorizer can't tell app
  clients apart, so the check is in the API code (ADR-023 d9).
- **`api-coach` requires the `Coach` group** on every route, the rinkside routes included
  (ADR-023 d7). The Cognito authorizer only checks that a token is valid, and a family's token from
  the same pool is valid, so `api-coach` checks `cognito:groups` in one shared check and refuses a
  token without `Coach` with 403. The `coach-tenant` role then confines the request to that
  coach's partition (§16).
- **`api-client` requires the `Client` group** on every route, in the same kind of shared check,
  and refuses a token without it with 403 (ADR-023 d7). A coach's token can't use the family
  website's routes.
- **These checks cover every route that needs a sign-in.** `api-client`'s coach-code lookup
  before sign-up and `/health` take no token (ADR-023 d7, amended 2026-10-24).
- **A new account gets its group when its email is confirmed** (ADR-023 d10): a Cognito
  post-confirmation trigger adds `Coach` for the coach app client and `Client` for the family
  app client, and the website refreshes its tokens before the first signed-in request.
- **Every limit is measured from `auth_time`** (when the password was last entered, not reset by a
  refresh):

| Where | Signed in for |
|---|---|
| Coach website | **60 minutes** |
| Family website | **60 minutes** |
| Rinkside routes (`/coach/rinkside`) | **4 hours** |
| Saving a schedule change | Sign-in within the last **15 minutes** |

- Cognito's refresh-token lifetime is **4 hours** on the coach app client and **60 minutes** on the
  family app client (ADR-023 d9). `api-coach` and `api-client` enforce the shorter
  limits on `auth_time`, returning a "sign in again" error the sites handle.
- **A schedule save past 15 minutes** is refused with a specific error; the website asks for the
  password (and multi-factor authentication (MFA) code if on) and retries the save. The window is
  configuration.
- **The coach website warns before 60 minutes run out** and keeps unsaved work, above all in the
  schedule editor.
- MFA is available to coaches.
- Queued rinkside check-ins wait across a sign-out and send after the next sign-in.

---

## 16. Data isolation

*Sources: ADR-002, ADR-021, ADR-022, ADR-024, ADR-025 d3, ADR-026 d4, ADR-031, ADR-033.*

**Two gates everywhere a person's token reaches the table: code and database.** Identity
(`coachId`, `clientId`) always comes from the verified token, never the request body.

### Coaches — `coach-tenant`

- `api-coach`'s execution role holds **no DynamoDB actions**; it can only assume `coach-tenant`.
- **Per request**, after the token is verified, it assumes `coach-tenant` with **session tag
  `coachId = <sub>`**, **source identity `<sub>`**, **session name `coach-<sub>`**, for one hour.
  Credentials are cached per `coachId` per container and refreshed five minutes before expiry.
- **`coach-tenant` policy:** `GetItem`, `Query`, `PutItem`, `UpdateItem`, `DeleteItem`,
  `ConditionCheckItem` on the table and **GSI3**, where `dynamodb:LeadingKeys =
  COACH#${aws:PrincipalTag/coachId}`. Plus, on `CODE#*`: `PutItem`, `UpdateItem`, `DeleteItem`,
  `ConditionCheckItem`, attributes limited to `PK`, `SK`, `coachId`, `coachFirstName`,
  `coachLastName`, `profilePhotoKey`, `ReturnValues = NONE`, **no reads**.
- **Trust policy:** only `api-coach`'s execution role, only with exactly one tag key, `coachId`.
- **In code**, `core.data`'s `clientFor(AccessContext)` is the only place a coach-path client is
  made. **Local mode** returns an unscoped client and **refuses to start unless the endpoint is
  `localhost`**.
- `api-coach` writes only `STUDENT#` items for approval; `consumer-student-link` writes the
  family's link item.

### Families — `client-tenant` and `code-lookup`

- `api-client`'s execution role holds **no DynamoDB actions**.
- **Tags:** `clientId` (from the token); `coachId` (the coach the request is about, from the
  family's own link items or a just-resolved code); `linkStatus` (`ACTIVE` if any of the family's
  skaters is `ACTIVE` with that coach, else `PENDING`).
- **Two sessions per request, both cached:** the first, tagged only `clientId`, reads the family's
  own partition (and `CODE#`) to find `coachId` and `linkStatus`; the second carries all three
  tags and does the work. The method that assumes the second takes a **`LinkedCoach`**, which only
  `core.data` constructs from those reads.
- **`client-tenant` policy:**
  - **own partition** (`CLIENT#<clientId>`): full item access;
  - **GSI1**: same `LeadingKeys` condition on the index;
  - **coach's partition, reads**: `GetItem`/`Query` only with `Select = SPECIFIC_ATTRIBUTES`, only
    allowlisted attributes, **only when `linkStatus = ACTIVE`**. The allowlist covers schedule
    items, the coach profile's public fields and the lesson-time fields availability needs
    (`priceMinor`, `shareCount`, `joinOrder`, never `pendingLeave`), the family's own seat read,
    and `studentStatus` alone on `STUDENT#` items, by key, for the share-check (§8, ADR-033 d2a).
    **It fails closed.**
  - **coach's partition, writes**: `PutItem`, `UpdateItem`, `DeleteItem`, `ConditionCheckItem`,
    `ReturnValues` held to `NONE` — applies to `PENDING` sessions too. The booking's
    `ConditionCheckItem` on the invited skater's `STUDENT#` item (§7) needs no policy change;
  - **`CODE#*`**: `GetItem` of `coachId` and the coach's name and photo key only;
  - **`SKATERCODE#*`**: `GetItem` of `studentId` and the display name only (the ID is never returned
    to the browser).
- **`code-lookup`** (before sign-in, untagged): `GetItem` on `CODE#*` for those attributes,
  `Select = SPECIFIC_ATTRIBUTES`, nothing else.
- **`ReturnValuesOnConditionCheckFailure` is never used on the client path** (an ArchUnit rule on
  `api-client`; the policy also refuses it).
- A `PENDING` family can't book: a code rule, since its writes into the coach's partition are
  allowed for registration and skater edits.

### The write link check

- **New writes take a `LinkedSkater`**, not a skater ID. It has a private constructor; the only
  source is **`ClientLinks.requireActive(caller, skaterId)`**, which reads the family's own links
  and returns one only for a linked, `ACTIVE` skater. Every repository method that writes into a
  coach's partition for a family takes one.
- **Writes to an existing item** add `clientId = :callerSub` to the condition, inside the
  repository method.
- **ArchUnit:** nothing outside `core.data` constructs a `LinkedSkater` (including through
  deserialisers or annotations); `api-client` reaches the coach's partition only through these
  methods.
- **Failures:**

| Why | Response | Logged |
|---|---|---|
| Linked, but not `ACTIVE` now | HTTP 409: *"Mia's lessons are no longer available to book. Contact Coach Dana."* | Ordinary event |
| Never this family's | HTTP 404 | **Security event** in the access-log group: family ID, the ID asked for, operation, request ID, source address, time — never values. Written by `core.data` |

- **Alarms (page):** one family with **3 or more** never-linked failures in **15 minutes**; **10
  or more** across everyone in a **day**. Thresholds and windows are configuration.
- **No family's action writes another family's records**, except answering an invitation
  addressed to its own skater (§8).

### What only code enforces

Item types within a partition, and one family's writes against another family's items under the
same coach (held by `LinkedSkater` and the ownership condition).

---

## 17. Web Application Firewall

*Sources: ADR-019, ADR-027 (dev), ADR-033.*

- **One web access control list (ACL)**, attached to the **REST API's stage** and to the **Cognito
  user pool**. CloudFront serves only the static site and has none.
- **Rules:**

| Rule | Limit |
|---|---|
| AWS managed core rule set | — |
| AWS managed known bad inputs | — |
| AWS managed IP reputation list | — |
| Rate, every request | **1,000 per 5 minutes** per address |
| Rate, client sign-up, coach-code lookup, share-code lookup and `/share-check` | **20 per 5 minutes** per address |
| Rate, Cognito sign-up and sign-in | **10 per 5 minutes** per address, scoped down to Cognito requests (e.g. on `x-amzn-cognito-operation-name`) |
| Rate, `/health` | Its own rule; number set when built |

- The account-takeover-prevention managed rule group is not used.
- **Production runs every rule in count mode for the first two weeks after launch**, then, after
  review, block.
- **Settings per environment:** `wafEnabled` (off deletes the ACL), `wafMode` (`count` |
  `block`), `wafLogging`. Production's firewall is never off.
- **Logs:** only requests a rule matched; the `Authorization` header redacted; **30 days**
  retention; log group named `aws-waf-logs-…`. Production logging on from launch.
- **Dev:** firewall off by default; switched on in block mode to rehearse before launch and before
  releases that change the API's routes or request shapes.

---

## 18. Personal-data access logging

*Sources: ADR-012, ADR-017, ADR-024, ADR-029, ADR-030, ADR-033.*

- **Application logging is the primary record.** Every read that returns personal data logs:
  actor and role, the record identifiers returned, **the names of the personal-data fields
  returned**, operation, time, request ID, source address. **Never the values.**
- **Enforced by the compiler:** every `core/` method returning personal data takes an
  **`AccessContext`** and logs before returning; there is no overload without it. Plus the
  `DynamoDbClient` ArchUnit rule (§1).
- **Scheduled jobs log one aggregate line per run** (job, date, counts by type, field names once).
- **Family reads are logged** with `clientRelationship`.
- **Also logged:** contact reveals on the rinkside page, the rink-number download, archive
  restores (who, which coach and skater, reason, when), the link-check security events, the
  share-code lookup and the share-check route, which return a skater's display name (ADR-012, ADR-033).
- **Not logged:** the financial page's summary export (no personal data).
- **Its own log group** with its own read policy. Only the owner's operator role can read it,
  through IAM Identity Center with MFA. Nothing logs reads of the access log.
- **CloudTrail data events** on the table and the reports, archive and access-log buckets, in
  production and dev. Tenant sessions make CloudTrail name the coach (`coach-<sub>`) or family
  (`client-<sub>`).
- **Retention:** **90 days** in CloudWatch; every line also streamed by a subscription filter
  through Amazon Data Firehose to its own S3 bucket (SSE-KMS, public access blocked, object-level
  data events), moved to **S3 Glacier Deep Archive** and **deleted after 2 years**. No Object Lock.

---

## 19. Reliability and operations

*Sources: ADR-010, ADR-011 d6c, ADR-017 d4, ADR-024, ADR-027, ADR-031 d12.*

### Tolerances

| Path | Tolerance | Pages? |
|---|---|---|
| Cancellation notification | Minutes | Yes |
| Day-of reminder (7am) | Within the hour | Yes |
| Booking, schedule editing | Hours | No |
| Check-in | A day | No |
| End-of-day report | A day | No |

### Every event consumer

- **A dead-letter queue, a depth alarm and a redrive decision**, plus an **idempotency guard**:

| Consumer | Guard | When its queue fills |
|---|---|---|
| `consumer-change-notifier` | `notificationStatus` | Replay at once (pages) |
| `consumer-schedule-change` | Event-derived keys and the plan | **Reconcile, never replay** (pages) |
| `consumer-booking-confirmation` | `confirmationSent` | Replay |
| `consumer-payment-reminder` | `paymentReminderSent` | Replay |
| `consumer-student-link`, `consumer-family-sync`, `consumer-invite` | Idempotent by construction | Replay |
| `sched-day-reminder` | `remindedOn`, `morningEmailSentOn` | **Discard** once the date has passed |
| `sched-daily-report` | S3 key per (coach, date); email guard to build | **Re-run for that date** |
| `sched-unpaid-reminder` | `settleReminderSentOn` | Discard |
| `sched-drift-check` | Read-only | Discard |
| `sched-lesson-roller`, `sched-deadline-sweep` | Re-check / create-if-missing | No queue |
| `consumer-ttl-archiver` | Object key from item key | No queue; stream-age alarm, point-in-time recovery |

- **Operator commands:**
  - `redrive-dlq --function <name> [--dry-run]` — lists messages, then replays, discards or re-runs
    per the table. Refuses `consumer-schedule-change`.
  - `reconcile-schedule --coach <coachId> [--dry-run]` — invokes `consumer-schedule-change`
    directly: first **finishes every unfinished batch** for that coach, then compares the lesson
    times the current schedule produces with the stored ones and their seats, writing any
    difference as a new batch with `batchSource = RECONCILE`. Safe to run any time.

### Drift check

`sched-drift-check`, nightly, read-only: for every coach with lessons in the **next 30 days**
(found through GSI2), checks recent batch headers and the evaluator's verdict on stored lesson
times and seats in that window.

| Finding | Response |
|---|---|
| A batch unfinished for more than an hour | Page |
| A lesson that should have been cancelled and wasn't | Page |
| Only re-prices outstanding | Dashboard |

### Alarms

- **Scheduled jobs:** a **dead man's switch** — `Invocations` `Sum < 1` over the window, with
  **`treatMissingData: breaching`**. The sweep and roller use their completion metrics
  (`DeadlineSweepCompleted`): the sweep pages after **2 hours** without a completed run; the
  roller shows on the dashboard after one missed night and pages after **3**.
- **What pages:** SES bounce rate approaching 5% or complaint rate approaching 0.1%; the
  notifier's and the schedule-change consumer's queue depth above 0; a batch unfinished over an
  hour; a lesson that should have been cancelled and wasn't; the 7am reminder not firing; the
  sweep or roller as above; **DynamoDB Streams iterator age climbing** on the Pipe or the
  archiver; the link-check alarms (§16); the up-check; a dev scanner finding.
- **Pages go by SNS to the owner's phone**, never email.
- Everything else is a morning dashboard read.
- **Alarms live in production permanently.** In dev they are switched on only to prove they fire.

### The event path

**The Pipe (Streams → bus) has its own failure destination**, and its stream iterator age is
alarmed: if it stalls, no consumer runs and no consumer alarm fires.

### Checks on production

- **Up-check, always on:** health checks call the website's home page and the API's **`/health`**
  route (no sign-in, reads no data, returns "OK") about once a minute, alarming through the paging
  route.
- **Post-deploy check:** the production deploy ends by running the **schedule-change-that-cancels
  Playwright flow once against production**, as a dedicated **test coach and test family**. A
  failure fails the deploy job.
- **The test accounts:** emails to a mailbox the owner controls; no SMS; a fictional skater;
  marked as test accounts and left out of anything counted across coaches; credentials in Secrets
  Manager; their cancellations are real records.

### Backups

- **Point-in-time recovery** on the table (35 days); **deletion protection**; **`RETAIN`**.
- **Monthly DynamoDB export to S3**, triggered by EventBridge Scheduler, stored in S3 Glacier
  Instant Retrieval, deleted after 12 months.
- **Restore** goes to a new table; recovery **copies data back by default** and repoints only for
  total loss. The runbook pauses notifications during a restore and, once erasure ships (Phase 2), re-applies the erased-ID list.

---

## 20. Retention and archive

*Sources: ADR-002 d2b, ADR-017, ADR-031 Consequences.*

- **TTL attribute `expiresAt`.** Each code path that creates or changes an item sets it from a
  **per-item-type window in configuration**. A type with no window gets no `expiresAt`. Changing a
  window needs a one-off backfill. Reads that must be exact filter `expiresAt > now`.

| Item | `expiresAt` set when | Window |
|---|---|---|
| Date override | Written | Its date + date-override window (30 days proposed) |
| Temp header | Written or edited | Its `endDate` + date-override window |
| Held lesson time | Written | Its date + date-override window |
| Past lesson time | Its last seat and line have gone (or, never booked, on the date-override window) | With the last of them |
| Seat, `PAID` or `WAIVED` | **Settled** | Settlement + booking window |
| Seat, `UNPAID` | **Never** while unpaid | — |
| `SEATEND#` | Written | Cancellation window |
| Cancellation line (not chargeable) | Written | Cancellation window |
| Re-price line | Written | Cancellation window |
| Cancellation line (chargeable, Phase 2) | Settled | Settlement + cancellation window |
| Change batch header | With its lines | **Never earlier than its latest line** (only ever raised) |
| Recurrence header | Written, and when its end date moves | `endDate` + booking window |
| Rejected `PENDING` skater | — | **Deleted immediately** |
| Profiles, links, `SKATER#`, `CODE#`, default schedule | Never | Account lifecycle; erasure on request from Phase 2 |

- **Every window holding lesson or payment records is at least 16 months.** The other windows wait
  on the legal review.
- **History screens say** lessons settled more than *N* months ago are archived and can be
  requested, *N* read from the retention setting.
- **`consumer-ttl-archiver`** reads the stream, matches **only TTL removals** (`REMOVE` by the
  DynamoDB service), and writes each old image to:

  ```
  s3://bladebook-archive/coach=<coachId>/student=<studentId|none>/type=<itemType>/<yyyy-mm-dd>/<itemKeyHash>.json
  ```

  One object per item. The bucket: **versioning off**, private, Block Public Access, SSE-KMS,
  TLS-only, CloudTrail data events.
- **Lifecycle:** to **S3 Glacier Deep Archive 30 days** after writing, with an **explicit minimum
  object size below 128 KB** so small objects transition; expiry after the archive window (at
  least 210 days), set by the legal review.
- **Erasure** on request is an explicit delete, never TTL, and must reach the table, the archive
  and every coach the skater had (design in `docs/deletion/`). *Phase 2 (owner, 2026-10-20).*

---

## 21. Environments: production and dev

*Sources: ADR-010 d7, ADR-011, ADR-012 d5, ADR-019 d4, ADR-027, ADR-028, ADR-032.*

### Accounts

- **Two AWS accounts in one Organization:** production and dev. Sign-in through **IAM Identity
  Center with MFA**.
- The domain's zone is in production; **`dev.<domain>` is delegated** to a hosted zone in the dev
  account.
- **Production is the only long-running environment.**

### Dev

- **A full stack** from the same infrastructure code, **built when needed and destroyed after**.
  One at a time. Domains `dev.<domain>` and `api.dev.<domain>`, not indexed.
- **Built as two stacks:** the **account stack** (Cognito pools and test accounts:
  `coach-a@example.com`…, `client-1@example.com`…), then the **application stack**, whose table is
  **created by one import from one file**. Nothing is loaded into a dev table afterwards.
- **Two data sources, never mixed:**
  - `build-dev` — **seed data**; always before launch, the default after.
  - `build-dev --masked --coaches <id>,… [--clients <id>,…] [--as-of <timestamp>] --reason "…"` —
    a **masked subset of production**, only on request. Naming a client brings in all their
    coaches.
- **The build fails** if the import's item or error count differs from what the seed script or
  transform wrote; the application stack is then torn down. The transform also refuses duplicate
  keys.
- **Dev never leaves the SES sandbox** and **has no SMS number**. Firewall and alarms off by
  default.
- **Teardown deletes everything** in dev. Which retention settings apply is derived from the
  environment name in one place, and an infrastructure test asserts production's table and buckets
  are retained and protected. **No teardown while a scanner finding is open.**
- `build-dev` may run from the owner's machine or a workflow.

### Masked builds

Run by an **AWS Step Functions workflow** in a **data-loading stack in the production account**:

1. Export production (now, or `--as-of` within point-in-time recovery's 35 days) to an **export
   bucket** readable only by the transform, which **deletes its contents after a day**.
2. The **transform Lambda** filters to the named coaches' partitions, their families' `CLIENT#`
   partitions and their `CODE#` items; masks; remaps identities; and checks its own work.
3. It writes the masked file to a **masked bucket**, readable only by the dev account's import,
   which **deletes its contents after 24 hours**. A failed check writes no file.
4. The dev build imports it; **the dev scanner runs** as soon as the build finishes.

The workflow's run history and CloudTrail record who ran it, when, what and why. Dev's access logs
are written to a bucket in the data-loading stack, out of teardown's reach, kept as long as
production's.

### Masking rules

- **Masking happens in the pipeline, never in dev.** No unmasked row ever exists in a dev table.
- **Replaced wherever they appear:** skater and family names, emails and phones (on `STUDENT#`,
  `CLIENT#` profile and links, `SKATER#`, `CANCELLED#` lines); the coach's `firstName`, `lastName`,
  `loginEmail`, `businessEmail`, `phone`, `paymentInstructions` (replaced wholesale), payment
  handles and `coachCode`; the `CODE#` key, rewritten to the same masked code; registration
  numbers (a fake in the right shape for the skater's organization, ADR-028 amended 2026-10-20);
  names in reports.
- **Undeliverable by construction:** emails `<token>@example.com`; phones `+1 555 01XX`; names from
  a fixed word list. Masked coach codes are valid-looking.
- **Deterministic** within a build (same input, same output), with a **salt rotated every build and
  never stored**.
- **Structure is kept:** dates, times, prices, statuses, `isMinor`, block patterns, counts, key
  prefixes, `expiresAt`.
- **Identity remap:** each named coach and family is mapped, **by order**, onto the test accounts
  (first coach requested → `coach-a`, first client → `client-1`; requested clients first; overflow
  clients get a random identifier). A mapped account's emails are its test login. Every occurrence
  of a Cognito `sub` is rewritten (partition keys, `clientId`, GSI keys, `markedPaidBy`,
  `waivedBy`, `cancelledById`, link sort keys, `CODE#` `coachId`). More names than the pool holds
  stops the run. **No mapping is written anywhere.**
- **Profile photos** become one placeholder.
- **Transform self-checks, per item, before writing:** every masked field differs from its input;
  emails and phones match the masked patterns; **every string field is on an allowlist of
  non-personal fields or matches a masked pattern (deny by default)**; no production identifier
  survives. **Any failure aborts the whole run.**

### The dev scanner

A Lambda in dev's application stack applies the same deny-by-default rule to the dev table, the
reports bucket and the archive bucket; any object in photo storage other than the placeholder is a
finding. **Its role can't read production.** Runs after every masked build, on demand, and daily.

- **A finding:** page; automatically **disable dev's Cognito app clients**; log item key and field
  name, **never the value**; then triage (real or allowlist gap → scope → origin → who read it →
  purge and rebuild → reportability). Purge is a human action after triage.
- **An allowlist gap** is fixed by a reviewed commit adding the field, never a console edit.
- **The scanner not running** is a dead man's switch alarm, not an exposure.

### What dev is for

The bulk-cancellation consumer against realistic data before releases touching scheduling,
cancellation or payments; the Playwright flows; proving alarms; the firewall rehearsal; the
database-gate tests; reproducing an incident (masked build).

---

## 22. Testing

*Sources: ADR-013, ADR-021 d7, ADR-022 d9, ADR-023 d6–7, d9–10, ADR-024, ADR-025, ADR-026, ADR-033.*

- **No feature ships without automated tests.** Integration tests against DynamoDB Local count.
- **Tooling:** JUnit with DynamoDB Local (`backend/`); **Vitest + React Testing Library**
  (`web/`); infrastructure tests in whichever IaC tool is chosen; **Playwright** for two flows.
- **Build gates:** an ArchUnit rule that **every public class in `core/` has a test class**;
  **mutation testing (PIT) on `core/` only**. **No coverage threshold.**
- **Logic in both Java and TypeScript** (slot expansion, price totals, week and date arithmetic) is
  tested on both sides **from one shared JSON fixture at the repo root**, with **expected outputs
  written by hand**.
- **Playwright, two flows only:** (1) book a lesson end to end; (2) save a schedule change that
  cancels bookings. Flow 2 is also the post-deploy check (§19).
- **Database-gate tests run against real AWS (dev)**, never DynamoDB Local (which ignores IAM),
  from `docs/runbooks/database-gate-tests.md`. They prove each tenant role reaches only its own
  partition, transactions spanning two tenants are refused whole, untagged sessions can't be
  made, execution roles hold no DynamoDB actions, pending families read nothing of the coach,
  the read allowlist holds, `ALL_OLD` is refused, the lookups return only their allowed
  attributes, a booking transaction whose invited seat names a skater not `ACTIVE` with the coach
  is refused whole, and a `GetItem` of a `STUDENT#` item projecting only `studentStatus` is allowed
  for an `ACTIVE` session but refused with any other attribute or for a `PENDING` session
  (ADR-033). **Rows for `LESSON#`, `SEAT#`, `SEATEND#` and GSI4 must be written and pass before
  building on them.** Any change to `client-tenant` re-runs the `ALL_OLD` row.
- **Required tests** (not exhaustive): cross-tenant isolation; the database gates; the link
  consumer (each outcome, delivered twice); the read allowlist against the model's attribute
  names; block expansion (daylight saving, uneven blocks, abutting blocks, mid-week overrides);
  the one schedule-change evaluator; recurrence partial success and retry attribution; one
  idempotency test per consumer (run twice, one effect); the masking transform; every SMS
  template's length and encoding; the access-log emitting function (right actor, fields);
  money arithmetic; `requireActive` outcomes, the ownership condition, the `LinkedSkater`
  ArchUnit rule, the security event's content; each session limit and that a refreshed token
  keeps `auth_time`; every `api-coach` route, rinkside included, refuses no token and a `Client`
  token (403), and every `api-client` route refuses a `Coach` token (403); each API refuses a token from the other website's app client (403), even with the right group (ADR-023 d9); the rinkside queue (survives reload, duplicate dropped, failed stays
  visible, future time rejected, both outcomes); the report's three-way split (no outcome is
  never a no-show); multi-coach (per-coach `linkStatus`, clash warning, one coach's failure, a
  contact change reaching every coach); shared lessons (a seat never in another family's
  availability, a family can't change another family's accepted seat, a share-code lookup
  returns only the name (to the family), a coach cancel covers every seat and notifies each family once, a
  `PENDING` skater is refused as a sibling or invitee, a booking naming a non-`ACTIVE` invitee is
  refused whole, a skater declined between invitation and answer can't accept, the inviting
  family's cancel after acceptance is an ordinary leave, the share-check answers false for a
  `PENDING` or unknown skater).
- An infrastructure test asserts `api-coach`'s and `api-client`'s execution roles hold no
  `dynamodb:` action, and production's table and buckets are retained and protected.

---

## 23. Continuous integration and deployment

*Sources: ADR-013 d2, ADR-027, ADR-032.*

- **GitHub Actions**, workflows in `.github/workflows/`.
- **Every merge into `main` builds, runs every test that needs no AWS** (Java, web, ArchUnit,
  mutation testing) **and tags a version.**
- **Production deploys only a tagged build** — the exact package from `main`, never a rebuild —
  **after the owner's approval**, then runs the post-deploy check. A failed check means the owner
  rolls back.
- The least-privilege infrastructure check runs as a build gate once the IaC tool is chosen.
- **Before any workflow deploys to either account, all of these are in place:**
  1. every action pinned to a **full commit hash** (version in a comment); as few third-party
     actions as possible;
  2. AWS reached **only through OIDC**; no stored keys;
  3. the role trust policy checks `aud = sts.amazonaws.com` and `sub` exactly — for production,
     `repo:<owner>/<repo>:environment:production`; no wildcards;
  4. production deploys run in a GitHub environment `production` that **requires approval** and
     allows only `main`;
  5. `main` protected: no direct or force pushes; pull requests with the checks passing; the
     owning GitHub account uses two-factor authentication;
  6. workflow tokens read-only by default; `id-token: write` only on jobs that reach AWS; no
     `pull_request_target`; forks never get AWS credentials;
  7. separate least-privilege deploy roles per account. The production deploy role may read the
     one Secrets Manager secret with the test accounts' passwords. Deploy roles must not read the
     table's data or the access log.
- **Building dev by hand** with `build-dev` and the owner's Identity Center sign-in is allowed
  before that setup exists.

---

## 24. Not in MVP

**Phase 2**

- SMS to families: day-of and payment reminders, the cancellation digest, shared-lesson and
  price-change texts, the family's opt-in and its confirmation.
- The *"just booked"* email for a booking cancelled by a save made after its preview.
- Late-cancellation and no-show **charges**, the MF field in the editor, a definite fee amount at
  booking and in confirmations, the `NoShowRecorded` payment reminder, chargeable `CANCELLED#`
  lines with payment fields and GSI3 entries.
- Editing `requiredNoticeHours`.
- Personal prices (`priceMinorOverride`) and discounts.
- A manual *send payment reminder* action, with `paymentReminderCount` and `lastPaymentReminderAt`
  and a rate limit.
- Families seeing their own unpaid history and cancellation history.
- "Also coached by" for coaches (`otherCoaches`, with a one-off backfill) and the disclosure line
  when adding a coach.
- Removing a skater (from one coach or all) and what the family sees.
- Coach profile photos (upload, bucket, resize, display before sign-in).
- Skate Canada and Hockey Canada numbers.
- Financial page: past years on screen and a per-lesson export with names.
- Rink selection in the schedule builder.
- A coach booking for a family.
- Recurrence extension.
- Changing a coach's currency.
- Applying saved, named schedule templates.
- Coach-selectable themes.
- Distinct cancellation email templates by reason.
- A switch to turn off the coach's morning email.
- A scheduled production canary.
- Real delivery confirmation (SES event destinations, bounces and complaints).
- The build deleting the masked file as soon as it has been imported.
- The consent-link roster join for shared lessons: inviting a skater new to the coach,
  `AWAITING_COACH` seats, the warning and its 9pm timing, the banners, the late-confirmation rule,
  `INVITER_LEFT`, the coach's Accept joining seats, and their emails. Answer review gap G16 first,
  for example with rotatable share codes (ADR-033).
- Deleting a skater's data on request (erasure): choosing between the two drafts in `docs/deletion/`,
  reaching the table, the archive, the monthly backups and every coach the skater had, plus the
  erased-ID list a restore re-applies (owner, 2026-10-20).
- In-app payments; waitlists and packages; coach analytics; multi-timezone scheduling (one rule per
  timezone).

**Phase 3**

- A reminder to renew a skating membership or update the number.
- Travel time between rinks in the clash check.

**Later, undesigned:** licensed coach sign-up (a licence number issued on purchase).

---

## 25. Still undecided

**Blocks building**

- **Infrastructure as Code: CDK or Terraform**, against ADR-001 A4's criteria.
- **The rink-fee calculation** (`docs/Q_Rink-Fees.md`).
- **The family read allowlist** for `LESSON#` and the family's own `SEAT#`, and the **gate-test
  rows** for `LESSON#`, `SEAT#`, `SEATEND#` and GSI4, and ADR-033's rows (the booking's
  `ConditionCheckItem` refused whole for a non-`ACTIVE` invitee; the `studentStatus`-only
  projection allowed for an `ACTIVE` session, other `STUDENT#` attributes and `PENDING` sessions
  refused), and the share-code read's row (`studentId` and the display name only; any other
  attribute, no projection, or a `Query` refused).
- **IAM roles** for `sched-lesson-roller` and `sched-deadline-sweep`.
- **Event names** for `consumer-invite`'s trigger and the roller's and sweep's schedules.
- **Which function sends the coach's SMS opt-in confirmation.**

**Settings and details**

- The unpaid-reminder threshold; its weekly Monday cadence; whether an unsettled lesson is listed
  again.
- The date-override window (30 days proposed).
- The `/health` rate limit.
- US Figure Skating and Learn to Skate USA number formats; where the USA Hockey check-digit setting
  lives and who changes it.
- The rink-number download's phase, and whether the name is split at sign-up or at download.
- How the business-email confirmation link is built and how long it lasts.
- Bounds on `requiredNoticeHours` (for Phase 2 editing).
- Whether the 7-day answer-by should be checked with Kim.
- **Whether a coach booking for a family (Phase 2) is held to the 3-month window** (ADR-031 Open).
- Whether suppression of the coach's number should also switch off `smsCancellationAlerts`.
- Whether other actions need a recent sign-in (day or week cancellation, approve and decline,
  changing contact or payment details).

**Operations**

- The restore runbook (decided in outline, not written).
- Correlation IDs from API Gateway through the bus.
- What CloudTrail records for reads of a CloudWatch Logs group.
- Operator alert SMS on its own SNS topic and configuration set; whether it needs 10DLC
  registration.
- The test accounts' mailbox.
- How long dev may hold masked data; a teardown leftover check; whether an import produces stream
  records; whether the account stack stays up between builds.
- Dependabot for pinned actions; GitHub run-log retention; narrowing CDK's bootstrap role if CDK is
  chosen.

**Legal review**

- Every retention window marked for it (§20), the archive window, the access-log and firewall-log
  windows, registration-number retention, and minors' data handling in general.

**Product**

- Licensing, photo moderation, and the new coach's first sign-in experience.
- What the Phase 2 fee is charged against when it differs from the lesson price.

---

## 26. Source map

Which ADRs feed which sections. Read an ADR for the reasoning and the alternatives turned down.

| ADR | Title | Feeds |
|---|---|---|
| [001](ADR-001-backend-stack.md) | Backend stack and project layout | §1, §2, §3 |
| [002](ADR-002-client-registration.md) | Client registration and the client↔student link | §4, §5 |
| [003](ADR-003-lesson-pricing-and-payment.md) | Lesson pricing and payment tracking | §3, §12 |
| [004](ADR-004-schedule-patterns.md) | Schedule patterns | §6 |
| [005](ADR-005-booking-horizon-and-recurring-lessons.md) | Booking horizon | *Nothing — fully superseded* |
| [006](ADR-006-open-booking-recurring-lessons-and-cancellation.md) | Overrides, recurring lessons, cancellation records | §6, §7, §9 |
| [007](ADR-007-sms-message-constraints.md) | SMS message constraints | §13 |
| [008](ADR-008-schedule-editor.md) | The schedule editor | §6, §9 |
| [009](ADR-009-cancellation.md) | Cancellation | §10 |
| [010](ADR-010-availability-and-reliability.md) | Availability, reliability and alerting | §9, §14, §19 |
| [011](ADR-011-staging-environment.md) | Production data masking | §21 (masking rules) |
| [012](ADR-012-pii-access-logging.md) | Personal-data access logging | §18 |
| [013](ADR-013-testing-requirement.md) | Testing requirement | §22 |
| [014](ADR-014-check-in-app-and-offline-capture.md) | Check-in and offline capture | §11 |
| [015](ADR-015-late-cancellation-and-no-show-charges.md) | Late-cancellation and no-show charges | §10, §12 |
| [016](ADR-016-coach-signup.md) | Coach sign-up | §4, §13 |
| [017](ADR-017-data-retention-ttl-and-archive.md) | Retention, TTL and archive | §20 |
| [018](ADR-018-unpaid-lesson-reminder-to-coach.md) | Unpaid-lesson reminder | §12 |
| [019](ADR-019-waf-in-mvp.md) | Web Application Firewall | §1, §8, §17 |
| [020](ADR-020-repricing-booked-lessons.md) | Re-pricing booked lessons | §9 |
| [021](ADR-021-tenant-isolation-at-the-database.md) | Tenant isolation at the database | §16, §22 |
| [022](ADR-022-client-isolation-at-the-database.md) | Client isolation at the database | §5, §8, §16, §22 |
| [023](ADR-023-rinkside-check-in-joins-the-coach-website.md) | Rinkside joins the coach website | §1, §11, §13, §15, §22 |
| [024](ADR-024-client-write-link-check.md) | The client write link check | §16 |
| [025](ADR-025-many-coaches-per-skater.md) | Many coaches per skater | §5, §7 |
| [026](ADR-026-shared-lessons-by-invitation.md) | Shared lessons by invitation | §5, §8, §16 |
| [027](ADR-027-on-demand-dev-environment.md) | On-demand dev environment | §19, §21 |
| [028](ADR-028-dev-table-built-from-one-import.md) | Dev table built from one import | §21 |
| [029](ADR-029-skater-registration-number.md) | Skater registration number | §5, §18 |
| [030](ADR-030-financial-page-gross-and-rink-fees.md) | Financial page | §12 |
| [031](ADR-031-lessons-and-seats.md) | Lessons and seats | §3, §7, §8, §9 |
| [032](ADR-032-ci-on-github-actions.md) | CI on GitHub Actions | §23 |
| [033](ADR-033-invite-only-accepted-skaters.md) | Only a coach's accepted skaters can share a lesson | §2, §3, §5, §7, §8, §13, §16, §17, §18, §22, §24 |
