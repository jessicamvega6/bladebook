# BladeBook — Implementation Plan

**Last checked:** 2026-11-16, against `main` after PR #54.
**Sources:** `docs/adr/ADR-MASTER.md` (current through ADR-033) and the ADRs it cites, the Harbor screen designs in
`design/harbor/`, `docs/architecture.md` §10 (MVP features 1–16), `docs/Blockers-Before-Coding.md`, and the feature
notes in `FeatureDecriptions/`.

This file holds **only what's current**: the rules, where the build stands, what's blocked, what's left to build, and
the decisions still in force. When a batch merges, update §2 and §4 here, and write its log in `AI/batch-logs/`.

| Looking for | Where it is |
|---|---|
| Open gaps (G-) and shortcuts (SC-), and what closes each one | Root `README.md` (the only list) |
| What a built batch did, its rulings and how it was checked | `AI/batch-logs/batch-NN.md` (was §7) |
| The ADR vs screen conflicts (A1–A11, S1–S12, B1–B12, R1–R10) and every answered question | `AI/plan-history.md` (was §4 and §6) |

---

## 1. Ground rules

| Rule | How it's applied |
|---|---|
| Plan first | Nothing is built until the owner says **go**. |
| Small vertical slices | Each batch runs end to end: React page → `api-coach` / `api-client` → `core` service → repository → DynamoDB Local. A batch is done only when every layer works for that slice. |
| One branch per batch | Off fresh `main`; merged, deleted, then the next batch starts. |
| Test-driven development (TDD) on `core/` | A failing test (red) first, then the least code that makes it pass (green). Code counts as working only once its tests are green. |
| Test focus | Happy path, sad path, error states and invalid input, and important boundaries first. |
| Mutation testing (PIT) on `core/` | ADR-013 decision 3. Runs on all of `core/`, nightly (08:00 UTC) and by hand only; never on pull requests or pushes to `main` (owner, 2026-11-16; `.github/workflows/mutation.yml`). The build fails below `pit.mutationThreshold` in `backend/core/pom.xml`, **85%** (baseline 87% on 2026-11-13). Raise it as tests improve; never lower it to make a run pass. Locally, from `backend/`: `./mvnw -pl core test-compile pitest:mutationCoverage` (needs Docker). |
| ADR vs screen conflicts | **Nothing that conflicts gets built.** Before each batch, Claude lists that batch's conflicts and the owner rules ADR or screen for each one (Question 2). Anything unruled stays out and is listed as a gap. |
| Gaps and shortcuts | Listed in the root `README.md` only (owner, 2026-11-08: no panel in the websites). Writing a gap down doesn't count as building it. |
| Layout | `controller/`, `service/`, `repository/` (`core.data`), `dto/`, `domain/`, `config/`, `security/` and `exception/` packages. `core/` stays framework-free (ADR-001). |
| Java 17 | Chosen over the ADRs' Java 25 (owner, 2026-11-06; ADR-001 A10, runtime `java17.al2023`). No pattern-matching `switch`, record patterns, sequenced-collection methods or unnamed `_` variables. |

## 2. Where the build stands

**Built and merged** (each links to its log):

| Batch | What it built | PR |
|---|---|---|
| [1](batch-logs/batch-01.md) | Walking skeleton, coach profile and coach code | #6 |
| [2](batch-logs/batch-02.md) | Weekly schedule and the coach's month, week and day views | #10 |
| [3](batch-logs/batch-03.md) | Family sign-up with a coach code; the coach approves or declines | #13 |
| [4](batch-logs/batch-04.md) | Booking one lesson | #22 |
| [5](batch-logs/batch-05.md) | Cancelling one lesson, by the family and the coach | #23 |
| [6](batch-logs/batch-06.md) | Time off, special schedules and the save impact preview | #24 |
| [7](batch-logs/batch-07.md) | Rinkside attendance online, and the Lessons page's corrections | #25 |
| [8](batch-logs/batch-08.md) | Payments | #27 |
| [9](batch-logs/batch-09.md) | Repeating bookings | #28 |
| [10](batch-logs/batch-10.md) | The rinkside page offline | #29 |
| [11](batch-logs/batch-11.md) | Shared lessons | #38 |
| [12](batch-logs/batch-12.md) | The financial page and its download | #37 |
| [13](batch-logs/batch-13.md) | Emails and scheduled jobs | #39 |
| [14](batch-logs/batch-14.md) | Business-email confirmation | #50 |
| [15](batch-logs/batch-15.md) | Family profile: *Add a skater* and *Add a coach* | #30 |
| [16](batch-logs/batch-16.md) | Coach Profile → *Visibility & texts* | #31 |
| [22](batch-logs/batch-22.md) | Today's lessons and figures | #53 |
| [23](batch-logs/batch-23.md) | The rinkside Week tab | #51 |
| [26](batch-logs/batch-26.md) | Saving a closed year's figures | #52 |
| [17a](../infra/README.md) | Infrastructure, part 1: `infra/` in CDK (no batch log; its record is `infra/README.md`) | #54 |
| [27](batch-logs/batch-27.md) | Lessons from before last year are view only (an unpaid one can still be waived) | #57 |

