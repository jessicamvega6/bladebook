# BladeBook

Lesson scheduling for skating coaches and the families they teach. The design lives in `docs/`
(start with `docs/architecture.md` and `docs/adr/ADR-MASTER.md`). The build plan is
`AI/implementation-plan.md`.

**Where the build stands:** Batch 1 — the walking skeleton, the coach's business-details sign-up
step, Profile → Details and Payments, and the coach code. Everything runs on this computer only;
nothing is deployed.

## Running it locally

You need Docker, Java 17 and Node 24.

```sh
# 1. DynamoDB Local on localhost:8000 (data kept in a Docker volume)
docker compose up -d

# 2. api-coach on :8080, in the local profile (DynamoDB Local + the token stub)
cd backend
./mvnw -q install -DskipTests
java -jar api-coach/target/api-coach-0.1.0-SNAPSHOT.jar --spring.profiles.active=local

# 3. The websites on :5173, which pass /api/coach to :8080
cd web
npm install
npm run dev
```

Open **http://localhost:5173/coach/**. The first page is the local sign-in stand-in: type any
names and email. The same email always signs in as the same coach.

## Tests

```sh
cd backend && ./mvnw verify   # JUnit, ArchUnit and DynamoDB Local in Docker (Testcontainers)
cd web && npm test            # Vitest and Testing Library
```

## Gaps & shortcuts

What this build leaves out (**gaps**) or fakes (**shortcuts**). The coach website shows the
same list in its **Gaps & shortcuts** panel (`web/src/coach/gaps.ts`). Writing a gap down
doesn't count as building it.

### Shortcuts (faked for now)

| ID | What | Closed by |
|---|---|---|
| SC-1 | Signing in is a **local token stub**, not Amazon Cognito. It issues ID tokens with the `Coach` group and the coach app client, and the real checks (group, app client, 60-minute sign-in from `auth_time`) run against them. Sign-up steps 1–2 and Log in are one stand-in page. | The Cognito user pool existing |
| SC-2 | **“I’ve clicked the link”** marks a different business email confirmed at once. No email or link is sent. | Batch 14 (business-email confirmation) |
| SC-3 | Data is in **DynamoDB Local** through one unscoped client. The `coach-tenant` role, its session tags and the database gate aren't exercised; DynamoDB Local ignores IAM (Identity and Access Management). | Infrastructure code, then the gate tests on real AWS |
| SC-4 | **Nothing is deployed.** Outside the `local` profile `api-coach` has no table client, so it won't start. | Choosing the infrastructure tool, AWS account and domain (Blockers 2, 22) |

### Gaps (left out)

| ID | What | Closed by |
|---|---|---|
| A1 | No profile photo upload; families see the coach's initials. Ruled 2026-11-06. | Phase 2 |
| A3 | No texts switch at sign-up. Ruled 2026-11-06: it's on the profile only, under Visibility & texts (G-3). | G-3 |
| G-1 | “Resend link” and “Change address” for a business email waiting to be confirmed. | Batch 14 |
| G-2 | Profile → Business email (the list of addresses). | Batch 14 |
| G-3 | Profile → Visibility & texts: show phone or email to families; text me on late cancellations. | A later batch, not yet placed in the plan |
| G-4 | Profile → Account: change password, log out through Cognito. | The Cognito user pool existing |
| G-5 | Sign-up steps 1–2 (create the account, verify the login email): Cognito owns them. | The Cognito user pool existing |
| G-6 | Today's lessons and stats, Calendar, Schedule, Students, Lessons, Payments, and “Build your teaching week”. | Batches 2–8 |
| G-7 | No warning before the 60-minute sign-in runs out; the next request asks the coach to sign in again. | A later batch, not yet placed in the plan |

## Repository

| Path | What |
|---|---|
| `backend/` | Maven multi-module, Java 17: `core` (framework-free domain and DynamoDB access), `api-coach`, `api-client`, `consumers` |
| `web/` | React + TypeScript + Vite: the coach website, its rinkside page and the family website |
| `design/harbor/` | The Harbor screen designs, the source of truth for what each page looks like |
| `docs/` | Architecture, ADRs (Architecture Decision Records), glossary, runbooks |
| `docker-compose.yml` | DynamoDB Local for development |
