# BladeBook — Architecture Review

**Date:** 2026-10-20 · **Reviewer:** architecture-review skill (Claude), with a challenger pass
**Scope:** the whole repository · **State:** planned (documents only; no `backend/`, `web/` or `infra/`)

---

## 1. Verdict

**Overall grade: Complex. Partly warranted.** The security core earns its complexity even at
five coaches, because the data is about children. That core is tenant isolation at the
database, personal-data access logging, separate production and dev accounts, and a locked-down
CI pipeline. Around it, several mechanisms are built for a scale, a team or a need this project
doesn't have yet. The biggest are the masked-production dev pipeline, the full shared-lesson
invitation flow, the extra archive tiers and the coach's text message. The three findings that
matter most:

1. **Coach multi-factor authentication (MFA) is optional** (G1, High). Sign-up is open to
   anyone, and a taken-over coach account exposes a roster of children and their guardians'
   contact details.
2. **A stranger can reach a child's and guardian's details through a shared-lesson invitation**
   (G16, High). They need a free coach account, a free family account and a share code that
   families pass around by design. Inviting only skaters already active with that coach closes
   it, and also removes much of the shared-lesson complexity (P4).
3. **The documented cost, about $22–34 a month, is above the $25 budget at its midpoint.** The
   SMS number (P6, G6) and the firewall (P1) are the movable lines.

## 2. Context assumed

Every verdict depends on these answers (saved in `.architecture-review.md`):

| | |
|---|---|
| Scale over 1–2 years | Tiny: ≤ 5 coaches, ≤ 100 end users |
| Monthly infrastructure budget | Under $25 |
| Builds and runs it | One person, part-time |
| Sensitive data | Personal data, data about minors, credentials for other systems |

**Conflict:** `architecture.md` §1 and §12 state about $20–32 a month idle for production. With
the firewall priced at its seven listed rules (`ADR-MASTER.md` §17), not five, that becomes about
$22–34.

## 3. Scorecard

| Part | Build | Ops | Cost | Cognitive | Overall | Verdict |
|---|---|---|---|---|---|---|
| P1 Edge and sign-in | Moderate | Moderate | Moderate | Moderate | **Moderate** | Warranted |
| P2 Tenant isolation and access logging | Moderate | Moderate | Simple | Complex | **Complex** | Warranted |
| P3 Booking core | Complex | Simple | Simple | Complex | **Complex** | Warranted |
| P4 Shared lessons by invitation | Complex | Moderate | Simple | Complex | **Complex** | Partly warranted |
| P5 Event processing and reliability | Complex | Complex | Simple | Complex | **Complex** | Partly warranted |
| P6 Messaging (email and SMS) | Moderate | Moderate | Moderate | Moderate | **Moderate** | Partly warranted |
| P7 Data lifecycle | Moderate | Moderate | Simple | Complex | **Complex** (adjusted up) | Partly warranted |
| P8 Environments, CI/CD and dev data | Complex | Moderate | Simple | Complex | **Complex** | Partly warranted |
| P9 Rinkside offline page | Moderate | Simple | Simple | Moderate | **Moderate** (adjusted up) | Warranted |
| **Whole system** | **Complex** | **Complex** | **Complex** | **Complex** | **Complex** | **Partly warranted** |

**Whole-system counts:**

- **Deployables:** about 22 → Complex. That is 16 Lambda functions, 3 operational functions, 1
  Step Functions workflow and 2 static sites.
- **Stores:** well over 7 → Complex. One table with four global secondary indexes (GSIs) and a
  stream, about eight S3 buckets, 11 dead-letter queues (DLQs) and an event bus.
- **Environments:** 2, plus a data-loading stack → Moderate.
- **External dependencies:** 5 → Moderate. Cognito, Simple Email Service (SES), SMS through
  Simple Notification Service (SNS) with carrier registration, GitHub Actions, and a domain
  registrar.
