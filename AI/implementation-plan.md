# BladeBook — Implementation Plan

**Last checked:** 2026-11-23, against `main` after PR #68.
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
| [17b](../infra/README.md) | Infrastructure, part 2: the table from the seed import, the API and its functions, SES, the event backbone and the seven consumers, the scheduled jobs, the access log, the firewall and alarms, `auth-post-confirmation`, and the deploy workflow (I1–I20, I29). No batch log; its record is `infra/README.md` | #61 |
| [17c](../infra/README.md) | Infrastructure, part 3: the family read allowlist, the gate tests against dev's real table and roles (76 of 76), each website at its host's root and uploaded by the stack, Figtree from BladeBook's own files, and the Content Security Policy (I11, I14, I17, I30, I31). No batch log; its record is `infra/README.md` | #63 |
| 18 | Real sign-in on both websites and the rinkside page, with every stand-in removed (I31, I32), and three wrong passwords before a schedule save signing the coach out (I33). No batch log | #64 |
| 30a | Security scanning, the repository settings: secret scanning with push protection, Dependabot alerts and security updates, CodeQL, and `main`'s ruleset blocking a merge on a high or critical finding. No batch log; its record is `docs/runbooks/security-scanning.md` | #83 |
| 30b | Security scanning, the first findings: every day-one alert decided (three dismissed as false positives, nine fixed, the rest fixed before). No batch log; each decision is in `docs/runbooks/security-scanning.md` | #86 |

**Under way:** no batch. Not a batch: PR #72, the state-machine fixes found by modelling them in TLA+ (`docs/tla/`).

**Left over from Batch 18:** dev's Content Security Policy is still report-only (`infra/lib/config.ts`, `csp`).
Click through every signed-in page in dev, then set it to `enforce` (17c, I17). Production already enforces it.

**What that means for the code:**

- `backend/` is a Maven multi-module build (`core`, `api-coach`, `api-client`, `consumers`). Locally it runs against
  DynamoDB Local, with events and scheduled jobs run in-process or on a local timer (Question 4); in dev they run on
  AWS.
- `web/` has three Vite entry points (coach, rinkside and family) and the rinkside page's service worker.
  `web/src/shared/auth` is the sign-in (Batch 18): BladeBook's own forms call Cognito through Amplify's Auth module.
  Local development signs in against dev's real user pool (I31).
