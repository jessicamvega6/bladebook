# BladeBook

Lesson scheduling for skating coaches and the families they teach. The design lives in `docs/`
(start with `docs/architecture.md` and `docs/adr/ADR-MASTER.md`). The build plan is
`AI/implementation-plan.md`.

**Where the build stands:** Batch 1 — the walking skeleton, the coach's business-details sign-up
step, Profile → Details and Payments, and the coach code. Batch 2 — the weekly schedule editor, the
lesson times it makes, and the coach's month, week and day calendars. Batch 3 — family sign-up with
coach codes, the waiting family's Home and Profile, and the coach's Students and Waiting for approval
tabs (approve, approve all, decline). Batch 4 — booking one lesson: the family picks a day, picks times
with one or more coaches, confirms and sees what was booked; the approved family's Home has Book a lesson,
Today and Coming up; the coach's calendars name who is booked. Batch 5 — cancelling one lesson: the
family's My bookings, with Cancel on each lesson; the coach cancels a lesson, a day or the rest of the week
from the calendar, releasing or holding each time. Batch 6 — time off and special schedules, and the review
before every schedule save: what it cancels and re-prices, a big price change to confirm, then the save status.
Batch 7 — the rinkside page online (today's lessons, Present / No-show, contact details on a tap, cancelling one
lesson) and the coach's Lessons page for correcting attendance. Batch 8 — the coach's Payments page: mark paid with how they paid, waive (final), undo paid. Batch 9 — repeating bookings: book a series, see it on My bookings and Home, and end it earlier, make it less frequent or
stop it. Batch 10 — the rinkside page with no signal: today kept on the phone, check-ins saved and sent when signal
returns, *Not sent*, the family-cancelled card, and logging out keeps what's waiting. Batch 15 — the family's Profile:
*Add a skater* (with *None of my coaches yet*) and *Add a coach*. Batch 16 — the coach's Profile → Visibility & texts:
show my phone and my business email to approved families. Everything runs on this computer only; nothing is
deployed.

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
| SC-1 | Signing in is a **local token stub**, not Amazon Cognito. `api-coach` issues ID tokens with the `Coach` group and the coach app client; `api-client` issues them with the `Client` group and the family app client. The real checks (group, app client, 60-minute sign-in from `auth_time`) run against them. The coach's sign-up steps 1–2 and Log in are one stand-in page; the family's Log in is a stand-in page with no password. | Batch 18 (real sign-in), on Batch 17's user pool |
| SC-2 | **“I’ve clicked the link”** marks a different business email confirmed at once. No email or link is sent. | Batch 14 (business-email confirmation) |
| SC-3 | Data is in **DynamoDB Local** through one unscoped client. The `coach-tenant`, `client-tenant` and `code-lookup` roles, their session tags and the database gate aren't exercised; DynamoDB Local ignores IAM (Identity and Access Management). The code still goes through the same doors (`AccessContext`, `ClientContext`, `LinkedCoach`), and a waiting family's code path reads nothing of the coach. | Batch 17 (infrastructure, then the gate tests on real AWS) |
| SC-5 | **A schedule save updates the lesson times in-process.** On AWS the save raises `ScheduleChanged` through DynamoDB Streams and EventBridge, and `consumer-schedule-change` does it; locally `LocalEventDispatcher` calls the same core service straight after the write. Since Batch 6 it also cancels and re-prices booked lessons through a change batch, with the lines planned first; nothing retries it, so a save that fails part-way isn't resumed (ADR-MASTER §9 resumes from the event's ID). Time off and special-schedule saves go the same way. | Batch 17 (Streams, the Pipe, the consumer Lambda) |
| SC-7 | **"Sign in again and save"** after the 15-minute limit asks the local token stub for a fresh sign-in; there is no password to enter. | Batch 18 (real sign-in), on Batch 17's user pool |
| SC-8 | **The family's link and the coaches' copies are updated in-process.** On AWS, approving or declining raises `StudentChanged` and `consumer-student-link` updates the family's link; a family's contact change raises `FamilyChanged` and `consumer-family-sync` copies it to each coach. Locally each API's `LocalEventDispatcher` calls the same core service straight after the write. Since Batch 11 `consumer-family-sync` also issues share codes: locally after sign-up and *Add a skater*, and, for a skater made before Batch 11, when the family's profile loads. | Batch 17 (Streams, the Pipe, the consumer Lambdas) |
| SC-10 | **The family's “Create account” stores no password.** The password rules and the matching confirm box are checked in the browser, then the local stand-in signs the family in with the email alone. Because the stand-in signs any email in, it then checks for an existing family and refuses the email on step 2, as Cognito's sign-up will. | Batch 18 (real sign-in), on Batch 17's user pool |
| SC-15 | **Contact-detail reveals are logged to the application log** (`bladebook.pii-access`: the coach, the skater, the surface), not to their own access-log group (ADR-012; ADR-MASTER §18). | Batch 17 (the access-log group) |
| SC-12 | **The family's never-linked failures go to the application log.** `ClientLinks` logs the family ID, the IDs asked for and the operation as a security event, but not to its own access-log group, and without the request ID or source address; the paging alarms (3 in 15 minutes, 10 in a day) don't exist. | Batch 17 (the access-log group and its alarms) |
| SC-14 | **A coach's cancel of more than one lesson is carried out as it goes.** `api-coach` writes the change-batch header `PLANNED`, then each lesson in its own transaction with its `CANCELLED#` lines already `EXECUTED`, then marks the header `EXECUTED`. ADR-MASTER §9 writes every line `PLANNED` first so a retry can resume; here a failure part-way leaves the header `PLANNED` with the lessons done so far, and nothing resumes it. | Batch 17 (the retried event that resumes a batch) |
| SC-16 | **`consumer-invite`'s copies are written in-process.** On AWS a shared lesson's change reaches `consumer-invite` through the stream, about a second later; locally `api-client` calls the same core service (`InviteSyncService`) straight after each write: the invited family's ID and GSI1 keys on an invited seat, and each seat's `partnerName`, `partnerStatus` and `choiceAnswerBy`. A coach's cancel needs none. | Batch 17 (Streams, the Pipe, the consumer Lambda) |
| SC-17 | **`sched-deadline-sweep` runs on a local timer**, on the hour, in `api-client`'s local profile, with `POST /api/client/local/sweep` (any signed-in family) to run it now. On AWS the Scheduler runs it hourly with the hour it's for. The pages never wait for it: *expired* and *Cancelled, no answer* come from the clock (B8). | Batch 17 (the Scheduler and the sweep's role) |
| SC-20 | **The table's stream is stood in for in-process.** On AWS every committed write reaches the event consumers through DynamoDB Streams, the Pipe and EventBridge. Locally the one DynamoDB client is wrapped (`LocalStream`): after each request (and after each local job or sweep), every item it wrote goes to `LocalStreamRouter`, which hands it to the consumers by its key: change-batch headers to the change notifier, seats to the booking confirmation, the payment reminder and `consumer-invite`'s emails, ended invitations and pending leaves to `consumer-invite`'s emails. Each consumer re-reads the item and checks its guard. The consumers are core services; their Lambda handlers in `consumers/` aren't written yet. | Batch 17 (Streams, the Pipe, EventBridge rules and the consumer Lambdas) |
| SC-21 | **Emails go to a local outbox, not SES.** Each API keeps the last 500 in memory, logs each one's template name (never the address), and lists them at `GET /api/coach/local/outbox` and `GET /api/client/local/outbox` (any signed-in user sees all of them). Emails from a family's own actions are in `api-client`'s outbox; the coach's, and the jobs', in `api-coach`'s. Each is the SES template's name plus its data, ready for `design/harbor/email/ses`; nothing is rendered locally. | Batch 17 (SES, its verified domain and the templates loaded) |
| SC-22 | **The 7am, Monday and nightly jobs run on a local timer** in `api-coach` (7:00 AM, Monday 8:00 AM and 2:30 AM, Central), with `POST /api/coach/local/jobs/day-reminder`, `/unpaid-reminder` and `/lesson-roller` (`?date=YYYY-MM-DD`, any signed-in coach) to run one now. The unpaid threshold is `bladebook.unpaid-reminder.threshold-days` (7) in the local settings, not Parameter Store. | Batch 17 (the Scheduler, the job Lambdas and Parameter Store) |
| SC-19 | **The share-check's access-log line goes to the application log** (`bladebook.access`), and its firewall rate limit doesn't exist locally (ADR-MASTER §§17–18). | Batch 17 (the access-log group and the Web Application Firewall) |
| SC-4 | **Nothing is deployed.** Outside the `local` profile `api-coach` and `api-client` have no table client, so they won't start. The coach-code lookup's rate limit (the Web Application Firewall) doesn't exist locally. | Batch 17 (CDK; Blockers 2, 22: tool, accounts and domain settled) |

### Gaps (left out)

| ID | What | Closed by |
|---|---|---|
| A1 | No profile photo upload; families see the coach's initials. Ruled 2026-11-06. | Phase 2 |
| A3 | No texts switch at sign-up. Ruled 2026-11-06: it's on the profile only, under Visibility & texts (G-3). | G-3 |
| G-1 | “Resend link” and “Change address” for a business email waiting to be confirmed. | Batch 14 |
| G-2 | Profile → Business email (the list of addresses). | Batch 14 |
| G-3 | Profile → Visibility & texts: the *Text me when a family cancels late* switch is shown off and can't be turned on. The two contact switches are built (Batch 16). | ADR-007 d8 |
| G-4 | Profile → Account: change password, log out through Cognito. | Batch 18 (real sign-in), on Batch 17's user pool |
| G-5 | Sign-up steps 1–2 (create the account, verify the login email): Cognito owns them. | Batch 18 (real sign-in), on Batch 17's user pool |
| G-6 | **Today's lessons and stats.** Today shows the coach code, new families and the rink card; its lessons list and the week, unpaid and waiting figures aren't built. Lessons (Batch 7) and Payments (Batch 8) are. | Batch 22 (owner, 2026-11-13: after Batch 14) |
| G-13 | Changing the time zone on the profile doesn't move lesson times already made. | Phase 3 (owner, 2026-11-12): changing the time zone; decided then |
| G-7 | No warning before the 60-minute sign-in runs out; the next request asks the coach to sign in again. | Batch 20 (owner, 2026-11-12) |
| G-14 | Family sign-up step 3 (verify the email with a 6-digit code): Cognito owns it. The stepper shows it as done. | Batch 18 (real sign-in), on Batch 17's user pool |
| G-15 | A family can't change its login email; Profile shows it read-only. | Batch 18 (real sign-in), on Batch 17's user pool |
| G-19 | The coach's download of skater numbers for the rink. | Phase 2 (owner, 2026-11-09); the name is split when the file is made |
| G-20 | **Two parts of repeating bookings aren't built.** A key seen again with a different request isn't refused, and nothing asks about a series an earlier attempt booked that a resubmission drops (ADR-MASTER §7; ADR-006 d4b). The coach's day view says how often a series repeats as it was booked; a family's later *Make it less frequent* isn't reflected there, as the coach can't read the family's header. | Batch 24 (owner, 2026-11-13) |
| G-22 | **No clash warning across coaches** (ADR-025 d5). A time that overlaps the skater's lesson or pick with another coach isn't marked, and the confirm pop-up lists no clashes. | Batch 19 (owner, 2026-11-12) |
| G-26 | **ADR-022's read allowlist doesn't list the lesson-time and seat attributes yet** (its own note says it fails closed until written). The family path reads only `lessonDate`, `startTime`, `startsAtUtc`, `coachTz`, `durationMinutes`, `priceMinor`, `currency`, `lessonStatus`, `shareCount`, `joinOrder`, `blockSeq` and `requiredNoticeHours` on `LESSON#` items; on its own seat, `idempotencyKey` and (to cancel it) `lessonDate`, `startTime`, `studentId`, `clientId`, `studentName`, `seatStatus`, `startsAtUtc`, `coachTz`, `durationMinutes` and `joinedAt`; and `coachTimezone` and `requiredNoticeHours` on the profile. Its cancel writes a `CHANGEBATCH#` header and a `CANCELLED#` line in the coach's partition. **Shared lessons (Batch 11) add**, on `LESSON#`: `maxSkaters` (read only to say a time can be shared) and `seatsTaken`; on its own seat: `inviteId`, `invitedStudentId`, `invitedByClientId`, `invitedByName`, `partnerName`, `partnerStatus`, `choiceAnswerBy` and `freedPlace`; a `SKATERCODE#` item's `studentId` and `studentName`; and that coach's `STUDENT#<studentId>` projecting `studentStatus` (the share-check). Writes: another skater's `SEAT#` key (the invited seat, `INVITED`, no `clientId`), accepting or declining a seat whose `invitedClientId` is the family, withdrawing one whose `invitedByClientId` is the family, `SEATEND#` records, a lesson time's `pendingLeave` and GSI4 keys, and a `ConditionCheck` on `STUDENT#` (ADR-033). Owner, 2026-11-12: built locally, listed until the gate tests pass. | Batch 17, before the gate tests on real AWS |
| G-28 | **The rinkside Week tab isn't built** (it's shown disabled): the week's lessons, the cancel on each, *Cancel rest of week* (S8) and the tab with no signal (R5). Batch 7 built the cancel on each lesson in Today's list. | Batch 23 (owner, 2026-11-13: after Batch 14) |
| G-30 | **Time off can't be edited.** As drawn, the hub has *Edit* on a special schedule only. Both can be deleted (owner, 2026-11-12). | Batch 21 (owner, 2026-11-12: add Edit to time off) |
| G-31 | **The schedule review doesn't say when skaters per lesson changes** (*"Lessons already booked keep their current setting"*): the evaluator leaves booked lessons' skater count alone (owner, 2026-11-12) and nothing reports the change. | Not planned: left as it is (owner, 2026-11-12) |
| G-29 | **Nothing shows a cancellation afterwards.** The `CANCELLED#` lines and change-batch headers are written, but no page lists them: the coach's Lessons page lists lessons that happened, as drawn, and a family's own cancellation history is Phase 2 (owner, 2026-10-12). | Phase 2, the coach's view and the family's (owner, 2026-11-12) |
| G-32 | **Two parts of the rinkside page's offline behaviour aren't built.** The page doesn't say when Safari has cleared its offline copy (ADR-014 amendment of 2026-10-13; the design has no screen for it, and a cleared page can't tell a first visit from a cleared one). Nothing has been tried on a real iPhone at a rink: the copy of the page was checked in headless Chrome with the network cut, and the queue, *Not sent* and the family-cancelled card in tests. The page fills the phone's screen; the design's device frame and status bar are the demo's drawing of a phone. | Batch 25 (owner, 2026-11-13); the iPhone check after Batch 17 |

## Repository

| Path | What |
|---|---|
| `backend/` | Maven multi-module, Java 17: `core` (framework-free domain and DynamoDB access), `api-coach`, `api-client`, `consumers` |
| `web/` | React + TypeScript + Vite: the coach website, its rinkside page and the family website |
| `design/harbor/` | The Harbor screen designs, the source of truth for what each page looks like |
| `docs/` | Architecture, ADRs (Architecture Decision Records), glossary, runbooks |
| `docker-compose.yml` | DynamoDB Local for development |