**Under way:** Batch 17b, on `feature/batch-17b-infra`. Its conflicts (I1–I20) are listed and wait for the owner's
rulings (§6). Batch 17 is split into 17b and 17c (owner, 2026-11-17).

**What that means for the code:**

- `backend/` is a Maven multi-module build (`core`, `api-coach`, `api-client`, `consumers`). Everything above runs
  locally against DynamoDB Local. Events and scheduled jobs run in-process or on a local timer (Question 4).
- `web/` has three Vite entry points (coach, rinkside and family) and the rinkside page's service worker.
  `web/src/shared/auth` holds the local sign-in stand-in (Question 3, SC-1).
- **Still disabled on screen:** the coach Profile's *Account* tab (Batch 18).
- `infra/` holds the CDK (TypeScript) app from Batch 17a. In dev, only `bladebook-dev-identity` (the Cognito user
  pool, its groups and both app clients) is deployed, and nothing uses it yet. `bladebook-dev-app` waits for AWS
  Support's CloudFront verification (§3), and `bladebook-dev-deploy-access` waits for Batch 17b's deploy workflow.
  The app itself still runs locally only.

## 3. Blocked outside this work

| Blocker | Effect on this plan |
|---|---|
| Batches 17b and 17c (the table, API, functions, events and the website upload) aren't built; the AWS accounts and `dev.bladebook.org` exist (Blockers 2, 22 done) | The app isn't deployed. "End to end" means **running locally**. |
| Dev's AWS account can't create CloudFront distributions until AWS Support verifies it (asked 2026-11-16, case 179485860000682; `infra/README.md`) | `bladebook-dev-app` (both websites) can't deploy. Production's account needs the same step as soon as it exists. |
| The Amazon Cognito user pool is deployed in dev, but nothing signs in through it until Batch 18 | Signing in locally uses a stand-in (Question 3). The sign-in library is chosen: AWS Amplify's Auth module with Secure Remote Password (SRP) (ADR-023, 2026-11-12). The real sign-in forms are Batch 18. |
| Events (DynamoDB Streams → EventBridge) and scheduled jobs can't run locally | Called in-process or on a local timer, each a listed shortcut (Question 4). |
| Rink-fee calculation undecided (`docs/Q_Rink-Fees.md`) | **Phase 2** (owner, 2026-11-12). The financial page shows gross only and says rink fee calculation is coming. |
| The family read allowlist and the gate-test rows for `LESSON#`, `SEAT#`, `SEATEND#` and GSI4 (Blockers 23, 24) | DynamoDB Local ignores Identity and Access Management (IAM) rules, so the per-tenant credential rules are a listed shortcut until the gate tests pass on real AWS (Batch 17). |
| Which function sends the coach's SMS opt-in confirmation (ADR-007 d8) | The coach's late-cancellation text, and the *Text me on late cancellations* switch, aren't built. |
| Coach who is also a parent: no screen, no ADR-MASTER section, questions 2–9 still open | Not built. |

## 4. What's left to build, in order

Batch numbers are names, not order. The rows below are the build order (owner, 2026-11-12, 2026-11-13 and 2026-11-16).