- **Multi-tenant isolation design:** Complex by rule.
- **Cognitive load:** Complex. There are 32 ADRs plus a 106 KB master, a 213 KB `architecture.md`
  and a 57 KB glossary, and amendment chains are long (ADR-001's Status section alone runs about
  110 lines).

Sources: `ADR-MASTER.md` §2, §17–21; `architecture.md` §3, §12; `ADR-010` decision 2a.

## 4. Parts

### P1 — Edge and sign-in — Moderate · Warranted

**What it is.** CloudFront and S3 serve the two sites. One Web Application Firewall (WAF) web
access control list (ACL), with 3 managed rule groups and 4 rate rules, sits on the API Gateway
REST stage and the Cognito user pool. Session limits are measured from `auth_time`, and a
public `/health` route serves the up-check.

**Counts:**

- 2 sites and an API stage
- no stores and no async paths
- 1 external dependency (Cognito)
- 3 layered trust boundaries: WAF → Cognito authorizer → `auth_time` checks
- special cases that need a table: rate rules, count mode for the first two weeks,
  per-environment switches, session limits

Sources: `ADR-019` d1–4b; `ADR-023` d4, d6; `ADR-MASTER.md` §15, §17.

**Grades.** Ops is Moderate: the count-to-block review and rule tuning are real work. Cost is
Moderate: about $12 a month is roughly 48% of the budget.

**Verdict: Warranted.** The threats it addresses:

- request floods on routes that need no sign-in;
- credential stuffing against Cognito;
- share-code enumeration, since `ADR-026` relies on "the lookup's rate limit";
- denial-of-wallet on a small budget.

API Gateway throttling caps the whole API and can't single out one address (`ADR-019` Context).
**Stale reasoning to fix:** `ADR-019` d2 justifies the code-lookup limit with "roughly 28
million five-character codes". Coach codes are now 8 characters, about 378 billion values
(`ADR-016`), so they no longer need it. Share codes, at about 17 million values per name
prefix, still do. Note that every rule runs in count mode for the first two weeks after launch,
so nothing is enforced on day one.

### P2 — Tenant isolation and access logging — Complex · Warranted

**What it is.** The design puts two gates everywhere a person's token reaches the table:

- The API functions hold no DynamoDB permissions of their own.
- Per-request Security Token Service (STS) roles do the work: `coach-tenant`; `client-tenant`,
  with two sessions, three tags and an attribute allowlist; and `code-lookup`.
- The types `LinkedCoach`, `LinkedSkater` and `AccessContext`, an ownership condition on
  writes, and ArchUnit rules hold the code side in place.
- Security events page on patterns.
- The personal-data access log records field names and its own log group. CloudTrail data
  events run in both accounts.

**Counts:**

- no new deployables
- 4 or more layered trust boundaries
- special cases that need their own documents: `ADR-021`, `ADR-022`, `ADR-024`, `ADR-012`
  (about 81 KB together)

The database-gate tests passed on 2026-10-05 (`runbooks/gate-results-20261005-*.txt`).

**Verdict: Warranted.** It protects against coach A reading coach B's roster, and against
family A reading or changing family B's records under the same coach. The data is about minors.
The two layers fail in different ways, a code bug versus a policy error, so this is defence in
depth rather than duplication. **The cost to watch** is cognitive. The allowlist fails closed,
so every new attribute means a policy edit and a gate-test re-run. The rows for ADR-031's
`LESSON#`, `SEAT#` and GSI4 are still unwritten (G9).

### P3 — Booking core — Complex · Warranted

**What it is.** Everything a lesson needs from schedule to tax page:

- the schedule editor: default schedule, temporary schedules, date overrides;
- stored lesson times, kept about 15 months ahead by `sched-lesson-roller`, and seats;
- the booking window and recurring series with headers and self-repair;
- idempotency keys, multi-coach booking and the clash warning;
- the preview evaluator, re-pricing, and cancellation by family and coach, including held times;
- payment tracking, the weekly unpaid reminder, and the financial page.

**Counts:**