- `infra/` holds the CDK (TypeScript) app from Batches 17a–17c. In dev, `bladebook-dev-identity` (the user pool, its
  groups and app clients, the test accounts, the seed bucket and SES for the owner's test mailbox),
  `bladebook-dev-app` (both websites behind CloudFront, the table, the API, the events and jobs, and the tenant roles)
  and `bladebook-dev-deploy-access` (GitHub's deploy role) are deployed, and dev is bootstrapped with the data denies
  (I13). The app runs in dev. Production's account doesn't exist yet.

## 3. Blocked outside this work

| Blocker | Effect on this plan |
|---|---|
| The production AWS account doesn't exist yet | Batch 29 can't start. The account needs CloudFront verification by AWS Support as soon as it exists, as dev's did (`infra/README.md`). |
| The product's final name (`docs/Blockers-Before-Coding.md` §5) | Needed before SES leaves the sandbox (Batch 29). |
| Events (DynamoDB Streams → EventBridge) and scheduled jobs can't run locally | Locally they're called in-process or on a local timer (Question 4); in dev they run on AWS. |
| Rink-fee calculation undecided (`docs/Q_Rink-Fees.md`) | **Phase 2** (owner, 2026-11-12). The financial page shows gross only and says rink fee calculation is coming. |
| Which function sends the coach's SMS opt-in confirmation (ADR-007 d8) | The coach's late-cancellation text, and the *Text me on late cancellations* switch, aren't built. |
| Coach who is also a parent: no screen, no ADR-MASTER section, questions 2–9 still open | Not built. |

## 4. What's left to build, in order

Batch numbers are names, not order. The rows below are the build order (owner, 2026-11-12, 2026-11-13 and 2026-11-16).
**Ready now:** 31, then 19 and 20, then 30d and 30c. 21, 25 and 28 are ready too: their Harbor designs were drawn
2026-11-23 (`876c236`); where they go in the order is the owner's call. The rest wait on a design, a decision or the production account
(owner, 2026-11-23: unblock them next). *30 added 2026-11-25 (ADR-032 amended): 30a–30b go first because the
repository is already public and nothing scans it for leaked secrets.*

| # | Batch | Waits on |
|---|---|---|
| 31 | **A signed-out session stops working at once** (G-34; ADR-023, amended 2026-11-25). `web/src/shared/auth` hands the API client the access token beside the ID token, sent as `X-BladeBook-Access`. In both APIs, after the existing token rules: verify the access token (signature, expiry, `token_use = access`, that API's app client in `client_id`, the ID token's `sub`) and call Cognito's `GetUser` with it; revoked, missing or mismatched → 401, Cognito unreachable or throttled → 503. One shared piece both APIs use, with Cognito behind an interface so the tests fake it. The API roles gain nothing: `GetUser` is authorized by the access token itself. A metric and alarm on `GetUser` errors and throttles (ADR-010). **Checked by:** the ADR-023 tests in both APIs; in dev, *Log out* then the old tokens get 401 at once, and an operator's global sign-out does the same. | — |
| 19 | **The clash warning across coaches** (G-22; ADR-025 d5): a time that overlaps the skater's lesson or pick with another coach is marked, and the confirm pop-up lists every clash (B7). | — |
| 20 | **A warning before the 60-minute sign-in runs out** (G-7), so the coach can stay signed in instead of hitting the next request's sign-in. | — (Batch 18 merged) |
| 30d | **Each API's OpenAPI document** (ADR-013, amended 2026-11-25). Add `springdoc-openapi-starter-webmvc-api` 3.1.1 to `api-coach` and `api-client` in test scope only. A test per API starts its Spring context, generates the document (keys sorted, a fixed server URL, `/api/*/local/**` left out, the bearer sign-in described) and compares it with `docs/api/api-coach.openapi.yaml` or `docs/api/api-client.openapi.yaml`; a difference fails the build and names the command to update it (`-Dopenapi.update=true`). CI's package check gains springdoc beside the test-token code. **Checked by:** both files committed; changing a route without updating the file fails `./mvnw verify`; no Lambda zip holds springdoc. | — (before 30c's runner, which reads these files) |
| 30c | **Security scanning: ZAP against dev** (ADR-032, amended 2026-11-25). A script (`infra/scripts/dast-dev.ts` or `.sh`, decided when planned) that runs ZAP's container image, **pinned by digest**, against dev: a passive scan of both websites, then an active scan of both APIs signed out and signed in as the test coach and test family. It refuses to run unless the target is dev and dev was built from seed data (not `--masked`). First with the firewall off, then once with it on. Reports go to a git-ignored folder; the ZAP settings and the false-positive rules file are committed. **Checked by:** a full run against dev with no high or critical finding left open, and the firewall-on run showing the app still works. **Rerun** before launch, and before any release that changes sign-in (Batch 28's multi-factor authentication is one), the database gate, the firewall or a route's access checks. | Dev built from seed data (it exists). *Sign-in built 2026-11-25:* `web/scripts/zap-sign-in.ts` (`npm run zap-sign-in` in `web/`) signs the test accounts in by SRP through the websites' own Amplify version and writes one env file per account to `~/.bladebook/zap/` (readable by the owner only) with ZAP's `ZAP_AUTH_HEADER_VALUE` and `ZAP_AUTH_HEADER_SITE`, so each token goes to its own dev host only. It refuses unless both dev stacks are in dev's account and have test accounts. Tokens and the API's sign-in age both end at 60 minutes: sign in again before each pass. *Still to build:* the scan runner itself and its rules file; it finds the endpoints from 30d's OpenAPI documents. **Must finish before launch** (Batch 29 and the launch items). |
| 21 | **Editing time off** (G-30): *Edit* on each time off in the schedule hub's list, like a special schedule's. Change the dates, review only the dates added or removed, save. Families hear only about lessons that actually change. | — *Designed 2026-11-23* (`design/harbor/coach/schedule.html`): *Edit* on each time off, the form opened with its saved dates (the first day locked once it has started), the dates added and the dates given back, and *Nothing has changed yet*. The server side is built: `PUT /api/coach/schedule/temps/{tempId}` takes time off, and its preview compares the old dates with the new; the website is what's left (`TimeOffForm` makes new time off only) |
| 24 | **The rest of repeating bookings** (G-20): refuse a key seen again with a different request, and ask about a series an earlier attempt booked that a resubmission drops (ADR-MASTER §7; ADR-006 d4b); show the series' current interval on the coach's day view after a *Make it less frequent*. | The dropped-series question needs a Harbor screen; the day-view interval needs the coach to read the family's series header (or a copy on the seat), an ADR question |
| 25 | **The rest of the rinkside page offline** (G-32): a notice when Safari has cleared the page's offline copy (ADR-014 amendment of 2026-10-13), and a check on a real iPhone at a rink. | — *Designed 2026-11-23* (`design/harbor/README.md`): Today says the page is saved for no signal again, worded to be true on a first visit too, so the page never has to tell the two apart. The iPhone check can be done now: the site runs in dev |
| 28 | **A coach's multi-factor authentication (MFA)** (I32): turning it on in Profile → Account with an authenticator app, its code at log-in and when signing in again before a save, and turning it off. | — *Designed 2026-11-23* (`design/harbor/coach/screens-profile-mfa.*`): turning it on and off in Profile → Account, the code at log-in on the website and the rinkside page, and the code in the *Confirm it's you* box before a schedule save. Batch 18 has merged |
| 29 | **Production email** (ADR-MASTER §13, §19; ADR-010 d4; Open-Pending §9 and the owner's 2026-10-12 bounce ruling; I34). Sets prod's `emailDomain` to `bladebook.org`, so the deploy verifies the sending domain and writes its DomainKeys Identified Mail (DKIM) records. Turns SES's account-level suppression list on for bounces and complaints (in the stack if CDK supports it, otherwise a runbook step). Moves production's Cognito codes from Cognito's own sender to SES, **from `no-reply@bladebook.org`** (I34), still one generic message (no custom message trigger). Writes the SES production-access request: what is sent, why every address is already verified by a code, the suppression list, and the bounce and complaint alarms that already exist (`infra/lib/alarms.ts`). Then, once the Domain-based Message Authentication, Reporting and Conformance (DMARC) reports show only SES sending as `bladebook.org`, moves the DMARC policy from `p=none` to `p=quarantine`, and later `p=reject` (I34). No custom MAIL FROM domain (I34). Checked by sending each template to a real Gmail and a real Yahoo address: it arrives in the inbox, DKIM and DMARC pass, and the From and Reply-To are right. *Not in it:* Phase 2's per-address bounce flag and the SES event destinations it needs; the other launch items (the firewall's block mode, the DAST pass on dev (Batch 30c), the restore runbook, the production canary and its mailbox, the legal review). | The production AWS account and its CloudFront verification (§3); the product's final name (`docs/Blockers-Before-Coding.md` §5: before SES leaves the sandbox). The DMARC record itself is added by hand beforehand (I34). |
| — | The coach's late-cancellation SMS and its switch (G-3); a coach who is also a parent | Blocked (§3) |

## 5. Decisions still in force

Each is the owner's. The full wording, and every decision that's been settled for good, is in `AI/plan-history.md`.

- ~~**Question 3, signing in locally** (2026-11-06):~~ *Replaced 2026-11-20 (owner, I31): from Batch 18, local development signs in against dev's real user pool, and the token stub leaves the APIs' shipped code for test-only code.* **Question 3, as it was:** a token stub that exists only in the local profile. It issues
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

**Batch 17b and 17c conflicts (listed 2026-11-17): all twenty ruled the same day** (I1–I20), recorded in
`AI/plan-history.md`. None open.
