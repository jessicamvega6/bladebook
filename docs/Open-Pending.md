# BladeBook — Open & Pending

**As of:** 2026-10-09
**Purpose:** Everything not yet decided or done, in one place. Questions for a coach are
collected in `Items to ask Kim About.md`. Each bullet is a pointer, not the
full argument; the source in parentheses has the detail. When an item is settled, record it in
its source (a new or amended Architecture Decision Record (ADR)) and strike it through here and add *Settled <date>*.

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
  run ADR-013's ArchUnit and mutation-testing gates, build a dev stack to test in before deploying to production (ADR-027), and
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
  expiry. The client sign-up note checks at 8 characters, ADR-016 says 5, the designs show 8. *Deferred by the owner, 2026-09-30.*
  (ADR-002, ADR-016) *Since 2026-10-06 this may be replaced by the coach's registration
  number: see §2b.*
- **Open question: Photo moderation.** Nothing inspects or lets anyone report a coach's photo.
  (ADR-016)
- **Open question: What a coach sees on first login** — an empty grey month, designed together
  with ADR-008's "no times posted yet" copy. (ADR-016, ADR-008)
- *Parked:* Whether any business identifier returns, and Canada's equivalent. (ADR-016)

- **To-do: Design the multi-coach screens** (ADR-025 d7): adding a coach, the coach switcher,
  lessons and payments across coaches (grouped by coach, never totalled), and each skater's
  coaches and status, designed for about 10 coaches. None is in the Harbor designs.
  *"Also coached by"* on the coach's skater record is Phase 2 (ADR-025 d4).
- ~~**Pending decision — needs Kim (§10): Is there a limit on coaches per skater?**~~
  **Settled by the owner, 2026-10-07: no limit.** A skater signs up with 1 to 10 coaches and adds
  more later as needed. (ADR-025)
- ~~**Open question — Kim §6: Does a sibling of an approved family skip approval, and does a
  slow approval need a reminder to the coach?**~~ **Settled 2026-10-09 by the owner:** the coach
  approves everyone, siblings included; no reminder email; the Students tab title shows the
  number of pending students. (ADR-002, amended)

## 2a. Shared lessons (ADR-026)

- **Pending decision — needs Kim (§8):** pricing (P2), what the booking family cancelling does
  (P4), and when an invitation the family hasn't accepted lapses (P5, in part). Max 2 and
  approval decided by the owner 2026-10-07; sharing is on. (ADR-026)
- ~~**Open question: Recurring shared lessons** — does one invitation cover a series?~~ **Settled:
  yes** (ADR-026 d5).
- **Open question: A series where skater B can't make some dates** — accept the dates that work,
  or all or none? (ADR-026 Open)
- **Open question: Lowering `maxSkaters`** on lessons already booked with more skaters. (ADR-026)
- **To-do: Add the share-code rows to the gate tests** and re-run them, since `client-tenant`
  gains a read statement. (ADR-026, `runbooks/database-gate-tests.md`)
- **To-do: Design the sharing screens** — share code on the skater profile, inviting on booking,
  confirm or decline, shared bookings on both sides. (ADR-026)
- **To-do: Build the nightly invitation sweep** — warnings sent early, `warnedAt`, expiry of `SENT`
  and `AWAITING_COACH` invitations. (ADR-026 d5a)
- **To-do: Build the shared-lesson banner** on both families' home screens. (ADR-026 d5a)
- **Pending decision — after Kim's P5: How lapsing invitations are timed.** Nothing today fires
  at a per-booking time; EventBridge Scheduler's one-off schedules are the likely fit. (ADR-026)
  *Partly settled 2026-10-09 (ADR-026 d5a): a nightly sweep sends the warning and expires
  invitations whose lesson has started. Still open: a precise timer if Kim's P5 sets a lapse
  before the lesson.*
- ~~**Open question: Is ADR-025's clash warning enough** when an invited skater joins a lesson
  that overlaps their lesson with another coach? (ADR-026)~~ **Settled 2026-10-07** (ADR-026
  decision 5): the confirm page shows clashes and the family chooses.