- 4 deployables
- 1 table with GSI1–3
- special cases spread across eight ADRs

**Verdict: Warranted.** These are the product's requirements. The most complex rule, re-pricing
booked lessons, has direct coach evidence ("move if they are outside the notice period", `Items
to ask Kim About.md` §1; `ADR-020`). Stored lesson times give one lock for double-booking and the
schedule-save race (`ADR-031` Alternatives). `architecture.md` §10 already warns that MVP grew
from 8 features to 16.

### P4 — Shared lessons by invitation — Complex · Partly warranted

**What it is.** The full family-arranged sharing flow:

- share codes and invited seats (`INVITED`, `AWAITING_COACH`);
- a consent link that adds a skater to a coach's roster;
- pending leave with an answer-by time, keep or cancel, and keep-all / cancel-all cards;
- freed places with one-lesson re-invites, and `INVITER_LEFT`;
- warnings and banners;
- `consumer-invite` writing read-only copies across coaches, GSI4, and an hourly deadline sweep.

**Counts:**

- 2 deployables
- 3 stores: GSI4, `SKATERCODE#`, `SEATEND#`
- an async chain: family cancel → `INVITER_LEFT` → sweep → `SEATEND#` → stream → email
- special cases that need their own documents: `ADR-026` (48 KB) and `ADR-031` (38 KB)

**Verdict: Partly warranted.** Sharing comes from the owner's notes "after talking with an end
user", which make "sharing is by invitation" a product choice (`ADR-026` Status). There is no
coach evidence for it: every answer in Kim §8 was the owner's. So this isn't premature by scale.
It's a choice whose cost should be weighed.

- **Keep:** `maxSkaters` per block, one seat per skater, and the split price
  (`priceMinor ÷ shareCount`).
- **Recommended middle option:** keep family invitations, but **only for skaters already ACTIVE
  with that coach**. That removes the consent-link roster join, `AWAITING_COACH`, the WARN
  deadline and its 9 pm timing, and `INVITER_LEFT`. It also closes G16.
- **Simpler still: coach-arranged sharing.** This needs "a coach booking for a family", which is
  currently Phase 2, and it gives up the second family's in-app consent before they are added
  and charged.
- **What the middle option gives up:** a skater new to the coach can't join through an
  invitation. They register with the coach code first.
- **Trigger to restore the full flow:** families or coaches report that arranging a share this
  way is a burden.

### P5 — Event processing and reliability — Complex · Partly warranted

**What it is.**

- DynamoDB Streams → EventBridge Pipe → custom bus, feeding 6 event consumers and 3 scheduled
  jobs.
- A DLQ, depth alarm and redrive policy for each.
- A write-ahead plan for schedule changes.
- The `redrive-dlq` and `reconcile-schedule` operator commands and a nightly drift check.
- Dead man's switches, a Pipe iterator-age alarm, paging by SMS, and a post-deploy browser check
  in production.

**Counts:**

- 9 functions plus 2 operator tools
- 11 DLQs and the bus
- event chains: save → `ScheduleChanged` → batch `EXECUTED` → `LessonsChanged` → notifier
- 2 external dependencies: SES and SNS
- about 15–20 alarms

**Grades.** Ops is Complex for one part-time person.

**Verdict: Partly warranted.**

- **Keep** the core:
  - change-data capture (no dual writes);
  - the write-ahead plan and the reconcile command, because the consumer cancels a term's
    lessons in bulk (`ADR-010` d5, d7);
  - the notifier's DLQ and its page;
  - the 7 am dead man's switch;
  - the Pipe iterator alarm, since the Pipe is the single point of failure (`ADR-010` d6);
  - the read-only drift check.
- **Optional merge:** `consumer-booking-confirmation` with `consumer-payment-reminder`. They share
  a replay policy, neither pages, and the merged role only gains `TransactWriteItems`.
- **Don't merge** `consumer-student-link` with `consumer-family-sync`. Family sync writes across
  every coach's partition and would gain `DeleteItem` and `ses:SendEmail`. A bug there could then
  delete items anywhere in the table.
