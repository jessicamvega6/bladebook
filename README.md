# BladeBook

Lesson scheduling for skating coaches and the families they teach. The design lives in `docs/`
(start with `docs/architecture.md` and `docs/adr/ADR-MASTER.md`). The build plan is
`AI/implementation-plan.md`.

**Where the build stands:** Batch 1 — the walking skeleton, the coach's business-details sign-up
step, Profile → Details and Payments, and the coach code. Batch 2 — the weekly schedule editor, the
lesson times it makes, and the coach's month, week and day calendars. Batch 3 — family sign-up with
coach codes, the waiting family's Home and Profile, and the coach's Students and Waiting for approval
tabs (approve, approve all, decline). Everything runs on this computer only; nothing is deployed.

## Running it locally

You need Docker, Java 17 and Node 24.

```sh
# 1. DynamoDB Local on localhost:8000 (data kept in a Docker volume)
docker compose up -d

# 2. api-coach on :8080, in the local profile (DynamoDB Local + the token stub)
cd backend
./mvnw -q clean install -DskipTests   # clean: otherwise a change to core/ alone can leave the old core inside the api-coach jar
java -jar api-coach/target/api-coach-0.1.0-SNAPSHOT.jar --spring.profiles.active=local

# 3. api-client (the family website's API) on :8081, in a second terminal
java -jar api-client/target/api-client-0.1.0-SNAPSHOT.jar --spring.profiles.active=local

# 4. The websites on :5173, which pass /api/coach to :8080 and /api/client to :8081
cd web
npm install
npm run dev
```

Open **http://localhost:5173/coach/**. The first page is the local sign-in stand-in: type any
names and email. The same email always signs in as the same coach.

Open **http://localhost:5173/family/** for the family website, and choose *Sign up with a coach code*.
A coach's code is on their Today page; it works once their business email is confirmed (*Use my login
email* makes it work at once).

## Tests

```sh
cd backend && ./mvnw verify   # JUnit, ArchUnit and DynamoDB Local in Docker (Testcontainers)
cd web && npm test            # Vitest and Testing Library
```

The logic that exists in both Java and TypeScript is tested from hand-written cases at the repo root
(ADR-013 decision 3b): `schedule-cases.json` for the schedule, and `registration-number-cases.json`
for the skater's registration number. Add a case there and both suites run it.

## Gaps & shortcuts

What this build leaves out (**gaps**) or fakes (**shortcuts**). This list is the only place
they're recorded; the websites don't show it. Writing a gap down doesn't count as building it.

### Shortcuts (faked for now)