- **To-do: Include participants everywhere a lesson is walked** — the schedule-change consumer's
  cancel and re-price, the change notifier (one message per family), the drift check, the
  end-of-day report, coach cancellation, and erasure on request. (ADR-026 Consequences)
- **Note:** share-code length and alphabet follow the coach-code decision (blocker #7), and
  `consumer-invite` brings the total to fourteen Lambda functions. (ADR-026)

## 2b. Skating membership numbers (`FeatureDecriptions/Client Sign Up`, `Coach Sign Up`)

Added to the sign-up notes on 2026-10-05: families must enter a USFSA or USA Hockey
registration number, and a coach's registration number becomes their coach code. Both can
change each season. No ADR yet; it waits on the research and Kim's answers below.

- **Research: Can USFSA and USA Hockey numbers be validated?** Is there an API, a lookup service
  or a data agreement? Not known. Validation decides whether a coach's number can safely be
  their code.
- **Research: How each organisation's numbers behave year to year.** USA Hockey may issue a new
  number each season; US Figure Skating member numbers may be permanent with yearly renewal.
  Unverified.
- **Pending decision: Is the coach code the coach's registration number, or a random BladeBook
  code with the registration number stored separately?** Using the number is only safe if it
  can be validated: otherwise anyone can claim a real coach's number, lock that coach out, and
  receive their families' sign-ups. Registration numbers also aren't secret and may be
  guessable, which weakens the step that keeps strangers out. The two organisations' numbers could collide, so codes would need a prefix. Ties to
  blocker #7.
- **Open question — needs Kim (§9): Is a skater's number required, and for whom?** It belongs
  to each skater, not the family account; adults and learn-to-skate beginners may not have one.
  Decide what happens when a number expires: blocked from booking, a reminder, or nothing.
- **Open question: Does this exclude Canada?** Canadian skaters and coaches register with Skate
  Canada or Hockey Canada. ADR-016 dropped the EIN gate partly because it excluded Canada, and
  the design supports CAD. (Kim §9, question 6)
- **Open question: Why is a skater's number needed?** It adds personal data about minors, so
  §7's data minimisation needs a stated purpose. (Kim §9, question 2)
- **Settled, no action:** a coach's code changing each year doesn't affect existing families or
  recurring bookings. Links, bookings and recurrences point at the coach's internal ID, never the
  code; only the sign-up lookup changes. Open: whether old codes keep working for new sign-ups.

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
- **Pending decision: Does BladeBook calculate rink fees, or does the coach enter what they
  paid?** *Added 2026-10-07 from talking with Kim.* The financial page shows year-to-date (YTD)
  gross and fees paid to the rink. Calculating means modelling each rink's terms: a percentage of
  gross or a flat monthly fee (Pelham Civic Center (PCC) figure skating: 15% or $500 a month), an hourly rate (PCC
  hockey: $10 an hour), and rates that vary by ice type. Entering is simpler and always matches
  what was actually paid. Kim's own question applies: can a coach switch between percentage and
  flat fee from month to month? Coaches at more than one rink need fees per rink.
  (`FeatureDecriptions/Coach Financial Page.md`, `Talking with Kim:.md.md`)
- **Open question: What counts as gross?** Lessons marked paid, or every lesson given whether
  paid or not? Are waived lessons left out, and do missed-lesson fees count? Is the year the
  calendar year (the tax year for individuals in both the US and Canada)? Are past years and an
  export for a tax preparer needed? (`FeatureDecriptions/Coach Financial Page.md`)
- **To-do: Check data retention against the financial page.** YTD totals need a full year of
  lesson and payment history, and tax records are normally kept for several years. Confirm that
  ADR-017's time-to-live (TTL) and archive rules don't remove records the page or a tax return
  needs. (ADR-017)
- ~~**Open question: Which handles count as "on the profile" for how the client paid?**~~
  **Settled 2026-10-07:** the handles the coach filled in, plus *Other*, no free text. Open only:
  whether *Show my payment handles* (`displayPaymentTypesToClients`) matters. (`FeatureDecriptions/Coach Payment Section on
  Dashboard.md`, ADR-003 decision 4, amended 2026-10-09)
- **Open question — needs Kim: Should cash be a fixed option?** Under the rule above, cash at
  the rink, cheques and Interac e-transfer all become *Other*. A Canadian-dollar (CAD) coach,
  who usually has no Cashapp, Venmo or PayPal handle, would only ever see *Other*. (ADR-016
  decision 7)
- **Open question: How-paid details.** Is it required when marking a lesson paid? Can it be
  changed afterwards? Does the family ever see it? A waived lesson has no method. Proposed:
  store it on the booking as a fixed value (`CASHAPP`, `VENMO`, `PAYPAL`, `OTHER`), so removing a
  handle from the profile later doesn't change past records. (ADR-003)

## 4. Scheduling and booking

- **Open question: Should a one-off booking have a date ceiling?** Recurrences cap at 12
  months; single bookings have none (the UI shows 3 months, the API doesn't enforce it).
  *Held open by the owner, 2026-09-30,* pending how often coaches change their schedules and
  prices — see `Items to ask Kim About.md` §1. *Kim, recorded 2026-10-08: the weekly schedule
  changes "not often"; how often prices change and how far ahead families book are still
  unanswered.* (ADR-006, `FeatureDecriptions/Bookings:`)
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
- ~~**Pending decision — needs Kim, and blocks the schedule-save amendment: A booking lands
  between the coach's preview and save.** Proposed underneath every option: the preview reads
  a per-coach booking counter that every booking increments, and the save commits only if it
  hasn't changed. If it has, recalculate; an unchanged plan saves silently, a changed one goes
  back to the coach. What happens to the new booking then depends on Kim: (A) show the coach
  and let them choose, (B) cancel with a "just booked" email, (C) keep it as a one-off, or
  (D) hide the affected times while the coach previews. Owner leans A + B. Record in an
  amendment to ADR-006/008/020 once answered. (`Items to ask Kim About.md` §7)~~ **Settled 2026-10-08 from Kim's answer: B** — the save goes ahead; bookings made since the preview are cancelled with the "just booked" email. Recorded in ADR-006, ADR-008 and ADR-020.
- ~~**To-do: Write the "just booked, then cancelled" email** (`FeatureDecriptions/Email templates Needed:`).~~ **Moved to Phase 2 by the owner, 2026-10-09**, with the booking counter it needed (ADR-006, ADR-008, ADR-020). To be reconsidered if feedback supports that this is an issue.
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
- **To-do: Amend ADR-008 to add rink and ice type to the block.** *Decided by the owner, 2026-10-07:*
  ice type is required on every tab and never shown to families. The values are each rink's own
  names for its sessions, kept in a per-rink list that the owner adds to as BladeBook reaches new
  rinks; coaches pick from it and don't create their own. The rink is also per tab, fixed to
  PCC in Phase 1 (below). If BladeBook calculates rink fees
  (§3), also stamp the ice type onto each booking, the way price and currency are, so a later
  schedule change doesn't change last month's fees. (ADR-008, ADR-003,
  `FeatureDecriptions/Schedule Creater.md`)
- **Open question (Phase 2): What a coach at a rink with no ice type list does.** *Decided by
  the owner, 2026-10-07:* the rink is chosen per tab in the schedule builder; in Phase 1 it is
  fixed to Pelham Civic Center (PCC) and not selectable. Once rinks are selectable, ice type is
  still required, so a coach whose rink isn't listed can't save a schedule. Is there a fallback
  (e.g. a generic list), or does the owner add the rink before that coach can start?
  (`FeatureDecriptions/Schedule Creater.md`)

## 5. Cancellation

- ~~**Open question: Is the coach notified of every client cancellation, or only late ones?**~~
  **Settled 2026-10-08 from Kim's answer:** only cancellations inside the coach's notice period
  (`requiredNoticeHours`), by email and, if opted in, text. (ADR-009,
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
  Protection Act (COPPA) and state privacy laws, reportability of an exposure in the dev
  environment (ADR-011 decision 6c, ADR-027), and every retention window below. Each window, once set, is a
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
  against a real table in a sandbox account (`bb-gate-test`) (DynamoDB Local ignores IAM), part of ADR-013's required tests. The open one: does `LeadingKeys` on a
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
  production canary that attempts a cross-tenant read is also needed. Separate from the
  cancellation-flow canary, which ADR-027 decision 7 settled: it runs against production as a
  test coach and test family. (monitoring-questions §1, ADR-013)
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
- **To-do before the initial launch: Turn on dev's WAF in block mode and re-test.** Dev
  is built and tested without it; enabling it, running the Playwright flows and the main coach
  and client journeys, and fixing any misfiring rule is one of the last pre-launch checks.
  (ADR-019 decision 4a, ADR-027)
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

## 11. Dev environment and testing

*Since 2026-10-07 there is no staging environment: production is the only long-running
environment, and dev is built on demand and destroyed when done (ADR-027).*

- **To-do: Create the dev test-account pools as part of building the stack** — three to five
  coaches, about ten clients. Their `sub`s change with each build; `build-dev` reads them by
  email. (ADR-027 decision 3, ADR-011 decision 8c)
- ~~**Pending decision: Where the masking job lives, where dev's logs are kept, and whether dev
  is a separate AWS account**~~ **Settled 2026-10-07 (ADR-027 decisions 8–9):** production and
  dev are separate accounts under one AWS Organization; the masking job, the load log and dev's
  access-log bucket live in their own small stack in the production account.
- ~~**Open question: What runs the dev masking job?**~~ **Settled 2026-10-09:** an AWS Step
  Functions workflow in the data-loading stack (ADR-027 decision 9, amended).
- **To-do: Set up the AWS Organization** — production and dev accounts, IAM Identity Center
  sign-in with multi-factor authentication, and `dev.<domain>` delegated to a hosted zone in the
  dev account. Before any infrastructure is built: tables and Cognito users can't move between
  accounts later. (ADR-027 decision 8)
- **To-do: Write the data-loading stack's cross-account permissions** — dev's table import reading
  the masked bucket, and dev's CloudTrail writing to the log bucket in production. (ADR-027
  decision 9, ADR-028)
- **To-do: Build the masked-build workflow** — the Step Functions workflow, the transform Lambda
  (with its item count and duplicate-key check), the export bucket and the masked bucket (each
  deletes its contents after 24 hours). (ADR-027 decision 9, ADR-028)
- **To-do: Rewrite the seed script to write an import file**, taking each test account's `sub`
  by email. (ADR-028 decision 4; `terraform/bladebook_seed.py`)
- **To-do: Split dev into an account stack and an application stack.** (ADR-028 decision 4)
- **Open question: Does an import produce stream records?** Check on the first masked build.
  (ADR-028 Open)
- **Open question: Does dev's account stack stay up between builds?** (ADR-028 Open)
- **Open question: Is dev's access log detailed enough to answer "did anyone read it"?**
  (ADR-011 decision 6c, ADR-027 decision 4)
- **Open question: How long may dev hold loaded production data?** Should a dev stack with
  loaded data page, or remind the owner, after some number of days? (ADR-027 Open)
- **Pending decision: The production canary's cadence and runner** (a scheduled CI job or
  CloudWatch Synthetics), and which mailbox the test coach and family use. (ADR-027 decision 7
  and Open)
- **To-do: Mark the canary's test accounts and keep them out of anything summed across
  coaches.** (ADR-027 decision 7)
- **To-do: Check that teardown left nothing behind** — a script or a check at the end of the
  destroy — and an infrastructure test that production's table and buckets stay retained and
  deletion-protected. (ADR-027 decision 5 and Open)
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
- ~~**To-do: Regenerate `design/architecture-diagrams.html`** (via `design/render-diagrams.py`)
  — `architecture.md`'s diagrams changed on 2026-09-28, 2026-09-29 and 2026-09-30.~~ **Done
  2026-10-07**, after the diagrams were brought up to ADR-027.
- ~~**To-do: Retire or merge `Follow Up.md`** into this document so there is one list.~~
  **Done 2026-10-05:** every item was already here or settled in an ADR, so the file was
  deleted by the owner.
- **To-do: Commit the untracked work** — `terraform/`, `docs/Blockers-Before-Coding.md`,
  `docs/design-rationale.md`, `docs/Talking with Kim:.md.md`, `docs/deletion/`, `.claude/skills/`,
  plus uncommitted edits to 26 tracked files.