- **Don't merge either into the notifier.** Its queue pages and theirs don't.

### P6 — Messaging (email and SMS) — Moderate · Partly warranted

**What it is.** SES sends every family email, with Reply-To set to the coach. SNS sends one MVP
text, the coach's late-cancellation alert, plus its two-segment opt-in confirmation, GSM-7
checks and the opt-out lookup. Operator pages use SMS too. The number type (toll-free or 10DLC)
is undecided.

**Counts:**

- 3 external dependencies: SES, SNS and carrier registration
- special cases that need a table (`ADR-007`)

**Grades.** Cost is Moderate: SMS at $3–12 is the line that pushes the total over budget.

**Verdict: Email warranted. The coach's text is premature.** Its stated reason is the owner's
"A coach at the rink reads texts, not email" (`ADR-009` d9). Kim was asked about it and answered
only the notice-period part (`Items to ask Kim About.md` §9). The same alert already goes by
email. **Ask Kim directly whether she wants the text.** Dropping it saves $3–12 a month only if
pages also stop needing SMS (G6). It also removes the abuse path in G17.

### P7 — Data lifecycle — Complex (adjusted up) · Partly warranted

**What it is.**

- Time to Live (TTL) on `expiresAt`, with a 16-month floor.
- A TTL archiver writing to an archive bucket that moves to Glacier Deep Archive.
- Point-in-time recovery (PITR), deletion protection, and monthly exports kept 12 months.
- Daily `report.json` files in a versioned reports bucket.
- The access log streamed through Firehose to S3 and then Deep Archive for 2 years.
- Erasure on request, which is undesigned. The restore runbook is unwritten.

**Counts:**

- 4 deployables
- 5 stores and PITR
- 3 async paths
- a retention table and transition rules

The grade is adjusted up one step because erasure must reach every one of those stores, and
none of it is designed.

**Verdict: Partly warranted.**

- **Keep:**
  - TTL, which minimises data and is free;
  - PITR, deletion protection and `RETAIN`, because a consumer deletes in bulk;
  - the monthly exports, for corruption noticed late.
- **Archiver: premature, with a trade-off.** Cutting it means either raising the live-table floor
  to about 22 months, which covers self-employed coaches on a US tax extension, or withdrawing
  the "archived, contact BladeBook to request them" promise (`Open-Pending.md` §8). The coach's
  tax need is met by totals, which the MVP CSV keeps. **Gain:** one fewer function, bucket,
  lifecycle rule, restore tool and erasure target. **Trigger:** a coach asks for per-lesson
  records past the window.
- **Firehose tier for the access log: unwarranted.** CloudWatch Logs retention can be set to
  731 days directly. That gives the same retention and read policy with no stream, role, bucket
  or lifecycle rule. It gives up Deep Archive's restore delay on a log that holds identifiers
  only (`ADR-012` d2).
- **`report.json` to S3: unwarranted for MVP.** Its only stated use is Phase 2 analytics
  (`architecture.md` §6.4). It holds minors' attendance with versioning on and no window (G10).
  **Trigger:** Phase 2 analytics.

### P8 — Environments, CI/CD and dev data — Complex · Partly warranted

**What it is.**

- Production and dev accounts under one Organization, with IAM Identity Center sign-in.
- An on-demand dev environment, built as an account stack plus an application stack, with the
  table created from one import.
- Seed builds, and masked-production builds after launch: a Step Functions workflow, a
  transform Lambda, export and masked buckets, a cross-account import, a dev scanner, automatic
  containment and triage, and dev access logs kept in production.
- GitHub Actions with OpenID Connect (OIDC), pinned actions, owner approval, tagged builds and a
  post-deploy check.

**Counts:**

- 2 environments plus a data-loading stack
- 6 or more deployables
- 4 stores
- 3 or more trust boundaries
- masking rules that need their own documents (`ADR-011`, `ADR-027`, `ADR-028`)

**Verdict: Partly warranted.**