| ID | What | Closed by |
|---|---|---|
| SC-1 | Signing in is a **local token stub**, not Amazon Cognito. `api-coach` issues ID tokens with the `Coach` group and the coach app client; `api-client` issues them with the `Client` group and the family app client. The real checks (group, app client, 60-minute sign-in from `auth_time`) run against them. The coach's sign-up steps 1–2 and Log in are one stand-in page; the family's Log in is a stand-in page with no password. | The Cognito user pool existing |
| SC-2 | **“I’ve clicked the link”** marks a different business email confirmed at once. No email or link is sent. | Batch 14 (business-email confirmation) |
| SC-3 | Data is in **DynamoDB Local** through one unscoped client. The `coach-tenant`, `client-tenant` and `code-lookup` roles, their session tags and the database gate aren't exercised; DynamoDB Local ignores IAM (Identity and Access Management). The code still goes through the same doors (`AccessContext`, `ClientContext`, `LinkedCoach`), and a waiting family's code path reads nothing of the coach. | Infrastructure code, then the gate tests on real AWS |
| SC-5 | **A schedule save updates the lesson times in-process.** On AWS the save raises `ScheduleChanged` through DynamoDB Streams and EventBridge, and `consumer-schedule-change` does it; locally `LocalEventDispatcher` calls the same core service straight after the write. | Infrastructure code (Streams, the Pipe, the consumer Lambda) |
| SC-6 | **Saving goes straight from Review to saved, with no impact preview.** With no bookings yet nothing can be cancelled or re-priced, so the review shows the week only. | Batch 6 (the save preview, with S10's price-change warning) |
| SC-7 | **"Sign in again and save"** after the 15-minute limit asks the local token stub for a fresh sign-in; there is no password to enter. | The Cognito user pool existing |
| SC-8 | **The family's link and the coaches' copies are updated in-process.** On AWS, approving or declining raises `StudentChanged` and `consumer-student-link` updates the family's link; a family's contact change raises `FamilyChanged` and `consumer-family-sync` copies it to each coach. Locally each API's `LocalEventDispatcher` calls the same core service straight after the write. | Infrastructure code (Streams, the Pipe, the consumer Lambdas) |
| SC-9 | **Declining sends no email.** The dialog and the confirmation say the family is emailed, as designed, but locally the decline is only logged (without the address). | The notification batch (the decline message is in `FeatureDecriptions/Coach Dashboard on website.md`) |
| SC-10 | **The family's “Create account” stores no password.** The password rules and the matching confirm box are checked in the browser, then the local stand-in signs the family in with the email alone. | The Cognito user pool existing |
| SC-4 | **Nothing is deployed.** Outside the `local` profile `api-coach` and `api-client` have no table client, so they won't start. The coach-code lookup's rate limit (the Web Application Firewall) doesn't exist locally. | Choosing the infrastructure tool, AWS account and domain (Blockers 2, 22) |

### Gaps (left out)

| ID | What | Closed by |
|---|---|---|
| A1 | No profile photo upload; families see the coach's initials. Ruled 2026-11-06. | Phase 2 |
| A3 | No texts switch at sign-up. Ruled 2026-11-06: it's on the profile only, under Visibility & texts (G-3). | G-3 |
| G-1 | “Resend link” and “Change address” for a business email waiting to be confirmed. | Batch 14 |
| G-2 | Profile → Business email (the list of addresses). | Batch 14 |
| G-3 | Profile → Visibility & texts: show phone or email to families; text me on late cancellations. **Not built in Batch 3**, so an approved family sees the coach's payment types but never the phone or email: both start off and nothing switches them on yet. | Batch 16 (owner, 2026-11-09); the texts switch also waits on ADR-007 d8 |
| G-4 | Profile → Account: change password, log out through Cognito. | The Cognito user pool existing |
| G-5 | Sign-up steps 1–2 (create the account, verify the login email): Cognito owns them. | The Cognito user pool existing |
| G-6 | Today's lessons and stats, Lessons and Payments. | Batches 4–8 |
| G-8 | Time off and special schedules (the hub's second card is shown but not available). Nothing writes `SCHEDULE#DATE#` yet, though every read already honours it. | Batch 6 |
| G-9 | `sched-lesson-roller` isn't built: lesson times run to the window's end as it was at the last save, and nothing tops them up nightly. | A later batch, with the scheduled jobs |
| G-10 | A save leaves **booked** lesson times alone, even if the new week drops or re-prices them; the change-batch header, cancel and re-price lines and their emails come with the preview. | Batch 6 |
| G-11 | The calendars show who is booked only as “Booked”, and have no cancel buttons (Cancel, Cancel day, Cancel rest of week). | Batches 4 and 5 |
| G-12 | The schedule page doesn't show the latest change batch's progress (“Applying your changes…”). | Batch 6 |
| G-13 | Changing the time zone on the profile doesn't move lesson times already made. | Not yet placed; needs an owner ruling |
| G-7 | No warning before the 60-minute sign-in runs out; the next request asks the coach to sign in again. | A later batch, not yet placed in the plan |
| G-14 | Family sign-up step 3 (verify the email with a 6-digit code): Cognito owns it. The stepper shows it as done. | The Cognito user pool existing |
| G-15 | A family can't change its login email; Profile shows it read-only. | The Cognito user pool existing |
| G-16 | An approved family's Home has no booking: no *Book a lesson*, Today, Coming up or *Go to* card, and *Book a lesson* and *My bookings* are greyed in the menu. | Batch 4 |
| G-17 | Share codes aren't issued, so Profile shows none (`consumer-family-sync` issues them when a skater is created). | The shared-lessons batch |
| G-18 | Profile → *Add a skater* (with “None of my coaches yet”) and *Add a coach* (A9). | Batch 15 |
| G-19 | The coach's download of skater numbers for the rink. | Phase 2 (owner, 2026-11-09); the name is split when the file is made |

## Repository

| Path | What |
|---|---|
| `backend/` | Maven multi-module, Java 17: `core` (framework-free domain and DynamoDB access), `api-coach`, `api-client`, `consumers` |
| `web/` | React + TypeScript + Vite: the coach website, its rinkside page and the family website |
| `design/harbor/` | The Harbor screen designs, the source of truth for what each page looks like |
| `docs/` | Architecture, ADRs (Architecture Decision Records), glossary, runbooks |
| `docker-compose.yml` | DynamoDB Local for development |