| # | Batch | Waits on |
|---|---|---|
| 17b | **Infrastructure, part 2:** the table built from the seed import, the seed script and test accounts, `auth-post-confirmation`, the REST API and its functions, the event backbone (Streams → Pipe → EventBridge, Scheduler) with dead-letter queues, the scheduled jobs (with Batch 26's January job) and their roles (Blocker 24), the tenant roles, the access-log writes and alarms, the API's firewall, the drift check and TTL archiver, and the deploy workflow with ADR-032's security setup (Blocker 3). Closes SC-4, SC-5, SC-8, SC-12, SC-14, SC-15, SC-16, SC-17, SC-19, SC-20, SC-21, SC-22 and SC-27. | The owner's rulings on its conflicts (I1, I6, I9, I12, I13). Most of it deploys into `bladebook-dev-app` (SES, the access log, the data buckets), so it also needs that stack's CloudFront verification (§3) |
| 17c | **Infrastructure, part 3:** the family read allowlist written and the gate tests re-run on AWS against dev's real roles (Blocker 23, G-26), the Vite builds moved to each host's root, the website upload, and the Content Security Policy. With 17a and 17b, it closes every shortcut and gap the root `README.md` gives to Batch 17: adds SC-3 and G-26. | Batch 17b; the owner's rulings on I11, I14 and I17 |
| 18 | **Real sign-in** with BladeBook's own forms and Amplify's Auth module (ADR-023 d11 and its 2026-11-12 amendment): coach sign-up steps 1–2, the family's email code, log-in, forgot password, change password and log out, a coach's multi-factor authentication (MFA) code, and signing in again before a save. Tokens in tab storage, behind `web/src/shared/auth`. Closes SC-1, SC-7, SC-10, G-4, G-5, G-14 and G-15. | Batch 17's user pool |
| 19 | **The clash warning across coaches** (G-22; ADR-025 d5): a time that overlaps the skater's lesson or pick with another coach is marked, and the confirm pop-up lists every clash (B7). | — |
| 20 | **A warning before the 60-minute sign-in runs out** (G-7), so the coach can stay signed in instead of hitting the next request's sign-in. | Batch 18 |
| 21 | **Editing time off** (G-30): *Edit* on each time off in the schedule hub's list, like a special schedule's. Change the dates, review only the dates added or removed, save. Families hear only about lessons that actually change. | The Harbor design needs the *Edit* button and the time-off form opened with its saved dates (owner, 2026-11-12) |
| 24 | **The rest of repeating bookings** (G-20): refuse a key seen again with a different request, and ask about a series an earlier attempt booked that a resubmission drops (ADR-MASTER §7; ADR-006 d4b); show the series' current interval on the coach's day view after a *Make it less frequent*. | The dropped-series question needs a Harbor screen; the day-view interval needs the coach to read the family's series header (or a copy on the seat), an ADR question |
| 25 | **The rest of the rinkside page offline** (G-32): a notice when Safari has cleared the page's offline copy (ADR-014 amendment of 2026-10-13), and a check on a real iPhone at a rink. | The notice needs a Harbor screen and a way to tell a cleared copy from a first visit; the iPhone check needs Batch 17's deployed site |
| — | The coach's late-cancellation SMS and its switch (G-3); a coach who is also a parent | Blocked (§3) |

## 5. Decisions still in force

Each is the owner's. The full wording, and every decision that's been settled for good, is in `AI/plan-history.md`.

- **Question 3, signing in locally** (2026-11-06): a token stub that exists only in the local profile. It issues
  tokens with the right group and app-client claims, the real checks run against it, and it's listed as a shortcut
  (SC-1) until Batch 18.
- **Question 4, events and scheduled jobs locally** (2026-11-06 and 2026-11-12): consumer handlers are written for
  real, with tests, and a local dispatcher calls them in-process after the write. Scheduled jobs run on a local timer
  or by hand. Emails go to a local outbox. Each is a listed shortcut until Batch 17b.
- **Shared lessons' gate-test rows** (2026-11-12): built locally, with the family read allowlist listed as a shortcut
  until the gate tests pass on real AWS.
- **Rink fees are Phase 2** (2026-11-12).
- **Changing a coach's time zone is Phase 3** (G-13, 2026-11-12). In MVP it's set at sign-up.
- **Not in MVP** (2026-11-12): what the coach sees of cancellations afterwards (G-29, Phase 2), and reporting a
  skaters-per-lesson change on the review page (G-31).
- **PIT covers all of `core/`** (ADR-013, amended 2026-11-13). If runs get too slow, give service tests in-memory
  fakes rather than narrowing PIT.

## 6. Open questions

New ones go here until the owner rules, then move to `AI/plan-history.md`.

**Batch 17b and 17c conflicts (listed 2026-11-17).** Claude's recommendation follows each. Ruled ones move to
`AI/plan-history.md` (I2, I3, I4, I5, I7, I8, I10, I15, I16, I18, I19 and I20 so far).

| ID | Conflict | Batch | Recommended |
|---|---|---|---|
| I1 | The firewall is on the API's stage (ADR-MASTER §17, ADR-019), but each API is now reached through CloudFront under `/api/*` (ADR-027, 2026-11-16), so its per-address limits would see CloudFront's addresses | 17b | A second firewall on CloudFront for the API rules; lock the API to CloudFront |
| I6 | Four events unnamed (ADR-MASTER §3, §25), and no document says how a stream record becomes a named event | 17b | One Pipe forwards raw records; EventBridge rules match on key prefix and images; names kept as rule names |
| I9 | `api-coach` sends the business-email confirmation, but ADR-MASTER §2 gives it no SES | 17b | `ses:SendEmail` on that one template; amend §2 |
| I11 | Gate tests: ADR-021 says the real dev stack; the runbook says a sandbox account with hand-copied roles, and has no GSI4 | 17c | The real dev stack |
| I12 | No document says how access-log lines reach their own group on Lambda, or how "3 in 15 minutes per family" is counted | 17b | `core.data` writes them straight to the group; Contributor Insights for the per-family count |
| I13 | CDK's bootstrap policy is AdministratorAccess, so the deploy role could read table data (ADR-032 d2.7) | 17b | Deny the table's data actions and access-log reads now |
| I14 | Rinkside is `/coach/rinkside/` (ADR-023, ADR-MASTER, the code) or `/rinkside/` (ADR-027, `infra/`); email links assume one host | 17c | `/rinkside/`; separate coach and family hosts in the email links; update the ADRs |
| I17 | No Content Security Policy is settled; the coach page loads Google Fonts | 17c | Self-host Figtree; strict policy |
