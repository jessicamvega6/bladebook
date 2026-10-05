# BladeBook — Open & Pending

**As of:** 2026-09-30
**Purpose:** Everything not yet decided or done, in one place. Questions for a coach are
collected in `Items to ask Kim About.md`. Each bullet is a pointer, not the
full argument; the source in parentheses has the detail. When an item is settled, record it in
its source (a new or amended Architecture Decision Record (ADR)) and delete it here.

Legend: **Open question** = needs an answer · **Pending decision** = options exist, one must be
chosen · **To-do** = decided, needs doing · *Deferred* = the owner has chosen to park it.

---

## 1. Blocking — settle before the code it touches

- **Pending decision: Infrastructure as Code (IaC) — AWS Cloud Development Kit (CDK) or
  Terraform?** Undecided; ADR-001 amendment A4 lists the criteria. Switching gets expensive
  once anything is deployed. (ADR-001 A4)
- **Pending decision: Which continuous integration (CI) system?** No ADR names one. The repo
  is on GitHub, so GitHub Actions is the obvious candidate; AWS CodePipeline/CodeBuild is the
  AWS-native alternative. It must build the JARs before every deploy (no stale-JAR deploys),
  run ADR-013's ArchUnit and mutation-testing gates, deploy to staging before production, and
  reach AWS without long-lived access keys. Blocks the to-do in §11. (ADR-013, ADR-001 A4,
  Blockers-Before-Coding #3)
- **Pending decision: How student data is deleted on request.** §7 promises it; nothing
  implements it. Two approaches drafted (erasure by constant, erasure by token), neither
  chosen. *Deferred 2026-08-25.* (architecture §7, `design/deletion/`)
- **Pending decision: Who sends the SMS opt-in confirmation?** Required by ADR-007 decision 8,
  but no function holds `sns:Publish` where it happens. Suggested: a stream consumer on
  `smsOptIn` changing from false to true. Blocks SMS wiring, minimum viable product (MVP)
  feature 15. (ADR-001 A6)
- ~~**Pending decision: Profile photo storage, upload path and resize step.**~~ **Moved to
  Phase 2 by the owner, 2026-10-05.** MVP ships without coach photos. ADR-016 fixes the limits
  (2 MB, 512 px); the bucket, upload route and resizing function are designed when photos
  arrive in Phase 2. (ADR-016 decision 5, ADR-001 A6)

- **Pending decision — before the launch steps below: The product's final name.** The owner is
  buying a domain now for development and may rename BladeBook later. The name gets built into
  the domain, the sender address SES verifies, the brand registered for texts (10DLC), the
  `<Coach name> via BladeBook:` text prefix, and the terms and privacy links in every opt-in
  message — so it should be final **before SES leaves sandbox mode, before 10DLC registration,
  and before launch**. Renaming before those is cheap; after, each has to be redone.
- **To-do: Keep the product name and domain out of the code.** Hold them as configuration
  values, used by email templates, text templates, the SMS prefix and the infrastructure, so a
  rename is a configuration change plus re-registration, not a code change. (ADR-007, ADR-011)

## 2. Coach signup and accounts

- **Open question: How licensing works** — price, renewal, per coach or per organisation,
  where the gate sits, and above all **what happens to a coach's families when a licence
  lapses**. Nothing in the model expresses a suspended tenant. (ADR-016)
- **Open question: Coach code format and lifetime** — length, ambiguity-safe characters,
  expiry. The sign-up notes assume 5 characters. *Deferred by the owner, 2026-09-30.*
  (ADR-002, ADR-016)
- **Open question: Photo moderation.** Nothing inspects or lets anyone report a coach's photo.
  (ADR-016)
- **Open question: What a coach sees on first login** — an empty grey month, designed together
  with ADR-008's "no times posted yet" copy. (ADR-016, ADR-008)
- *Parked:* Whether any business identifier returns, and Canada's equivalent. (ADR-016)

## 3. Money and payments

- **Open question (Phase 2): What the missed-lesson fee is charged against when
  `missedLessonFeeMinor` ≠ `priceMinor`** — client-facing wording on the outstanding view and
  the reminder. For MVP a no-show shows its full lesson price. (ADR-015)
- **Open question: Bounds on `requiredNoticeHours`** for when coaches can edit it in Phase
  2 — may a coach set 0? 168? A fixed list? MVP defaults to 24. (ADR-015, ADR-016)
- **Open question (Phase 2): Does any cancel confirmation become a definite "will incur" with
  an amount?** MVP says "may incur" everywhere. (ADR-015 decision 6)
- **Open question: Is unpaid history shown to the client, or only the coach?** Currently
  coach-only. (ADR-003)
- **To-do (Phase 2): Rate-limit the manual payment reminder** before the button ships.
  (ADR-003)

## 4. Scheduling and booking

- **Open question: Should a one-off booking have a date ceiling?** Recurrences cap at 12
  months; single bookings have none (the UI shows 3 months, the API doesn't enforce it).
  *Held open by the owner, 2026-09-30,* pending how often coaches change their schedules and
  prices — see `Items to ask Kim About.md` §1. (ADR-006, `FeatureDecriptions/Bookings:`)
- **Open question (Phase 2): Is a saved schedule a third item type or a header not in
  effect?** Decides whether "save" and "apply" are one action or two. (ADR-008)
- **Pending decision — needs Kim, and blocks building re-pricing: Hand-edited booking
  prices.** ADR-020 would overwrite them on the next schedule save. Remove per-booking price
  editing (the per-student override and *mark as waived* cover it), or mark hand-set prices
  so they're never re-priced. (ADR-020 Open, `Items to ask Kim About.md` §5)
- **Open question — needs Kim: The shape of the per-student discount** — a fixed price, a
  percentage off, or a dollar amount off; whether changing it re-prices booked lessons; and
  whether `0` should mean free. (ADR-003, ADR-020, `Items to ask Kim About.md` §5)
- **Pending decision — needs Kim: The large-price-change warning threshold** — how big a change
  triggers the preview's must-acknowledge warning. Depends on how much coaches normally change
  prices. (ADR-020 decision 4, `Items to ask Kim About.md` §1)
- **Pending decision — needs Kim, and blocks the schedule-save amendment: A booking lands
  between the coach's preview and save.** Proposed underneath every option: the preview reads
  a per-coach booking counter that every booking increments, and the save commits only if it
  hasn't changed. If it has, recalculate; an unchanged plan saves silently, a changed one goes
  back to the coach. What happens to the new booking then depends on Kim: (A) show the coach
  and let them choose, (B) cancel with a "just booked" email, (C) keep it as a one-off, or
  (D) hide the affected times while the coach previews. Owner leans A + B. Record in an
  amendment to ADR-006/008/020 once answered. (`Items to ask Kim About.md` §7)
- **Pending decision: Bookings don't check the schedule atomically.** *Confirmed 2026-10-04.*
  Each occurrence is checked against the schedule in code, then written with a conditional
  `PutItem` whose only condition is `attribute_not_exists(SK)`. That prevents double-booking,
  but a schedule save landing between the check and the write isn't seen. Today the
  schedule-change consumer catches most of these by cancelling the booking after the fact. The
  rest are paged by the nightly drift check (next 30 days) or caught by the coach's next save.
  Proposed fix: write each occurrence as its own two-item `TransactWriteItems`, with a
  `ConditionCheck` on a per-coach schedule version that every schedule, temp or override write
  bumps. That keeps ADR-006's partial success, at twice the write cost. Independent of Kim's
  answer above. (ADR-004 d2, ADR-006, ADR-010 d5k)
- **Open question (Phase 2): Do booked lessons follow a change to `requiredNoticeHours`?**
  (ADR-020)
- **Open question: Timezone of the week grid for a client in another zone** — correct, but
  unstated in the UI. (ADR-006)
- **To-do: Write the "no times posted yet" copy** for an all-grey calendar, and the coach's
  "build your schedule" prompt. (ADR-008)

## 5. Cancellation

- **Open question: Is the coach notified of every client cancellation, or only late ones?**
  The notifier sends on every one until settled; ask the coach. If a threshold arrives it
  should be the coach's `requiredNoticeHours`. *Deferred 2026-08-25.* (ADR-009,
  `FeatureDecriptions/Email templates Needed:`)
- **Open question: Two overlapping recurrences where there should be one** — extension is
  excluded, so clients book a second. (ADR-009)
- **Open question: Does a client ever see their own cancellation history?** Assumed email
  only. (ADR-006)
- *Parked:* Held slots are permanent for MVP — revisit when a coach holds one by mistake.
  (ADR-009)

## 6. Rinkside app

*Nothing open.*

## 7. Notifications and SMS

- **Open question: Does the one-time opt-in confirmation satisfy the carrier**, or is
  periodic re-disclosure needed? Answer comes from 10-digit long code (10DLC) campaign
  vetting. (ADR-007)
- **Open question: `START`/`UNSTOP` asymmetry** — the carrier re-subscribes, our `smsOptIn`
  stays false. Explain it in the UI? (ADR-007)
- **Open question: A client opted into SMS whose email bounces gets nothing usable.**
  (ADR-007)
- **To-do: Text-message templates for price changes** — increase, decrease ("good news") and a
  batch mixing price changes with cancellations, each length-tested. (ADR-007, ADR-020)
- **Pending decision: Real delivery confirmation** — `SENT` only means "accepted by Simple
  Email Service (SES)." (ADR-006)
- **To-do: Register the SMS number (toll-free/10DLC)**, and confirm whether alert SMS to the
  owner's number needs it too. (architecture §9, ADR-010)

## 8. Data protection, privacy and retention

- **To-do: Schedule the pre-launch legal review.** Agenda: Children's Online Privacy
  Protection Act (COPPA) and state privacy laws, reportability of a staging exposure
  (ADR-011 decision 6c), and every retention window below. Each window, once set, is a
  configuration value applied through Time to Live (TTL), plus a one-off backfill.
  (architecture §7, ADR-017)
- **Open question: The retention windows ADR-017 is waiting on** — each needs the legal
  review:
  - settled bookings (paid or waived), measured from settlement;
  - cancellation records, not chargeable and chargeable — ask a coach whether they are needed
    for tax, which would set the floor. *Deferred 2026-08-25.* (ADR-006, ADR-009);
  - re-price lines, which name students like cancellation lines (ADR-020);
  - the archive itself, before objects are deleted from Deep Archive — at least 210 days, or
    objects are billed for time they were not kept.
  (ADR-017 decision 2)
- **Pending decision: The date-override expiry window** — 30 days after the date is
  proposed; also used for temp headers and held slots. Needs no legal input. Options raised:
  keep 30 days, or expire a named temp's header and all its date records **together, about 13
  months after its end date**, so a coach can reopen last year's camp and move its dates
  (ADR-008 decision 7a) until Phase 2's saved schedules exist. *Deferred by the owner,
  2026-09-30.* (ADR-017)
- **Pending decision — needs coach input: The unpaid-lesson reminder** — the threshold (the
  job is off until it is set), the cadence (weekly on Monday morning is proposed), and whether
  an unsettled lesson is listed again. *Left open by the owner, 2026-09-30, pending a
  conversation with a coach.* (ADR-018)
- **Open question: Does a coach see anything when their history ages out?** (ADR-017)
- **Open question: Are archive restores logged as personally identifiable information (PII) reads** under ADR-012, or is CloudTrail
  enough? (ADR-017)
- **Pending decision: Who sends the decline email for a rejected student?** A rejected
  `PENDING` student is now deleted outright (ADR-002 decision 2b), so the email must be sent
  from the deleted record — most naturally by a consumer reading the removal off the change
  stream. No function does this yet. *Since 2026-10-01, `consumer-student-link` already
  receives that removal (ADR-021 d6) and is the natural home; adding the email gives it
  `ses:SendEmail`.* (ADR-002, ADR-001 A6, ADR-021)
- ~~**To-do: Write ADR-021's database-gate tests before coach-path code.**~~ **Done 2026-10-05, all pass** (`runbooks/database-gate-tests.md`). Eight checks
  against a real table in staging (DynamoDB Local ignores IAM), part of ADR-013's required tests. The open one: does `LeadingKeys` on a
  GSI3 query check the index's partition key? If not, the unpaid list moves to the main
  table. (ADR-021 d7)
- ~~**To-do: Write ADR-022's client-gate tests alongside them.**~~ **Done 2026-10-05, all pass;** row 9 confirmed: the database refuses `ALL_OLD` on a failed write. Ten checks. Two are open: the
  same index question for GSI1 (now keyed by client), and what a failing conditional put
  with `ReturnValuesOnConditionCheckFailure = ALL_OLD` returns under an attribute allowlist.
  (ADR-022 d9)
- ~~Open question: Should a `PENDING` family see their coach's availability at all?~~
  **Settled by the owner, 2026-10-01: no.** A pending family sees only their own account; the
  database refuses their reads of the coach's partition. (ADR-022 d6, ADR-002)
- **Open question: What does "delete a student/client" from the coach's student list mean?**
  Going forward or retroactive? Can the client still book? What does the client see? Also
  covers what happens to a client account left empty by a rejection. *Deferred by the
  owner, 2026-09-30.* (`FeatureDecriptions/Coach Dashboard on website.md`, ADR-002)
- **To-do: Extend the erasure design to the archive.** An erasure request must now reach the
  table, the archive bucket (one object per item, keyed by coach and student) and — for 35
  days, unselectively — Point-in-Time Recovery. (ADR-017, `design/deletion/`)
- **Open question: Retention of the PII access log** —
  itself a record about minors. (ADR-012)
- **To-do: Set an interim CloudWatch log retention value** instead of "never expire."
  (ADR-012)
- **Open question: Does the access log need its own access logging?** (ADR-012)

## 9. Monitoring, logging and tenant isolation

- ~~**Pending decision: Make the global secondary index (GSI1) student-link check a shared
  `core/` function**~~ **Settled 2026-10-05 (ADR-024):** writes take a `LinkedSkater` only
  `core.data` can create, plus a `clientId` ownership condition. (monitoring-questions §1)
- ~~**Open question: What happens when that check fails**~~ **Settled 2026-10-05 (ADR-024):**
  "was linked, no longer active" gets a clear message; "never yours" gets a not-found, a
  security event, and pages on 3+ in 15 minutes for one family or 10+ a day overall, both
  configurable. (monitoring-questions §1)
- **To-do: Cross-tenant isolation test in continuous integration (CI)**; decide whether a
  production canary is also needed. (monitoring-questions §1, ADR-013)
- **Open question: Can accepting a `PENDING` student ever leak data across coaches**, for
  example when someone guessed a coach code? (monitoring-questions §1)
- **To-do: Configure SES event destinations** for bounce, complaint and delivery. The pages
  on bounce and complaint rate are already decided (ADR-010 decision 4); they need this data
  to fire. (monitoring-questions §3)
- **Open question: What happens to a hard-bounced address?** Nothing marks it invalid, so the
  next message goes to it again and pushes the bounce rate up. (monitoring-questions §3)
- **To-do: Turn on Simple Notification Service (SNS) SMS delivery status logging.**
  (monitoring-questions §3)
- **To-do: Thread correlation IDs** from API Gateway through the event bus to consumers.
  (ADR-012, monitoring-questions §5)
- **To-do: Write the "never log" denylist** — contact details, `paymentInstructions`, student
  names, coach codes, payment handles. (monitoring-questions §5)

## 10. Reliability and operations

- **To-do: Write the restore runbook** — Point-in-Time Recovery (PITR) restores to a new
  table; repoint or copy back? (ADR-010)
- **To-do: Separate alert SMS from client SMS** (own topic and configuration set). (ADR-010)
- **To-do: Pass each scheduled job's target date in its trigger**, so a replayed or re-run job
  works on that date — this is what makes the end-of-day report re-runnable for a past date.
  (ADR-010 decision 2a)
- **Pending decision: Backups beyond PITR's 35 days?** Ties to the retention questions.
  (ADR-010)
- **Open question: Toll-free number or 10DLC for texts.** Undecided. 10DLC: a local-looking
  number, brand and campaign registration, a monthly campaign fee. Toll-free: an 8XX number,
  one verification, no campaign fee. *Held open by the owner, 2026-09-30, pending research:*
  which number types AWS can use to text both US and Canadian mobiles, and what each
  registration needs from an individual without a registered business. (ADR-007)
- **To-do before the initial launch: Turn on staging's WAF in block mode and re-test.** Staging
  is built and tested without it; enabling it, running the Playwright flows and the main coach
  and client journeys, and fixing any misfiring rule is one of the last pre-launch checks.
  (ADR-019 decision 4a)
- **To-do at launch + 2 weeks: Switch the production WAF from count to block** — review the
  counted metrics and sampled requests, adjust any rule that caught real traffic, then block.
  Rate limits are unenforced until then. (ADR-019 decision 2)
- ~~**Pending decision — before `api-coach` and `api-checkin` are built: How `api-coach`
  refuses the check-in app's tokens.**~~ **Closed 2026-10-05 by ADR-023:** check-in joins the
  coach website with the same sign-in and its routes move into `api-coach`, so there is
  nothing to refuse and no Lambda authorizer. (ADR-019 decision 3, ADR-001 A7)
- **Pending decision (ADR-023 Open): Which actions besides a schedule save need a recent
  sign-in** — day or week cancellation, removing a student, approve/decline, changing contact
  or payment details.
- ~~**Pending decision (ADR-023 Open): The coach website's refresh-token lifetime**~~ **Settled
  2026-10-05 (ADR-023 d6):** 60 minutes on the coach and family websites, 4 hours on the
  rinkside page, counted from sign-in.
- **To-do (ADR-023 Open): Confirm on an iPhone** that a home-screen web app keeps its own
  sign-in, separate from Safari.
- ~~**To-do: Confirm the Cognito feature plan allows a WAF association** on the user pool.~~
  **Done 2026-10-05:** available in all feature plans, per AWS's Cognito developer guide.
  (ADR-019)
- **To-do: Configure cross-origin resource sharing (CORS) on API Gateway** for the site's domain — the browser now calls the
  API on its own address. (ADR-019)
- **Open question: WAF log retention** — 30 days as an interim value (ADR-019 decision 4b); the
  logs hold IP addresses and request paths, so the final window goes on the legal review's
  agenda. (ADR-019)

## 11. Staging and testing

- **To-do: Create the staging test-account pools** — three to five coaches, about ten
  clients — and record their `sub`s as configuration. (ADR-011 decision 8c)
- **To-do: Put the default refresh coach list in Parameter Store.** (ADR-011 decision 8a)
- **Open question: Is the staging access log detailed enough to answer "did anyone read it"?**
  (ADR-011 decision 6c)
- *Parked:* Ephemeral per-branch stacks as a fallback if persistent staging gets costly to
  maintain. (ADR-011)
- **Pending decision: Should the ArchUnit test rule reach beyond `core/`?** Recommendation:
  move the cancellation consumer's orchestration into `core/` instead. (ADR-013)
- **To-do: Build the first CI pipeline** — test enforcement switches on with it. Waits on the
  CI system choice in §1. (ADR-013)

## 12. Feature descriptions — gaps to fill

- **To-do: Write the pending-student decline email.**
  (`FeatureDecriptions/Coach Dashboard on website.md`)
- **To-do: Fill in the empty Non-Functional Requirements sections** (durability,
  scalability, performance) and reconcile the rest with ADR-010 — e.g. 95% uptime and CPU
  autoscaling alarms don't map onto Lambda. (`FeatureDecriptions/Non Functional Requirements.md`)
- **Open question: "Storing daily schedules in long-term storage"** — is the S3 end-of-day
  report enough, or is something else meant? (`FeatureDecriptions/Non UI Functional Requirements`)

## 13. Documentation housekeeping

- **To-do: Clear stale text inside ADRs** — each is a leftover, not a live question:
  - ADR-003 Status still says whether a no-show is owed is unresolved.
  - ADR-009 Open still carries "cancellation in the rinkside app widens ADR-014's question"
    (settled by ADR-014 decisions 10 and 11).
  - ADR-014 decision 6 still says a no-show emits nothing; one settled Open item has leftover
    text saying check-in falls to `api-coach`.
  - ADR-001 A3 says 35 theme tokens (the theme defines 34) and lists two questions ADR-014 has
    since settled; decision 4 uses the old `SLOT#` key.
  - ADR-013 Open says "two API functions" (there are three).
- **To-do: Regenerate `design/architecture-diagrams.html`** (via `design/render-diagrams.py`)
  — `architecture.md`'s diagrams changed on 2026-09-28, 2026-09-29 and 2026-09-30.
- ~~**To-do: Retire or merge `Follow Up.md`** into this document so there is one list.~~
  **Done 2026-10-05:** every item was already here or settled in an ADR, so the file was
  deleted by the owner.
- **To-do: Commit the untracked work** — ADR-010 to ADR-020, this file, monitoring questions,
  feature descriptions, `design/`, `terraform/`.
