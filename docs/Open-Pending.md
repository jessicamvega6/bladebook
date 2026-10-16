# BladeBook — Open & Pending

**As of:** 2026-10-15
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
- ~~**Pending decision: Which continuous integration (CI) system?** No ADR names one. The repo
  is on GitHub, so GitHub Actions is the obvious candidate; AWS CodePipeline/CodeBuild is the
  AWS-native alternative. It must build the JARs before every deploy (no stale-JAR deploys),
  run ADR-013's ArchUnit and mutation-testing gates, build a dev stack to test in before deploying to production (ADR-027), and
  reach AWS without long-lived access keys. Blocks the to-do in §11. (ADR-013, ADR-001 A4,
  Blockers-Before-Coding #3)~~ *Settled 2026-10-15 by the owner:* GitHub Actions
  ([ADR-032](adr/ADR-032-ci-on-github-actions.md)).
- **To do before the first deployment: lock down the CI pipeline.** Nothing deploys to either
  AWS account until all of ADR-032 decision 2 is in place:
  - every action pinned to a full commit hash;
  - AWS reached through OpenID Connect (OIDC) only, with no stored access keys;
  - the AWS trust rule locked to this repository and, for production, its `production`
    environment on `main`;
  - the owner's approval required before every production deploy;
  - `main` protected, with two-factor authentication on the account;
  - workflows given the fewest permissions;
  - separate deploy roles for dev and production, each with least privilege.

  *Added 2026-10-15.* (ADR-032, Blockers-Before-Coding #3)
- **Pending decision: How student data is deleted on request.** §7 promises it; nothing
  implements it. Two approaches drafted (erasure by constant, erasure by token), neither
  chosen. *Deferred 2026-08-25.* (architecture §7, ~~`design/deletion/`~~ `docs/deletion/`)
- **Pending decision: Who sends the SMS opt-in confirmation?** Required by ADR-007 decision 8,
  but no function holds `sns:Publish` where it happens. Suggested: a stream consumer on
  `smsOptIn` changing from false to true. Blocks SMS wiring, minimum viable product (MVP)
  feature 15. (ADR-001 A6) *Narrowed 2026-10-12: all SMS to clients is Phase 2 (§7). Still
  blocks the coach's late-cancellation text (`smsCancellationAlerts`), which sends the same
  opt-in confirmation (ADR-016 decision 2, ADR-009 decision 9).*
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
- ~~**Open question: Coach code format and lifetime** — length, ambiguity-safe characters,
  expiry.~~ **Settled 2026-10-13 by the owner:** 8 random characters from a set with no
  look-alikes (`7K2Q-M9XT`), no part of the coach's name; never expires; the coach can rotate it
  (ADR-002, amended). Share codes: the first 3 letters of the skater's first name and 5 random
  characters, `MIA-4K7QX` (ADR-026 d4).
- **Open question: Photo moderation.** Nothing inspects or lets anyone report a coach's photo.
  (ADR-016)
- **Open question: What a coach sees on first login** — an empty grey month, designed together
  with ADR-008's "no times posted yet" copy. (ADR-016, ADR-008)
- *Parked:* Whether any business identifier returns, and Canada's equivalent. (ADR-016)

- **To-do: Design the multi-coach screens** (ADR-025 d7): adding a coach, the coach switcher,
  lessons and payments across coaches (grouped by coach, never totalled), and each skater's
  coaches and status, designed for about 10 coaches.
  *"Also coached by"* on the coach's skater record is Phase 2 (ADR-025 d4).
  *Partly done 2026-10-13:* the booking pages (Coach dropdown, picks kept across coaches, clash
  warning, result per coach), the profile (each skater's coaches, *Your coaches*, *Add a coach*)
  and coach labels on Home and My bookings are designed (ADR-025, amended 2026-10-13). *Later
  the same day:* sign-up with several coach codes, one Home card per coach, per-coach waiting
  wording, coach choice when adding a skater, and invitations naming their coach (ADR-025 h–l).
  Still to do:
  - ~~**Pending decision: a coach filter on My bookings**~~ **Settled by the owner, 2026-10-13:**
    a Coach dropdown beside the skater filter, "All coaches" by default; designed (ADR-025 o).
  - **To-do (Phase 2): group the Payments page by coach**, with no total across coaches
    (ADR-025 m). Today's Phase 2 design adds every coach together.
  - *Phase 2 (owner, 2026-10-13):* removing a skater from one coach or from all — part of
    the "delete a student" question (§8), which is Phase 2.
- ~~**Pending decision — needs Kim (§10): Is there a limit on coaches per skater?**~~
  **Settled by the owner, 2026-10-07: no limit.** A skater signs up with 1 to 10 coaches and adds
  more later as needed. (ADR-025)
- ~~**Open question — Kim §6: Does a sibling of an approved family skip approval, and does a
  slow approval need a reminder to the coach?**~~ **Settled 2026-10-09 by the owner:** the coach
  approves everyone, siblings included; no reminder email; the Students tab title shows the
  number of pending students. (ADR-002, amended)

## 2a. Shared lessons (ADR-026)

- ~~**Pending decision — needs Kim (§8):** pricing (P2), what the booking family cancelling does
  (P4)~~ **Settled by the owner, 2026-10-13** (ADR-026 amendment): the price is split; a skater
  leaving in time leaves the other family to choose full price or cancel with no charge (no
  answer by the notice period cancels); leaving late, the leaver may be charged their share of the
  late-cancellation fee (half, for two skaters). ~~**Still open (Kim §8 Q6):** when an invitation the family hasn't accepted lapses (P5, in part).~~ **Settled by the owner 2026-10-13:** no cutoff before the lesson; it expires when the lesson starts (ADR-026 P5). Max 2 and
  approval decided by the owner 2026-10-07; sharing is on. (ADR-026)
  *Changed 2026-10-13 (ADR-031 decision 8): the staying family answers by whichever comes first,
  the start of the notice period or 7 days after the leave. No answer by then cancels with no
  charge. ADR-031 decisions 7–10 also settle ADR-026's gaps: how a skater leaves, the booking
  family leaving while the invited family stays, a freed place taking a new invite, and
  ~~re-splitting shares after a re-price~~ how a re-price reaches split shares.* *Revised 2026-10-13 (ADR-031 revision): no family's
  action writes another family's records. The total price is stored only on the lesson time;
  each share is worked out as `priceMinor ÷ shareCount`, and a re-price changes only the lesson
  time's price. A leave in time is recorded as a pending leave on the lesson time; the staying
  family's seat isn't touched. So ADR-024 needs no shared-lesson exception.*
- **Open question — needs Kim (§8 Q7): Is 7 days the right limit** for the staying family to
  answer when the other skater leaves in time? The owner chose 7 days so nothing waits more
  than a week. (ADR-031 decision 8, ADR-031 Open) *Added 2026-10-13.*
- ~~**Open question: Recurring shared lessons** — does one invitation cover a series?~~ **Settled:
  yes** (ADR-026 d5).
- ~~**Open question: A series where skater B can't make some dates** — accept the dates that work,
  or all or none? (ADR-026 Open)~~ *Closed 2026-10-13 by ADR-031 decision 6:* a series joins
  lesson by lesson. Each date succeeds or fails on its own; the invited family gets the dates
  that work.
- ~~**Open question: Lowering `maxSkaters`** on lessons already booked with more skaters.~~
  **Settled 2026-10-12 by the owner:** a lesson already booked can't have its `maxSkaters`
  lowered. A schedule edit changes it only for lessons booked afterwards. (ADR-026)
- **To-do: Add the share-code rows to the gate tests** and re-run them, since `client-tenant`
  gains a read statement. (ADR-026, `runbooks/database-gate-tests.md`)
  *Widened 2026-10-13 (ADR-031 Consequences): the gate tests also need rows for lesson times,
  seats, ended seats and the new deadline index (GSI4). The family's read allowlist must cover
  lesson-time attributes for availability and the family's own seat for retry checks.*
  *Revised 2026-10-13 (ADR-031 revision): the availability read must leave out a lesson time's pending leave. Add a row: a
  family session can't change another family's accepted seat in any way.*
- ~~**Open question: What amount the unpaid list and weekly reminder show for a past seat with
  attendance not recorded.** It has no fixed `amountMinor` yet, and the unpaid index (GSI3)
  doesn't hold the lesson time's price or share count. (ADR-031 revision decision 7, ADR-018)
  *Added 2026-10-13.*~~ *Settled 2026-10-13 (ADR-031 decision 7): ~~the 9pm report job fixes
  `amountMinor` for any of that day's seats still without one.~~*
  *Revised 2026-10-13: no amount is copied onto a seat; it's worked out from the lesson time (ADR-031 d7).* *The unpaid list and weekly reminder work the share out from the seat's lesson
  time, so no seat needs a stored amount; the 9pm report job writes nothing.*
- ~~**To-do: Write `consumer-invite`'s narrow write permission** — only `partnerName`,
  `partnerStatus`, `invitedClientId`, its GSI1 keys and `choiceAnswerBy` on `SEAT#` items, across
  coaches. (ADR-031 decision 14, Open) *Added 2026-10-13.*~~ *Settled 2026-10-13 (ADR-031, option
  B): reads, plus `UpdateItem` limited by the `dynamodb:Attributes` condition to the key fields
  and those attributes; no `PutItem` or `DeleteItem`. It no longer ends seats — the inviting
  family's own cancel or the sweep's `INVITER_LEFT` does.*
- **Open question: The IAM roles of `sched-lesson-roller` and `sched-deadline-sweep`** — only the
  sweep may read GSI4 (ADR-031 d14). *Added 2026-10-13.*
- ~~**To-do: Design the sharing screens** — share code on the skater profile, inviting on booking,
  confirm or decline, shared bookings on both sides. (ADR-026)~~ *Done 2026-10-13: designed in
  `design/harbor` (family and coach sites).*
- **To-do: Build the ~~nightly invitation sweep~~ *hourly deadline sweep* (`sched-deadline-sweep`)** — ~~warnings sent early, `warnedAt`~~ warnings sent at the 9pm run before they're due *(Revised 2026-10-13 (ADR-031))*, expiry of ~~`SENT`~~ *`INVITED`*
  and `AWAITING_COACH` invitations. (ADR-026 d5a) *Changed 2026-10-13 (ADR-031 decision 12):
  the sweep runs every hour and also cancels unanswered staying-family choices at their
  answer-by time. The warning waits for the 9pm run before it's due; urgent emails go at once.
  Its missed-run alarm is part of ADR-010.* *Revised 2026-10-13 (ADR-031 d5, d12): it also acts
  on `INVITER_LEFT`, which sits on the lesson time and names an accepted invited seat: it ends
  that seat as `WITHDRAWN` and the lesson time goes back to `OPEN`.*
- **To-do: Build the shared-lesson banner** on both families' home screens. (ADR-026 d5a)
- ~~**Pending decision — after Kim's P5: How lapsing invitations are timed.** Nothing today fires
  at a per-booking time; EventBridge Scheduler's one-off schedules are the likely fit. (ADR-026)
  *Partly settled 2026-10-09 (ADR-026 d5a): a nightly sweep sends the warning and expires
  invitations whose lesson has started. Still open: a precise timer if Kim's P5 sets a lapse
  before the lesson.*~~ *Closed 2026-10-13 by ADR-031 decision 12:* the hourly sweep, not
  one-off timers (turned down in ADR-031). ~~If Kim's P5 sets a lapse before the lesson, it
  becomes one more deadline the sweep handles. The P5 answer itself still waits on Kim (§2a
  above).~~ *P5 settled by the owner 2026-10-13: no lapse before the lesson, so no new deadline.*
- ~~**Open question: Is ADR-025's clash warning enough** when an invited skater joins a lesson
  that overlaps their lesson with another coach? (ADR-026)~~ **Settled 2026-10-07** (ADR-026
  decision 5): the confirm page shows clashes and the family chooses.
- **To-do: Include ~~participants~~ every seat everywhere a lesson is walked** (participants are
  seats since ADR-031) — the schedule-change consumer's
  cancel and re-price, the change notifier (one message per family), the drift check, the
  end-of-day report, coach cancellation, and erasure on request. (ADR-026 Consequences)
  *2026-10-13 (ADR-031 decision 2): each skater now has their own seat in the lesson, so this
  means walking every seat, not participants hanging off a booking. The to-do stands.*
- **Note:** share-code length and alphabet follow the coach-code decision (blocker #7)~~, and
  `consumer-invite` brings the total to fourteen Lambda functions~~. (ADR-026) *Changed
  2026-10-13 (ADR-031 Consequences): ~~`consumer-invite` is gone;~~ ADR-031 adds the nightly
  `sched-lesson-roller` and makes the sweep hourly. The function count is for
  `architecture.md` to restate. The `INVITE#` copies it kept in step are gone too (ADR-031
  decision 6): each seat carries the other skater's name and status~~, written in the same step~~.*
  *Revised 2026-10-13 (ADR-031 revision): `consumer-invite` stays. It sends the shared-lesson emails and writes the other
  skater's name and status onto each seat, about a second after a seat changes. No family
  writes them. It also keeps two more read-only copies: the invited family's view of an
  invitation (`invitedClientId` and their GSI1 keys) and the staying family's `choiceAnswerBy`.*

## 2b. Skating membership numbers (`FeatureDecriptions/Client Sign Up`, `Coach Sign Up`)

Added to the sign-up notes on 2026-10-05: families must enter a USFSA or USA Hockey
registration number, and a coach's registration number becomes their coach code. Both can
change each season. Recorded in ADR-029 (2026-10-12); the research and Kim's answers below are its Open items.
*2026-10-12:* the coach-code half is dropped, and a skater's number is required (see below).

- **Research: Can USFSA and USA Hockey numbers be validated?** Is there an API, a lookup service
  or a data agreement? Not known. No longer needed for the coach code; it would only let
  BladeBook confirm a skater's number is real and current.
- **Research: How each organisation's numbers behave year to year.** USA Hockey may issue a new
  number each season; US Figure Skating member numbers may be permanent with yearly renewal.
  Unverified.
- ~~**Pending decision: Is the coach code the coach's registration number, or a random BladeBook
  code?**~~ **Settled 2026-10-12 by the owner:** BladeBook generates the coach code, as
  ADR-016 decision 2 and ADR-002 decision 2a already have it. It is never the coach's
  registration number. That removes the lockout and guessing risks. Length and alphabet were
  settled 2026-10-13 (blocker #7).
- ~~**Open question — needs Kim (§9): Is a skater's number required?**~~ **Settled 2026-10-12
  by the owner:** yes. In Phase 1 every skater needs a US Figure Skating (USFSA) or USA Hockey
  number. It belongs to each skater, not the family account. **Still open, for Kim (§9):**
  adults and learn-to-skate beginners who don't have a number yet, and what happens when a
  number expires (blocked from booking, a reminder, or nothing).
- ~~**Open question: Does this exclude Canada?**~~ **Settled 2026-10-12 by the owner:** in
  Phase 1, yes. Skate Canada and Hockey Canada numbers are **Phase 2**. The design still
  supports CAD for coaches.
- **To-do: Validate and sanitize the skater's number.** It's a free-text box, so it needs a
  rule for each organisation: trim spaces, uppercase, check against a pattern made only of
  allowed characters, cap the length, and store the cleaned-up form. This checks the shape only;
  it can't prove the number belongs to a real, current member. What's known so far
  (researched 2026-10-12):
  - **USA Hockey:** 14 characters, 9 digits and 5 letters, new every season. One digit
    position is a check digit that's fixed for the season (2015–16: the 4th digit was 6), so
    that value must be a setting, not built into the code. Volunteer and manager numbers
    contain "XX"; older bulletins disagree about where.
  - **US Figure Skating:** no published format found. Members seem to keep their number when
    they renew. Learn to Skate USA numbers are a separate series. **Get the length and
    characters from a real card or from Kim.** Until then: digits only, within a loose length
    range.
- **Open question: Why is a skater's number needed?** It adds personal data about minors, so
  §7's data minimisation needs a stated purpose. (Kim §9, question 2)
- ~~**Settled, no action:** a coach's code changing each year doesn't affect existing families or
  recurring bookings.~~ *No longer applies (2026-10-12):* the coach code is generated by
  BladeBook and doesn't follow a yearly registration number.

## 3. Money and payments

- **Open question (Phase 2): What the missed-lesson fee is charged against when
  `missedLessonFeeMinor` ≠ `priceMinor`** — client-facing wording on the outstanding view and
  the reminder. For MVP a no-show shows ~~its full lesson price~~ its share worked out from the lesson time (the
  full price, unless shared) *(Revised 2026-10-13 (ADR-031))*. (ADR-015)
- **Open question: Bounds on `requiredNoticeHours`** for when coaches can edit it in Phase
  2 — may a coach set 0? 168? A fixed list? MVP defaults to 24. (ADR-015, ADR-016)
- **Open question (Phase 2): Does any cancel confirmation become a definite "will incur" with
  an amount?** MVP says "may incur" everywhere. (ADR-015 decision 6)
- **Open question (Phase 2): Is unpaid history shown to the client, or only the coach?**
  *Moved to Phase 2 by the owner, 2026-10-12.* Coach-only in MVP. (ADR-003)
- **To-do (Phase 2): Rate-limit the manual payment reminder** before the button ships.
  (ADR-003)
- ~~**Pending decision: Does BladeBook calculate rink fees, or does the coach enter what they
  paid?**~~ **Settled 2026-10-12 by the owner: BladeBook calculates them.** How it calculates
  is open and complex, so every question about it is kept in its own document,
  **`Q_Rink-Fees.md`**, with Part A for Kim and Part B for the owner. Recorded in ADR-030, which
  is accepted in part until those are answered. Background as first
  recorded: *Added 2026-10-07 from talking with Kim.* The financial page shows year-to-date (YTD)
  gross and fees paid to the rink. Calculating means modelling each rink's terms: a percentage of
  gross or a flat monthly fee (Pelham Civic Center (PCC) figure skating: 15% or $500 a month), an hourly rate (PCC
  hockey: $10 an hour), and rates that vary by ice type. Entering is simpler and always matches
  what was actually paid. Kim's own question applies: can a coach switch between percentage and
  flat fee from month to month? Coaches at more than one rink need fees per rink.
  (`FeatureDecriptions/Coach Financial Page.md`, `Talking with Kim:.md.md`)
- ~~**Open question: What counts as gross?**~~ **Settled 2026-10-12 by the owner:** money
  received. That means lessons marked paid, plus missed-lesson fees actually collected. Waived
  and unpaid lessons are left out. The year is the calendar year (the tax year for individuals
  in both the US and Canada). Past years on screen are **Phase 2**. A paid lesson counts by its
  **lesson date**, and a finished year is **closed** for now. (ADR-030,
  `FeatureDecriptions/Coach Financial Page.md`)
- **Decided 2026-10-12 by the owner: a summary export is in MVP.** A **Download** button on the
  financial page saves a CSV for a chosen calendar year (this year or last): one row per month
  with gross received, rink fees and net, plus year totals. It has no skater names and no
  personal data, so it isn't a PII read under ADR-012. It covers what the coach's tax preparer
  needs, and lets the coach keep their own copy before records pass the 16-month floor (§8).
  Rows read live data only, filtered on `expiresAt` (ADR-017 decision 1).
- **Phase 2: A detailed export**, one row per lesson with skater names. Mostly children's data
  leaving BladeBook in a file, so it's decided together with the privacy rules: every export
  would be a logged PII read (ADR-012).
- ~~**To-do: Check data retention against the financial page.** YTD totals need a full year of
  lesson and payment history, and tax records are normally kept for several years. Confirm that
  ADR-017's time-to-live (TTL) and archive rules don't remove records the page or a tax return
  needs.~~ **Settled 2026-10-12 by the owner:** a 16-month floor on every window that holds
  lesson or payment records; rationale in §8. (ADR-017)
- ~~**Open question: Which handles count as "on the profile" for how the client paid?**~~
  **Settled 2026-10-07:** the handles the coach filled in, plus *Other*, no free text. ~~Open only:
  whether *Show my payment handles* (`displayPaymentTypesToClients`) matters.~~ **Settled
  2026-10-12 by the owner:** each payment type has its own switch, which makes it a how-paid
  option and shows it to families; `displayPaymentTypesToClients` is replaced. Families
  seeing `paidVia` in the raw API response is accepted. (`FeatureDecriptions/Coach Payment Section on
  Dashboard.md`, ADR-003 decision 4, amended 2026-10-09)
- ~~**Open question — needs Kim: Should cash be a fixed option?**~~ **Settled 2026-10-12 by
  the owner:** no. **Cash** becomes a payment type the coach can turn on at sign-up or on their
  profile, like the three handles. It shows as a how-paid option only if the coach turned it
  on. No other types are added: cheques and Interac e-transfer are *Other*. (ADR-003 decision 4,
  ADR-016 decision 7, both amended 2026-10-12)
- ~~**Open question: How-paid details.**~~ **Settled 2026-10-12 by the owner:** optional when
  marking a lesson paid, editable afterwards, and **seen only by the coach** for now. Stored ~~on
  the booking~~ on the seat *(Revised 2026-10-13 (ADR-031))* as a fixed value (`CASH`, `CASHAPP`, `VENMO`, `PAYPAL`, `OTHER`), so removing a
  payment type from the profile later doesn't change past records. A waived lesson has none.
  (ADR-003)
- ~~**To-do: Design the cash switch and the how-paid picker in Harbor.**~~ **Done 2026-10-12:**
  one switch per payment type at sign-up and on the profile, with the handle check; the how-paid
  picker is on the Payments page. (`FeatureDecriptions/Coach Sign Up`, `Coach Payment Section on Dashboard.md`)

## 4. Scheduling and booking

- ~~**Open question: Should a one-off booking have a date ceiling?** Recurrences cap at 12
  months; single bookings have none (the UI shows 3 months, the API doesn't enforce it).
  *Held open by the owner, 2026-09-30,* pending how often coaches change their schedules and
  prices — see `Items to ask Kim About.md` §1. *Kim, recorded 2026-10-08: the weekly schedule
  changes "not often"; how often prices change and how far ahead families book are still
  unanswered.* (ADR-006, `FeatureDecriptions/Bookings:`)~~ *Closed 2026-10-13 by ADR-031
  decision 3:* the system checks the 3-month booking window. Every picked date must fall in the
  months the booking page shows; a series is checked on its first date only, and its later
  dates may run past the window up to the end date. A pick outside it refuses the whole
  request: "That date is further ahead than you can book." Kim's §1 question 5 (how far ahead
  families book) is still worth asking as a check.
- **Open question (Phase 2): Is a coach booking for a family held to the 3-month window?**
  (ADR-031 decision 3, ADR-031 Open, ADR-009) *Added 2026-10-13.*
- **Phase 3: Travel time between rinks in the clash check.** Today only lessons that overlap
  in time clash; back-to-back lessons at different rinks don't. *Decided by the owner,
  2026-10-13.* (ADR-025, amended 2026-10-13, b)
- **Revisit with coach booking for a family (Phase 2, ADR-009): tell the coach about a clash?**
  For now only the family is warned. *Decided by the owner, 2026-10-13.* (ADR-025 f)
- **Open question (Phase 2): Is a saved schedule a third item type or a header not in
  effect?** Decides whether "save" and "apply" are one action or two. (ADR-008)
- ~~**Pending decision — needs Kim, and blocks building re-pricing: Hand-edited booking
  prices.** ADR-020 would overwrite them on the next schedule save. Remove per-booking price
  editing (*mark as waived* covers it; the per-student override is Phase 2 since 2026-10-13), or mark hand-set prices
  so they're never re-priced. (ADR-020 Open, `Items to ask Kim About.md` §5)~~ *Settled 2026-10-13 by the owner (ADR-031): per-lesson price editing is removed. Under ADR-031 no booking stores its own price — the price lives only on the lesson time and each skater's share is worked out from it. A one-off is covered by *mark as waived*. Personal prices (already Phase 2) will be a per-skater override applied when the share is worked out.*
- *Phase 2 since 2026-10-13 (owner): personal prices.* **Open question (Phase 2) — needs Kim: The shape of the per-student discount** — a fixed price, a
  percentage off, or a dollar amount off; whether changing it re-prices booked lessons; and
  whether `0` should mean free. (ADR-003, ADR-020, `Items to ask Kim About.md` §5)
- ~~**Pending decision — needs Kim: The large-price-change warning threshold** — how big a change
  triggers the preview's must-acknowledge warning. Depends on how much coaches normally change
  prices.~~ *Settled 2026-10-13 by the owner:* a change of 50% or more of the old price, up or
  down. (ADR-020 decision 4, `Items to ask Kim About.md` §1)
- ~~**Pending decision — needs Kim, and blocks the schedule-save amendment: A booking lands
  between the coach's preview and save.** Proposed underneath every option: the preview reads
  a per-coach booking counter that every booking increments, and the save commits only if it
  hasn't changed. If it has, recalculate; an unchanged plan saves silently, a changed one goes
  back to the coach. What happens to the new booking then depends on Kim: (A) show the coach
  and let them choose, (B) cancel with a "just booked" email, (C) keep it as a one-off, or
  (D) hide the affected times while the coach previews. Owner leans A + B. Record in an
  amendment to ADR-006/008/020 once answered. (`Items to ask Kim About.md` §7)~~ **Settled 2026-10-08 from Kim's answer: B** — the save goes ahead; bookings made since the preview are cancelled with the "just booked" email. Recorded in ADR-006, ADR-008 and ADR-020.
- ~~**To-do: Write the "just booked, then cancelled" email** (`FeatureDecriptions/Email templates Needed:`).~~ **Moved to Phase 2 by the owner, 2026-10-09**, with the booking counter it needed (ADR-006, ADR-008, ADR-020). To be reconsidered if feedback supports that this is an issue.
- ~~*Deferred to Phase 2 by the owner, 2026-10-12:* **Pending decision: Bookings don't check the
  schedule atomically.** MVP relies on the after-the-fact cleanup described here. Revisit if
  families report a booking cancelled moments after they made it. *Confirmed 2026-10-04.*
  Each occurrence is checked against the schedule in code, then written with a conditional
  `PutItem` whose only condition is `attribute_not_exists(SK)`. That prevents double-booking,
  but a schedule save landing between the check and the write isn't seen. Today the
  schedule-change consumer catches most of these by cancelling the booking after the fact. The
  rest are paged by the nightly drift check (next 30 days) or caught by the coach's next save.
  Proposed fix: write each occurrence as its own two-item `TransactWriteItems`, with a
  `ConditionCheck` on a per-coach schedule version that every schedule, temp or override write
  bumps. That keeps ADR-006's partial success, at twice the write cost. Independent of Kim's
  answer above. (ADR-004 d2, ADR-006, ADR-010 d5k)~~ *Closed 2026-10-13 by ADR-031 decision 11:*
  lesson times are stored, and a booking and a schedule save both change the same lesson-time
  record, so a booking can no longer land on a time the new schedule removed. The Phase 2
  schedule-version fix isn't needed. A time booked after the coach's preview is cancelled in
  the same save, with the ordinary cancellation email.
- **Open question (Phase 2): Do booked lessons follow a change to `requiredNoticeHours`?**
  (ADR-020)
- ~~**Open question: Timezone of the week grid for a client in another zone**~~ — correct, but
  unstated in the UI. **Settled 2026-10-12 by the owner:** times are always shown in the
  coach's timezone, and always labelled with it (for example "Times are rink time (Central)"),
  for every family, not only those in another zone. (ADR-006)
- **Phase 2: Revisit timezones for competitions.** A competition can be in another timezone
  from the coach's home rink, so "always the coach's timezone" may be wrong for those lessons.
  Revisit when competitions are designed. (ADR-006, `Talking with Kim:.md.md`)
- **To-do: Write the "no times posted yet" copy** for an all-grey calendar, and the coach's
  "build your schedule" prompt. (ADR-008)
- **To-do: Amend ADR-008 to add rink and ice type to the block.** *Decided by the owner, 2026-10-07:*
  ice type is required on every tab and never shown to families. The values are each rink's own
  names for its sessions, kept in a per-rink list that the owner adds to as BladeBook reaches new
  rinks; coaches pick from it and don't create their own. The rink is also per tab, fixed to
  PCC in Phase 1 (below). BladeBook calculates rink fees (§3, settled 2026-10-12), so also
  stamp the ice type onto each booking, the way price and currency are, so a later
  schedule change doesn't change last month's fees. (ADR-008, ADR-003,
  `FeatureDecriptions/Schedule Creater.md`) *2026-10-13 (ADR-031 decision 1): the ice type now
  sits on each stored lesson time with the price and currency. The ADR-008 amendment is still
  to do.*
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
- ~~**Open question: Does a client ever see their own cancellation history?**~~ **Settled
  2026-10-12 by the owner:** yes, in **Phase 2**. MVP stays email only. (ADR-006)
- *Parked:* Held slots are permanent for MVP — revisit when a coach holds one by mistake.
  (ADR-009)

## 6. Rinkside app

*Since 2026-10-12, the rinkside page is assumed to run in an ordinary browser tab, never from
the home screen: BladeBook's users are older (ADR-023, amended).*

- ~~**Open question: Safari may clear the page's offline copy and queue.** Outside a home-screen
  app, Safari can remove a site's stored data after 7 days of use without a visit. A coach
  back from a week off may find the page won't open offline at the rink. What does the page
  do, and does anything else need to change? (ADR-023 Open, ADR-014 d1, d5)~~ *Settled
  2026-10-13:* keep offline capture and guard the gap. The page says so and reloads its copy
  when it opens with signal after being cleared; queued entries are sent as soon as there is
  signal (ADR-014, amended 2026-10-13).
- ~~**Open question: How does the coach get to the rinkside page** without an icon: a link in
  the morning email, a link on the coach website's home page, a bookmark?~~ *Settled 2026-10-13
  by the owner:* a large link at the top of the coach website's Today page, and a link at the
  top of a new morning email to the coach listing the day's lessons, sent by the ~7:00am
  day-of reminder job. (ADR-023, amended 2026-10-13)

## 7. Notifications and SMS

*Deferred 2026-10-12 by the owner: all SMS to clients is Phase 2.* The coach's own
late-cancellation text (`smsCancellationAlerts`, ADR-009 decision 9) isn't covered by this, so
the carrier and `START`/`UNSTOP` items below still apply to it if it stays in MVP. "Real
delivery confirmation" is about email (SES), not SMS, so it stays open.

- **Open question: Does the one-time opt-in confirmation satisfy the carrier**, or is
  periodic re-disclosure needed? Answer comes from 10-digit long code (10DLC) campaign
  vetting. (ADR-007)
- **Open question: `START`/`UNSTOP` asymmetry** — the carrier re-subscribes, our `smsOptIn`
  stays false. Explain it in the UI? (ADR-007)
- *Deferred (Phase 2):* **Open question: A client opted into SMS whose email bounces gets
  nothing usable.** (ADR-007)
- *Deferred (Phase 2):* **To-do: Text-message templates for price changes** — increase, decrease ("good news") and a
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
  review. *Floor set by the owner, 2026-10-12:* any window holding lesson or payment records
  (settled bookings, chargeable cancellations, re-price lines) is **at least 16 months**,
  whatever the legal review says. The review can make a window longer, never shorter.
  **Why 16 months:** the financial page totals the calendar year, so on 31 December a lesson
  from 1 January is already 12 months old and must still count. After that the coach files their
  taxes from the year's figures: in the US by 15 April, and for most Canadians by 30 April. That's
  15.5 to 16 months after 1 January, so 16 months keeps a whole year's records live until
  those deadlines. It doesn't cover a US filing extension (to 15 October) or Canada's
  self-employed deadline (15 June), and coaches are self-employed. Those need about 18 months, or
  22 for the US extension. Records past the floor aren't lost; they're in the archive and can be
  restored.
  Each window still needs the legal review:
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
- ~~**Open question: Does a coach see anything when their history ages out?**~~ **Settled
  2026-10-12 by the owner:** yes. History screens carry a note such as "Lessons settled more
  than *N* months ago are archived. Contact BladeBook to request them," where *N* comes from the
  same setting as the retention window so the two can't drift. A warning before records are
  archived is **Phase 2**. The MVP summary export (§3) already lets a coach keep their yearly
  totals. (ADR-017)
- ~~**Open question: Are archive restores logged as personally identifiable information (PII) reads** under ADR-012, or is CloudTrail
  enough?~~ **Settled 2026-10-12 by the owner:** yes. The operator's restore tool writes a PII
  access-log entry for every restore: who restored, which coach and student, the reason, and
  when. Every read of a minor's data is then in one place, not split with CloudTrail, which
  shows only object keys and keeps 90 days by default. (ADR-017, ADR-012)
- **To-do: Build the archive restore as an operator command** (like `reconcile-schedule`), which
  writes the access-log entry. Needed once the "contact BladeBook to request them" note ships.
  (ADR-017)
- ~~**Pending decision: Who sends the decline email for a rejected student?**~~ **Settled
  2026-10-12 by the owner: `consumer-student-link`.** It gains `ses:SendEmail` and a
  `GetItem` on the coach profile for the Reply-To. The recipient comes from the deleted
  `STUDENT#` item's `clientEmail`, so the `StudentChanged` event for a removal must carry it.
  Background: A rejected
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
- *Phase 2 since 2026-10-13 (owner): removing a student.* **Open question (Phase 2): What does "delete a student/client" from the coach's student list mean?**
  Going forward or retroactive? Can the client still book? What does the client see? Also
  covers what happens to a client account left empty by a rejection. *Deferred by the
  owner, 2026-09-30.* *Narrowed 2026-10-13 by the owner:* removal is per coach, and a coach
  removing a skater doesn't affect the skater's lessons with other coaches (ADR-025 g). *2026-10-13:* the family
  profile has no Remove button. *Moved to Phase 2 by the owner, 2026-10-13:* every way of
  removing a student — from the coach's student list, from one coach or from all coaches — is
  Phase 2, so MVP has no Remove button on either website and this no longer blocks coding.
  (`FeatureDecriptions/Coach Dashboard on website.md`, ADR-002, ADR-025 n)
- **To-do: Extend the erasure design to the archive.** An erasure request must now reach the
  table, the archive bucket (one object per item, keyed by coach and student) and — for 35
  days, unselectively — Point-in-Time Recovery. (ADR-017, ~~`design/deletion/`~~ `docs/deletion/`) *Added
  2026-10-12:* and the monthly backups (12 months, §10), which also can't be edited.
- **To-do (with the erasure design): An erased-ID list.** A small record, kept outside every
  backup, of each erased student and client ID and the date. It holds IDs only, no names. Any
  restore (PITR, monthly backup, archive) re-applies the erasure for every listed ID before the
  data goes live, so a restore never brings an erased child back. An entry can be dropped once
  the oldest backup that could hold it has been deleted. (`docs/deletion/`, ADR-010, ADR-017)
- **Open question: Retention of the PII access log** —
  itself a record about minors. Still for the legal review; the interim values below stand
  until then. (ADR-012)
- ~~**To-do: Set an interim CloudWatch log retention value** instead of "never expire."~~
  **Decided 2026-10-12 by the owner:** the access log is kept in two tiers.
  - **CloudWatch: 90 days**, searchable, for day-to-day questions.
  - **Archive:** a subscription filter streams every line through Amazon Data Firehose into
    an S3 bucket, batched into large files (Deep Archive bills each object as at least about
    40 KB). A lifecycle rule moves the files to S3 Glacier Deep Archive and **deletes them
    after 2 years** as an interim window. Older entries take up to 12 hours to restore,
    the same trade-off as ADR-017's archive.
  - **No S3 Object Lock for now.** It would make the log tamper-proof, but would also block
    deleting it for an erasure request or a shorter legal window. Revisit after the legal
    review.
  (ADR-012, amended 2026-10-12)
- **To-do: Add the access-log archive to the infrastructure:** the Firehose stream, its
  role, the bucket (SSE-KMS, blocked public access, CloudTrail data events like the other
  buckets) and the lifecycle rule. (ADR-012)
- ~~**Open question: Does the access log need its own access logging?**~~ **Settled 2026-10-12
  by the owner:** no. It stops at AWS's own controls: only the operator role can read it, with
  multi-factor sign-in, and CloudTrail records what it can. Revisit if anyone else gains AWS
  access. (ADR-012 Open)
- **To-do: Confirm what CloudTrail records for CloudWatch Logs reads** (`GetLogEvents`,
  `FilterLogEvents`, Logs Insights queries). (ADR-012 Open)
- **Decided 2026-10-12 by the owner: access-log lines name the PII fields returned**
  (`guardianEmail`, `phone`, …), never their values, so "who saw my phone number?" has an
  answer. (ADR-012 decision 2, amended)

## 9. Monitoring, logging and tenant isolation

- ~~**Pending decision: Make the global secondary index (GSI1) student-link check a shared
  `core/` function**~~ **Settled 2026-10-05 (ADR-024):** writes take a `LinkedSkater` only
  `core.data` can create, plus a `clientId` ownership condition. (monitoring-questions §1)
- ~~**Open question: What happens when that check fails**~~ **Settled 2026-10-05 (ADR-024):**
  "was linked, no longer active" gets a clear message; "never yours" gets a not-found, a
  security event, and pages on 3+ in 15 minutes for one family or 10+ a day overall, both
  configurable. (monitoring-questions §1)
- **To-do: Cross-tenant isolation test in continuous integration (CI).** (monitoring-questions
  §1, ADR-013)
- **Decided 2026-10-12 by the owner: the production canary also tries cross-tenant reads.** It
  adds a second test coach (coach B) to ADR-027 decision 7's canary run. Coach B tries to read
  test coach A's students and bookings, and the test family tries to read a family that isn't
  theirs. Every attempt must be refused; **any success pages.** This catches a deployed
  permission change (a console edit, or infrastructure that slipped past CI) that the gate tests
  and CI can't see. (monitoring-questions §1, ADR-027 d7, ADR-021, ADR-022)
- ~~**Open question: Can accepting a `PENDING` student ever leak data across coaches**, for
  example when someone guessed a coach code?~~ **Closed 2026-10-12 by the owner.** A pending
  family can't read the coach's partition (ADR-022 d6); code guessing is rate-limited (ADR-019);
  Accept is a write in the coach's own partition, and the database refuses any other (ADR-021,
  gate tests passed 2026-10-05). What remains is a person risk, a coach accepting a stranger,
  and the approval step is the control for it. (monitoring-questions §1)
- **To-do: Confirm a gate-test row covers this exact case:** coach B's session updating coach
  A's `PENDING` `STUDENT#` item is refused. Add it if missing. (`runbooks/database-gate-tests.md`,
  ADR-021)
- **To-do: Check the approval screen shows enough to recognise the family:** guardian name and
  email, skaters' names, and their USFSA/USA Hockey numbers. (Harbor design, ADR-002)
- **To-do: Configure SES event destinations** for bounce, complaint and delivery. The pages
  on bounce and complaint rate are already decided (ADR-010 decision 4); they need this data
  to fire. (monitoring-questions §3)
- ~~**Open question: What happens to a hard-bounced address?**~~ Nothing marks it invalid, so the
  next message goes to it again and pushes the bounce rate up. **Settled 2026-10-12 by the
  owner.** Typos can't reach the system: sign-up and every email change are verified with a
  code. A bounce means an address that worked has since died (a closed school or work account,
  a lapsed domain), so bounces will be rare.
  - **MVP:** rely on SES's account-level suppression list, which stops sends to a hard-bounced
    address and protects the bounce rate.
  - **Phase 2:** a bounce flag on the family's profile, set from the SES bounce event. The family
    sees "We couldn't deliver email to *address*. Please update it" at login, and the coach sees
    an "email not working" marker on the roster. It clears when the email changes.
  (monitoring-questions §3)
- **To-do: Confirm the SES account-level suppression list is on** (bounces and complaints) in
  the production account. (monitoring-questions §3)
- **To-do: Turn on Cognito's "keep original attribute value active until verified"** for
  email, so a family who changes email but never enters the code keeps their old, verified
  login. (`FeatureDecriptions/ClientProfileView`)
- **To-do: Refresh every `STUDENT#` item's `clientEmail` copy** once a family's email change is
  verified, so messages never go to a stale copy. (architecture §4, ADR-021 d6)
- **To-do: Turn on Simple Notification Service (SNS) SMS delivery status logging.**
  (monitoring-questions §3)
- **To-do: Thread correlation IDs** from API Gateway through the event bus to consumers.
  (ADR-012, monitoring-questions §5)
- **To-do: Write the "never log" denylist** — contact details, `paymentInstructions`, student
  names, coach codes, payment handles. (monitoring-questions §5)

## 10. Reliability and operations

- **To-do: Write the restore runbook** — Point-in-Time Recovery (PITR) restores to a new
  table; repoint or copy back? (ADR-010) *Decided 2026-10-12 by the owner:* the same runbook
  covers PITR and the monthly backups below, and it **defaults to copy back**: prod stays on
  its table and a script copies back only the damaged records from the restored one.
  **Repoint** (move every Lambda, IAM and gate policy, and stream wiring to the new table) is for
  total loss only, because it loses everything since the restore point. Either way, the runbook
  must:
  - **pause notifications**: stop the stream consumers, or mark restore writes so they're
    skipped, so families don't get emails for old events;
  - **re-apply the erased-ID list** (§8) before anything goes live;
  - re-apply what an import doesn't carry: TTL, PITR, streams and alarms, through the
    infrastructure code.
- *Deferred (Phase 2, 2026-10-12): client SMS is Phase 2, so MVP has only the coach's text.* **To-do: Separate alert SMS from client SMS** (own topic and configuration set). (ADR-010)
- **To-do: Pass each scheduled job's target date in its trigger**, so a replayed or re-run job
  works on that date — this is what makes the end-of-day report re-runnable for a past date.
  (ADR-010 decision 2a)
- ~~**Pending decision: Backups beyond PITR's 35 days?**~~ Ties to the retention questions.
  **Settled 2026-10-12 by the owner:** yes, a **monthly export to S3**. EventBridge Scheduler
  calls DynamoDB's export-from-PITR directly, with no Lambda, into a backup bucket of its own
  (SSE-KMS, public access blocked, CloudTrail data events). Exports are stored in **S3 Glacier
  Instant Retrieval**, readable at once, and a lifecycle rule **deletes them after 12 months**
  (interim, for the legal review). This reuses the export-to-S3 pattern dev already uses
  (ADR-027, ADR-028). Restore is Import from S3 into a new table, then the runbook above.
  Cost: under a cent a month at today's few megabytes.
  - **Not Deep Archive:** a backup older than 35 days is needed for corruption noticed late, so
    the one wanted is usually 2–3 months old. A 12–48-hour wait for it defeats the purpose, and
    the saving is fractions of a cent.
  - **Revisit if the table grows to tens of GB:** then moving exports older than 90 days to
    Deep Archive starts saving real money. (GIR bills a 90-day minimum, so don't move sooner.)
  - **Phase 2 option:** AWS Backup, if copies in a separate AWS account are wanted as protection
    against a compromised account.
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
  sign-in** — day or week cancellation, ~~removing a student~~ (Phase 2 since 2026-10-13), approve/decline, changing contact
  or payment details.
- ~~**Pending decision (ADR-023 Open): The coach website's refresh-token lifetime**~~ **Settled
  2026-10-05 (ADR-023 d6):** 60 minutes on the coach and family websites, 4 hours on the
  rinkside page, counted from sign-in.
- ~~**To-do (ADR-023 Open): Confirm on an iPhone** that a home-screen web app keeps its own
  sign-in, separate from Safari.~~ *Dropped 2026-10-12:* users are older and aren't expected
  to add pages to the home screen (ADR-023, amended).
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
- ~~**Pending decision: The production canary's cadence and runner** (a scheduled CI job or
  CloudWatch Synthetics), and which mailbox the test coach and family use. (ADR-027 decision 7
  and Open)~~ *Settled in part 2026-10-15 by the owner:* in MVP the canary runs once at the end
  of each approved production deploy, plus an always-on up-check. (ADR-027, amended 2026-10-15)
- **Open question: Which mailbox the test coach and family use.** Still needed: the post-deploy
  check sends real email. (ADR-027 Open)
- **To-do: Add the `/health` route and the up-check.** A route on the API that needs no
  sign-in, reads no data and returns "OK"; health checks on it and the home page, alarming
  through ADR-010's paging. *Decided 2026-10-15:* `/health` is rate-limited, with its own
  firewall rule; its number is set when it's built (ADR-019 Open). (ADR-027, ADR-019, amended
  2026-10-15) *Added 2026-10-15.*
- **Phase 2: A scheduled production canary** — whether to have one, and where: a GitHub
  Actions schedule with the test passwords as GitHub secrets, or CloudWatch Synthetics.
  (ADR-027 Open) *Added 2026-10-15.*
- **To-do: Mark the canary's test accounts and keep them out of anything summed across
  coaches.** (ADR-027 decision 7)
- **To-do: Check that teardown left nothing behind** — a script or a check at the end of the
  destroy — and an infrastructure test that production's table and buckets stay retained and
  deletion-protected. (ADR-027 decision 5 and Open)
- **Pending decision: Should the ArchUnit test rule reach beyond `core/`?** Recommendation:
  move the cancellation consumer's orchestration into `core/` instead. (ADR-013)
- **To-do: Build the first CI pipeline** — test enforcement switches on with it. ~~Waits on the
  CI system choice in §1.~~ *Since 2026-10-15:* on GitHub Actions (ADR-032). Nothing deploys
  until the §1 lock-down to-do is done. (ADR-013)
- **Pending decision: Keep pinned GitHub Actions current with Dependabot, or check by hand on a
  schedule?** (ADR-032 Open) *Added 2026-10-15.*
- **Pending decision: How long to keep CI run logs, and whether to copy them anywhere.**
  (ADR-032 Open) *Added 2026-10-15.*

## 12. Feature descriptions — gaps to fill

- **To-do: Write the two shared-lesson emails to the family who stays** — "the other skater can't
  make it: keep at full price or cancel" and "cancelled, no answer". Both always sent.
  *Added by the owner 2026-10-13.* (ADR-026, amended 2026-10-13; `FeatureDecriptions/Email templates Needed:`)
  *Changed 2026-10-13 (ADR-031 decision 8): the answer-by time in both is whichever comes
  first, the start of the notice period or 7 days after the leave.*
- **To-do: Write the shared-lesson emails ADR-031 adds** — "Shared lesson dates cancelled" (one
  email listing the dates, after *Cancel all remaining dates*) and the one-date invitation for
  a freed place. Also decide whether keeping a freed date sends a confirmation (listed under
  "Mentioned but not decided"). *Added 2026-10-13.* (ADR-031 decisions 9 and 10;
  `FeatureDecriptions/Email templates Needed:`)
- **Pending decision: Two shared-lesson emails ADR-031 leaves undecided** — a confirmation for
  cancelling one freed date, and "the other skater can't make it": once per date or once per
  series. *Added 2026-10-13.* (`FeatureDecriptions/Email templates Needed:`, "Mentioned but not decided")
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
- **To-do: Commit the untracked work** — Commit `terraform/` and the uncommitted edits.