- **Keep:**
  - the two accounts, which cost nothing, can't be split later, and keep dev in the SES sandbox;
  - seed-only on-demand dev;
  - the CI lock-down (`ADR-032` d2) and the post-deploy check.
- **Masked-production pipeline: premature.** ADR-027 itself calls test-data-only "a large
  reduction in risk" (`ADR-027` Alternatives), and ADR-011 names it as the fallback. At ≤ 5
  coaches, a seed that mirrors a real term exercises the bulk-cancel consumer. **Gives up:**
  reproducing an incident on a masked copy of a real coach's data. **Removes:** the riskiest data
  path in the design. **Trigger:** the first incident seed data can't reproduce. Since it is
  post-launch and on request only, the cheap form of this advice is: don't build it until then.

### P9 — Rinkside offline page — Moderate (adjusted up) · Warranted

**What it is.** An entry point at `/coach/rinkside` with:

- a service worker scoped to that page;
- today's lessons cached, with no contact details;
- an offline queue that keeps the device's time, plus Background Sync where supported;
- server checks that the time fits the lesson, and capture only from `BOOKED`;
- a list of rejected entries kept 7 days, and contact reveal only with signal.

**Counts:** most signals are Simple. The grade is adjusted up one step for the offline sync
mode.

**Verdict: Warranted.** Rinks often have no signal, and check-in happens in front of the student
(`ADR-014` Context). ADR-023 already removed the parts that were over-built.

## 5. Gaps

| ID | Severity | Gap | Evidence | Suggested fix |
|---|---|---|---|---|
| G1 | **High** | Coach MFA is optional. Sign-up is open to anyone, the firewall is in count mode at launch, and Cognito's account-takeover rule group can't be used. A taken-over coach account exposes a roster of minors with their guardians' contact details. | `architecture.md:1894`; `ADR-MASTER.md:1198, 1305`; `ADR-019:76–80` | Cognito MFA is set per user pool, not per group. Choose: MFA on for everyone; coaches made to enrol through a pre-token-generation Lambda; or Cognito threat protection (about $2 a month here). Email one-time codes, which suit older users, need the Essentials plan and SES. Decide before real users exist; users can't move between pools. |
| G16 | **High** | A stranger can get a child's and guardian's details through an invitation. They need only a free coach account, a free family account and the child's share code, which never changes and is shared by design. Once the family confirms the BladeBook-branded "join Coach X's roster" link, the approval screen shows the guardian's name and email and the skaters' registration numbers. | `ADR-MASTER.md:642–660`; `ADR-026:97–99`; `Open-Pending.md:604–605`; `design-rationale.md:104` | Invite only skaters already ACTIVE with that coach (P4). Otherwise let families rotate share codes and flag "a coach you don't have yet" in the email. |
| G2 | **High** | Deleting a skater's data on request isn't designed. Data now lives in about six places (table, archive, reports, monthly exports, PITR, access-log archive). The seat key embeds `studentId`, so erasure rewrites sort keys. | `Open-Pending.md:38–40` (blocking); `Blockers-Before-Coding.md:69` (before launch); `docs/deletion/*.html` ("predates ADR-017 to ADR-029") | Choose the approach (the erasure-by-constant draft already argues for itself) before `core.data` is written. P7's cuts shrink the job. |
| G3 | **High** | The pre-launch legal review isn't scheduled, so most retention windows are unset. Whether COPPA applies when guardians, not children, enter the data is unsettled. | `Open-Pending.md:459–463`; `ADR-017` Status | Schedule it. Its answers become configuration values for TTL. |
| G6 | Medium | Every page goes by SMS, but there is no registered number yet, and US SMS needs one. Until it exists, no page reaches the owner. Pages would also share a number with the coach's text, so a carrier problem with that text silences them. | `ADR-010:205–210, 593–596`; `Open-Pending.md:646, 664–669` | Page through a route with no carrier dependency: an SNS email subscription to a mailbox outside the account's SES (this answers ADR-010 d4's concern about the SES loop), or mobile push through AWS User Notifications. Keep SMS as an extra. |
| G17 | Medium | Any self-registered coach can make BladeBook text any number. The phone number isn't verified, ticking the option sends the opt-in text, and nothing restricts it to US or Canadian numbers. This allows SMS pumping and complaints that can suspend the shared number. | `FeatureDecriptions/Coach Sign Up:14`; `ADR-MASTER.md:1140–1142`; `ADR-009:455–459` | Verify the phone with a code, allow only +1 numbers, set the SNS monthly spend limit, or drop the coach text (P6). |
| G18 | Medium | How Cognito sends sign-up and recovery email isn't decided. Cognito's own email allows 50 a day, so a flood blocks real sign-ups and resets. SES bounces from fake addresses raise the bounce rate at tiny volume, risking suspension of every notification. | No hits for Cognito email configuration; `ADR-010:214–215`; `ADR-019:105–107` | Use SES with its own configuration set and alarms, and keep the Cognito sign-up rate rule in block mode from launch. |
| G4 | Medium | There is no decision on where the browser keeps tokens, and no Content Security Policy (CSP) or security headers. A cross-site scripting (XSS) bug would hand over a coach's token for 60 minutes, or 4 hours on the rinkside page. | No hits for CSP, security headers, HSTS, localStorage, sessionStorage or HttpOnly in `docs/` or `FeatureDecriptions/` | Decide token storage. Add a strict CSP and HTTP Strict Transport Security (HSTS) through a CloudFront response-headers policy. |
| G5 | Medium | No AWS Budgets or cost-anomaly alarm on a budget under $25. API Gateway throttling has no numbers, and the SNS SMS spend limit isn't set. | `monitoring-questions.md:136` (still quotes $2–10); `architecture.md:2384` | Budget alerts at about $20 and $30, stage throttling values, and an SMS spend cap. |
| G7 | Medium | DMARC and a custom MAIL FROM (SPF alignment) aren't specified. SES's Easy DKIM comes with domain verification. Families get mail about their children, so spoofing it is an easy phishing route. | No hits for DMARC, DKIM or SPF | DMARC with `p=quarantine` and a custom MAIL FROM, before SES leaves the sandbox. |
| G8 | Medium | The restore runbook isn't written. | `ADR-010:580–586`; `Open-Pending.md:633–645` | Write it and rehearse it in dev before launch. |
| G9 | Medium | Roles for `sched-lesson-roller` and `sched-deadline-sweep`, the family read allowlist for `LESSON#` and own `SEAT#`, and the gate-test rows for `LESSON#`, `SEAT#`, `SEATEND#` and GSI4 are all open. | `Blockers-Before-Coding.md` #23, #24; `ADR-MASTER.md:152–153` | Already gated before the data layer; keep it that way. |
| G10 | Medium | The reports bucket holds per-student attendance for minors with versioning on and no retention window. With versioning on, an erasure delete leaves old versions behind. | `architecture.md:2154`; `ADR-017:179–181` | Drop `report.json` in MVP (P7), or turn versioning off and set a window. |
| G11 | Low | `consumer-invite`'s event and Pipe filter aren't written. A loose filter could repeat emails, though no-op writes produce no stream records. | `architecture.md:1877` | Filter on specific transitions only and test that its own writes don't match. |
| G12 | Low | Root users and the choice of Organization management account aren't covered. | No hits; `ADR-027:191–193` | Use a third, empty management account. Remove member-account root credentials centrally. |
| G13 | Low | Cognito user-existence errors aren't addressed. With open sign-up, the SignUp call reveals registered addresses anyway. | No hits | Set `PreventUserExistenceErrors`. Rely on the sign-up rate rule for SignUp. |
| G14 | Low | Cold starts for Spring Boot 4 on Lambda without SnapStart, plus the per-request STS call, are unmeasured. At tiny traffic most requests are cold, and the users are older. | `ADR-001` A1; `ADR-021` d3 | Measure on the first deploy. |
| G15 | Low | The never-log denylist and correlation IDs are still to-dos. | `Open-Pending.md:625–628` | Write the denylist before the first handler. |

## 6. What the challenge changed

Nothing was overturned. 14 items were upheld, 11 revised and 3 added.

- **W:** cost moved from Moderate to Complex. The firewall is about $12 for seven rules, not $10
  for five, which puts production at about $22–34. DLQ count corrected to 11, and Cognito
  counted as a dependency.
- **P1:** the claim that enumeration no longer depends on the firewall was corrected. True for
  coach codes, false for share codes. Count mode at launch noted.
- **P4:** Premature → Partly warranted. No coach evidence either way; it is a product choice, so
  the coach-count trigger was dropped. Coach-arranged sharing needs a Phase 2 feature and gives
  up consent. The claimed side benefit was wrong: `consumer-schedule-change` and
  `consumer-student-link` also hold `DeleteItem` across tenants. "Invite only ACTIVE skaters" was
  added as the middle option.
- **P5:** the merge recommendation was narrowed to confirmation plus payment reminder. Merging
  student-link with family-sync would give family-sync `DeleteItem`, and the notifier's paging
  policy differs from the others'.
- **P6:** added the owner's stated reason, which I had missed (`ADR-009` d9). The saving depends
  on G6.
- **P7:** the archiver stays premature, but the two owner commitments that rely on it (the
  "archived, request them" note and the 22-month extension case) are now stated.
- **G1:** fix corrected. Cognito MFA is per pool, not per group.
- **G2:** timing moved to "before `core.data`", because seat keys embed `studentId`.
- **G6:** now answers ADR-010 d4's rejection of email paging, and notes the shared-number risk.
- **G7:** narrowed to DMARC and MAIL FROM.
- **G12:** management account added.
- **G13:** noted that SignUp itself reveals registered addresses.
- **New gaps:** G16 (strangers reaching children's details through invitations), G17 (SMS
  pumping), G18 (Cognito email under a sign-up flood).
- **Severity call on G16:** the challenger said "Medium, arguably High". I set High, because it
  exposes minors' data under a plausible attack that needs no break-in.
- **Contested:** none.

## 7. Coverage

- **Read in full:**
  - `docs/adr/ADR-MASTER.md`, `docs/design-rationale.md`, `docs/Blockers-Before-Coding.md`,
    `docs/monitoring-questions.md`, `docs/Open-Pending.md`;
  - ADR-001 (to A9 and the decision text), 010, 011, 012, 014, 017, 019, 021, 022, 023, 024, 027,
    028, 031, 032;
  - `docs/deletion/*.html` (text);
  - `docs/architecture.md` §0–5 and §7–12.
- **Read in part or through ADR-MASTER, with targeted searches:** the other ADRs, `architecture.md`
  §6, the Kim notes, `FeatureDecriptions/`. The challenger opened every cited source.
- **Skipped:** `design/`, `redesign/` and `DecidedAgainst/` HTML (UI mockups, about 17 MB);
  `design/architecture-diagrams.html` and `design/c4-map.html` (rendered copies of Mermaid
  sources read in `architecture.md`); `terraform/.venv` (a Python virtual environment, no
  infrastructure code); gate-test result text files (outcomes cited from the ADRs).
- **State:** planned. No application or infrastructure code exists, so there are no code/doc
  disagreements.
- **Doc-to-doc drift noticed:**
  - `ADR-019` d2's 28-million-code reasoning;
  - `monitoring-questions.md` and `ADR-010` Context still quote a $2–10 budget and "eight
    Lambdas";
  - `architecture.md` §12 prices the firewall at 5 rules where 7 are listed;
  - `ADR-MASTER.md` calls the sweep "the only function" that can delete across coaches, which
    isn't true.

## 8. Run

Direct mode, with one challenger pass. The corpus was about 1.53 MB, about 380K tokens. The
estimated cost was about $7 (±30%) at API rates.
