# BladeBook Design Rationale

**As of:** ~~2026-10-12~~ ~~2026-10-13~~ ~~2026-10-20~~ 2026-10-24 · **Current through:** ~~ADR-030~~ ~~ADR-031~~ ADR-033 *(booking entries only)*

Every part of BladeBook, what it does, why it was chosen, and what was turned down. This is the *why* in one place. `architecture.md` describes the *what* in full, and each entry ends with the ADR that holds the complete reasoning.

Where this document and an ADR disagree, the ADR wins.

---

## The shape of the system

BladeBook is a **modular monolith in code**, **deployed as serverless functions** on AWS, wired together **by events**, with **one API per frontend** split for security. One codebase and one shared domain module (`core/`) hold the business logic; seventeen Lambda functions run it; a single DynamoDB table stores everything; changes to that table drive notifications, cancellations and archiving. Idle cost is about **$22–34 a month** for production, the only long-running environment; a dev environment costs only for the hours it is up.

## What drives the choices

- **One developer, for years.** The cost that compounds is time stuck on a problem with nobody to ask. Choices favour well-documented, widely used tools and managed services over clever ones.
- **Some students are children.** Security and data minimisation set the floor for every decision: least privilege per function, logged access to personal data, masked dev data, and retention that ends.
- **Pay for use, not for idle.** No always-on servers, load balancers or NAT gateways. What the bill holds is mostly fixed fees for security and messaging features, chosen deliberately.
- **Failures that raise no error are the dangerous ones.** A family not told about a cancellation, or a job that silently didn't run, is worse than a visible error. Much of the design exists to make those failures impossible or loud.

---

## Compute and code

### AWS Lambda, Java 25, arm64

**What it is.** Every piece of backend code runs as a Lambda function on AWS's managed `java25` runtime, on ARM processors.

**Why.** Pay-per-use with no servers to run, and AWS patches the Java runtime itself — on a system holding children's data, who patches the JVM is a first-order question. Java is the language the owner knows.

**Turned down:**
- *A VPS or containers* — Costs money while idle, and the operating system and runtime become yours to patch.
- *GraalVM native images* — Faster starts, but every security patch becomes a rebuild-and-redeploy chore for one person.
- *Lambda Managed Instances* — Removes cold starts but is billed per instance; only cheaper above ~9 requests a second.

*Full reasoning:* ADR-001 decisions 1, 4; A1

### Spring Boot 4 for the APIs, plain handlers elsewhere, a framework-free core

**What it is.** The two API functions use Spring Boot 4. The background consumers and scheduled jobs are plain Lambda handlers. All business logic lives in `core/`, which has no framework code at all.

**Why.** Spring has the deepest ecosystem and the best AI-assistance support, which matters most when the framework is new to you. Keeping `core/` framework-free makes a framework swap a change to thin controllers, not a rewrite. An ArchUnit rule enforces the boundary.

**Turned down:**
- *Quarkus* — Close on performance, but a much smaller ecosystem.
- *Micronaut* — No published end-of-life policy: forced upgrades on someone else's timetable.
- *SnapStart* — Withdrawn once cold-start latency stopped being a design constraint (A1); it brought many production-only sharp edges.

*Full reasoning:* ADR-001 decision 1; A1, A2

### Seventeen functions, split by who calls and what they may touch

**What it is.** Two APIs (coach and client), seven event consumers, six scheduled jobs, one archiver and one sign-up trigger that gives a new account its group (ADR-023 d10) — each with its own narrow Identity and Access Management (IAM) role. The two APIs hold no database permissions of their own: on each request they take on a role limited to the signed-in coach's or family's own records.

**Why.** One role per function is the security model's core: a defect in one function can only do what that function's role allows. The APIs split on trust boundaries — coach and family — not on routes. The per-request roles go further: DynamoDB itself refuses a read or write outside the caller's own records, so a bug in the application's own checks can't expose another coach's or family's data. The rinkside page runs in the coach API; a phone left signed in at the rink is guarded by requiring a recent sign-in before a schedule save, not by a function of its own.

**Turned down:**
- *One API function for everything* — Its role would have to allow everything any route does.
- *A function per route* — More deploys and more roles, with no security boundary gained.
- *A third API for the rinkside page* (ADR-014 d11, reversed) — Its role only protected a phone that was almost always signed in to the coach website as well.

*Full reasoning:* ADR-001 A5, A6, A8, A9; ADR-021; ADR-022; ADR-023; ADR-025; ADR-026

### Monorepo

**What it is.** `backend/` (Maven), `web/` (React) and `infra/` in one repository.

**Why.** One change can span a schema, its handler, its permission and its UI. The coach and family websites share theme tokens, slot logic and the API client without publishing packages.

**Turned down:**
- *Separate repositories* — Every shared piece becomes a versioned package that can drift.

*Full reasoning:* ADR-001 decision 3; A3

### Infrastructure as code — undecided

**What it is.** AWS CDK in TypeScript or Terraform. The choice is open, to be made against criteria written in advance (ADR-001 A4).

**Why.** The original decision never actually compared Terraform, and switching is free only until infrastructure exists. The deciding gate is whether least-privilege rules can be enforced as a build check.

*Full reasoning:* ADR-001 decision 2; A4

---

## Edge, sign-in and API

### Cognito, one sign-in for the coach website and rinkside

**What it is.** One user pool holds every coach and family account, with two app clients: one for the coach website, rinkside page included, and one for the family website. Each API takes only its own app client's tokens and its own group (`Coach` or `Client`), refusing others with 403. The rinkside check-in page is part of the coach website and uses its sign-in. Saving a schedule change needs a sign-in from the last 15 minutes.

**Why.** Managed sign-in is free at this scale. A separate rinkside sign-in only protected a phone that wasn't also signed in to the website, which for a web page on the coach's own phone it almost always is. Asking for the password before a schedule save guards the most destructive action on every device. A family app client of its own keeps each site's sign-in return addresses and token lifetime separate, and either side can be turned off alone.

**Turned down:**
- *A separate rinkside account* — Two passwords for one coach, with no security gained.
- *A separate rinkside app client* (ADR-014 d10, reversed) — Needed a custom Lambda authorizer on a REST API, for protection the website on the same phone undermines.

*Full reasoning:* ADR-023; ADR-014 decision 10; ADR-016

### Self-serve coach sign-up, recovery owned by Cognito

**What it is.** Anyone can create a coach account; the login email must be verified; password recovery is Cognito's one-time code.

**Why.** A fraudulent coach account is empty: student data only arrives when a family enters a code handed over in person, and the coach must then confirm them. A shared-lesson invitation reaches only a skater the coach already accepted (ADR-033). Knowledge-based recovery would have been an account-takeover path.

**Turned down:**
- *An EIN gate* — Can't be validated without a paid vendor, and excludes Canada.
- *A custom forgot-password form* — Name and business ID are discoverable — a takeover path.

*Full reasoning:* ADR-016 decisions 1–4, 9; ADR-033

### API Gateway (REST) with a Cognito authorizer

**What it is.** The browser calls API Gateway directly with the user's token; API Gateway checks the token before any function runs.

**Why.** A REST API is the only API Gateway type a Web Application Firewall can attach to. At this volume its higher per-request price is cents.

**Turned down:**
- *HTTP API* — Cheaper, but cannot take a WAF.
- *HTTP API behind CloudFront with the WAF there* — Needs secret-header plumbing so nothing bypasses it, and leaves Cognito sign-up unprotected.

*Full reasoning:* ADR-019; ADR-001 A7

### Web Application Firewall on the API and Cognito

**What it is.** AWS managed rules plus per-address rate limits: 1,000 per 5 minutes overall, 20 for client sign-up and the coach-code and share-code lookups, including the share-check (one rule; ADR-026 d4, ADR-033), 10 for Cognito sign-up and sign-in.

**Why.** Several routes are reachable before sign-in, and the coach-code lookup can be enumerated. It is the only per-address rate limit available. Production counts for two weeks after launch before blocking, so a misfiring rule can't lock out a real coach.

**Turned down:**
- *No WAF* — Leaves code-guessing and sign-up floods to the application.
- *Cloudflare's free tier* — Cheaper, but reopens the bypass problem and can't easily cover Cognito.

*Full reasoning:* ADR-019 decisions 1–4b

---

## Frontends

### React and TypeScript, two sites, on S3 and CloudFront

**What it is.** One source tree builds the coach website and the family website. The rinkside check-in page is part of the coach website at `/coach/rinkside`, built as its own entry point.

**Why.** Cheap static hosting and a clean split from the backend. Its own entry point means the phone at the rink never downloads the schedule editor, and its service worker caches only that page.

**Turned down:**
- *One bundle with three routes* — The phone at the rink would carry the whole coach website.
- *Rinkside as a separate site or subdomain* (ADR-001 A3, reversed) — Separation the shared sign-in made pointless, for extra deploy, DNS and CORS work.
- *A native app* — App-store accounts, review on every release and yearly upkeep, to gain background sending on iPhones.

*Full reasoning:* ADR-023; ADR-001 A3

### The rinkside app works offline

**What it is.** A service worker caches the app and today's lessons. Check-ins are queued on the phone and sent when signal returns — in the background on Android and Chrome, on next open on iPhone.

**Why.** Rinks often have no signal, and check-in fails in front of a student. A check-in carries the phone's time, accepted whenever it arrives as long as it fits the lesson's window, which catches a wrong clock.

**Turned down:**
- *A 24-hour age limit* — Rejected accurate check-ins from a phone offline for two days while letting a wrong clock through.

*Full reasoning:* ADR-014 decisions 1–5a

### Guardian contacts fetched only with signal

**What it is.** Contact details are fetched when the coach taps a student, shown once, and never stored on the phone.

**Why.** With no signal to fetch the number there is no signal to call it either, so caching it gave little — and a phone at a public rink then holds no guardian contacts, with every look logged as it happens.

**Turned down:**
- *Caching contacts for the day* — Exposure on a lost phone, and reads that reached the access log late or never.

*Full reasoning:* ADR-014 decision 9b

---

## Data

### DynamoDB, one table, on-demand

**What it is.** Every entity lives in one table, keyed by coach or client, with ~~three~~ *four* indexes: by client, by date (cross-coach, scheduled jobs only) ~~and~~ a sparse unpaid-lessons index *and a sparse deadlines index for the hourly sweep (added 2026-10-13, ADR-031 decision 12)*.

**Why.** No VPC and so no ~$32 NAT gateway; pay per request; one query returns related items together. Keys are designed around the questions the app asks.

**Turned down:**
- *Postgres in a VPC* — ~$20–45 a month idle before any traffic.
- *A table per entity* — Doubles every permission, encryption and backup setting with nothing gained.

*Full reasoning:* architecture §2, §5; ADR-002 decision 6

### ~~Availability is calculated; the booking is the lock~~

*Superseded 2026-10-13 by ADR-031; see "Lessons and seats" below.*

~~**What it is.** Open slots are worked out from the coach's schedule minus existing bookings. Booking a slot is a conditional write of the booking record itself.~~

~~**Why.** A schedule change is one write, never hundreds, and two families racing for one slot can't both win — with no transaction and no slot records to keep consistent.~~

~~**Turned down:**~~
~~- *Stored availability slots* — Every schedule change regenerates them, and they can disagree with bookings.~~

~~*Full reasoning:* ADR-004 decisions 1–2~~

### Lessons and seats

*Added 2026-10-13 (ADR-031).*

**What it is.** Every bookable time is stored as a **lesson time**, made from the schedule about 15 months ahead by a nightly job. Each skater in a lesson has a **seat**: a private lesson has one, a shared lesson two. Booking changes the lesson time and adds the seat in one step. An invited skater's seat holds their place at once. When a skater leaves a shared lesson in time, the other family chooses to keep it at the full price or cancel with no charge; an hourly sweep acts on anything left unanswered, and on the other deadlines. Revised the same day: no family's action writes another family's records, except answering an invitation addressed to their own skater; the price lives only on the lesson time; `consumer-invite` only copies; ADR-024 needs no other exception. *Amended 2026-10-20 (ADR-033):* only a skater the coach has accepted can be invited or added as a sibling, checked by the database in the booking transaction and by a share-check endpoint at the share step; no seat waits for the coach, and the sweep has two deadlines (expiry and answer-by).

**Why.** Private and shared lessons follow one path, so sharing stops being special cases added to a private booking. Either family can leave by the same rules, because neither owns the lesson. A booking and a schedule save change the same record, so a booking can't land on a time the new schedule removed. Retry checks read the family's own seat directly.

**Turned down:**
- *A relational database (Postgres)* — Capacity and uniqueness would be plain constraints, but it costs about $12–15 a month always on, or about 15 seconds to wake. Every rule here fits one DynamoDB transaction.
- *Keep computing availability* — Less to keep in step, but double-booking and the schedule-save race each need their own lock.
- *Rolling series* (a job books a few weeks ahead) — A family could lose a date long after booking.
- *One-off timers* (EventBridge Scheduler) instead of a sweep — Every seat change must move timers, a failed create loses a deadline, and nothing here needs better than an hour.
- *A consent link that joins a new skater to the coach's roster* (ADR-026 d5) — Most of the shared-lesson complexity, and it let a stranger with a share code reach a child's details. Phase 2 (ADR-033).

*Full reasoning:* ADR-031; ADR-033

### No booking horizon; recurrences written at booking time

**What it is.** ~~Any date the schedule produces is bookable.~~ *Changed 2026-10-13 (ADR-031 decision 3): each picked date must be inside the three months the booking page shows, and the system checks it. A series is checked on its first date only; its later dates can run past the window up to the end date.* A recurring booking writes every lesson up front — every 1–4 weeks, up to 12 months — plus a header describing the arrangement.

**Why.** Families with a standing slot book once instead of weekly. The header exists because the current frequency can't be recovered from the lessons once one is cancelled by hand. A failed booking repairs itself.

**Turned down:**
- *A 7-day rolling horizon* — Made every family re-book weekly.
- *A generator that books future weeks on a schedule* — Machinery to feed a horizon that no longer exists.

*Full reasoning:* ADR-005; ADR-006 decisions 1, 4, 4a, 4b; ADR-031 decision 3

### Attribute names avoid DynamoDB reserved words

**What it is.** No attribute is called `status`, `date`, `name`, `start`, `end`, `source` or `timezone`; each has a specific name such as `bookingStatus` or `lessonDate`.

**Why.** A reserved word must be aliased in every expression, and forgetting fails at runtime. Specific names also say which status or date is meant.

**Turned down:**
- *Keep the names and alias everything* — Works, but leaves a trap for every new expression.

*Full reasoning:* architecture §5

---

## Events and processing

### Change data capture: Streams to EventBridge

**What it is.** Events come from committed database writes, through DynamoDB Streams and an EventBridge Pipe to a bus; consumers react to them.

**Why.** An event can never describe a write that didn't happen, and a write can never happen without its event — no dual-write problem.

**Turned down:**
- *Publishing events from the API after writing* — A crash between the two leaves them disagreeing.

*Full reasoning:* architecture §6; ADR-010 decision 5e

### Schedule changes: preview, then a crash-safe background plan

**What it is.** The coach sees what a change will cancel and re-price before accepting. A background consumer then writes its whole plan, carries out each record in its own transaction, and notifies families once the batch finishes. If a family books between preview and save, the save still goes ahead and that booking is cancelled with the rest (ADR-008); a separate "just booked" email is Phase 2.

**Why.** A schedule change can cancel a year of lessons. The plan survives a crash; keys come from the event so a retry resumes rather than restarts; each record is re-checked against the current schedule before acting.

**Turned down:**
- *Doing it inside the coach's request* — Times out halfway on large changes.
- *Notifying per record* — Families told before their lesson is cancelled, or in fragments.

*Full reasoning:* ADR-006 decision 7; ADR-008 decision 8; ADR-010 decisions 5a–5l

### Upcoming lessons follow the current price

**What it is.** When a coach changes a price, upcoming bookings are re-priced and families told. Increases skip lessons inside the notice period; decreases apply at once.

**Why.** Otherwise a rate rise reaches nothing booked months ahead, and early bookers pay differently. Future lessons are never paid yet, so re-pricing needs no refunds.

**Turned down:**
- *Prices locked at booking* — Kept for past and settled lessons only.

*Full reasoning:* ADR-020

### Recovery: reconcile, don't replay

**What it is.** A failed schedule change pages the owner, who runs `reconcile-schedule` for that coach: it finishes stuck batches, then fixes anything else that doesn't match. A nightly read-only check alerts on drift.

**Why.** A lost event leaves nothing to retry; comparing current schedule and bookings needs only the table. The nightly check is the only thing that catches a silent loss.

**Turned down:**
- *Replaying the dead-letter message* — Can act on a stale plan.

*Full reasoning:* ADR-010 decisions 5j–5k, 2a; runbooks/reconcile-schedule.md

---

## Cancellation, payments and attendance

### One record shape for every cancellation

**What it is.** Client, coach and schedule-change cancellations all write a change batch with one record per lesson. A coach can hold a freed slot so it can't be rebooked.

**Why.** One message per family per batch, a full audit of who cancelled what, and one notifier for every case. ~~A held slot is just a booking with no student, so the existing lock and indexes handle it.~~ *Changed 2026-10-13 (ADR-031 decision 1): a held slot is a held lesson time, with no seats, so families see it as taken.*

**Turned down:**
- *A rescheduling operation* — Rebook-then-cancel covers it without new machinery.
- *A separate blocked-slot record* — Availability and the lock would both need a second check.

*Full reasoning:* ADR-009; ADR-031

### Payment tracking, not payment processing

**What it is.** Prices are integers in cents, stamped on ~~bookings~~ *lesson times; each skater's share is worked out from the lesson's price (`priceMinor ÷ shareCount`); nothing is stored on the seat; odd cents go to the skaters who joined first (changed 2026-10-13, ADR-031 decision 7)*. Coaches mark lessons paid or waived; families get a reminder with the amount and the coach's payment instructions.

**Why.** No payment processor means no card-data scope, no webhooks and no refunds in MVP. A weekly email tells the coach about lessons left unpaid too long.

**Turned down:**
- *In-app payments in MVP* — Brings refunds and credits the model can't express — Phase 2.

*Full reasoning:* ADR-003; ADR-018

### One missed-lesson fee

**What it is.** A no-show and a client's own late cancellation carry the same fee, set per schedule block. The charge starts in Phase 2.

**Why.** Charging only late cancellations would make not turning up the cheaper option.

**Turned down:**
- *Separate rules for no-shows and late cancellations* — Reopens that loophole.

*Full reasoning:* ADR-015

---

## Messaging

### Email always, texts by opt-in

*Client texts are Phase 2 (ADR-007, amended 2026-10-12). In MVP the only text is the coach's late-cancellation alert.*

**What it is.** Every family gets email through SES, with replies going to the coach. Texts through SNS are opt-in per phone number, one 160-character segment, pointing at the email.

**Why.** Email carries the full record cheaply. A text is a pointer: one segment keeps cost fixed and avoids split messages, and no free text keeps payment instructions out of it.

**Turned down:**
- *Texts carrying full details* — Split, mis-ordered or truncated messages, and per-segment billing.

*Full reasoning:* ADR-007; ADR-016 decision 8

### Messages name the coach

**What it is.** Family texts (Phase 2) start `<Coach name> via BladeBook:`. A coach can opt in to a text when a family cancels inside the coach's notice period.

**Why.** Families know their coach, not the software. Coaches at a rink read texts, not email.

*Full reasoning:* ADR-007 decision 5a; ADR-009 decision 9

---

## Reliability

### Tolerance set per path

**What it is.** Cancellation notices and the 7am reminder page the owner; booking, check-in and the report are morning reads.

**Why.** The paths that page are the ones where the person harmed isn't the person who sees the failure.

**Turned down:**
- *One uptime target* — Too strict for the report and too loose for cancellations.
- *Multi-region* — The worst failure is a wasted trip to a rink.

*Full reasoning:* ADR-010 decision 1

### Guards, dead-letter queues and dead man's switches

**What it is.** Every consumer has a duplicate-send guard and a dead-letter queue with a stated replay policy (the two scheduled jobs from ADR-031 have none, by design). Scheduled jobs alarm when they *don't* run. Alerts go by text to the owner.

**Why.** Retries must be safe, and a job that silently doesn't fire produces no error to alarm on. Alerting through email would fail exactly when email is the problem.

*Full reasoning:* ADR-010 decisions 2, 2a, 4

### Point-in-Time Recovery and deletion protection

**What it is.** The table can be restored to any second in the last 35 days, and can't be deleted by a stray deploy.

**Why.** There is a consumer whose job is deleting bookings in bulk; nothing else could recover a term destroyed by a wrong rule. A monthly export to S3, kept 12 months, covers corruption noticed after the 35 days (ADR-010, 2026-10-12).

*Full reasoning:* ADR-010 decision 7

---

## Privacy and retention

### Tenant isolation from the token

**What it is.** Every key is built from the identity in the verified token, never from the request. The one check that isn't structural — a client writing into the coach's partition, which the database confines to the right coach but not the right family — is enforced by a type only `core.data` can create (ADR-024) and tested.

**Why.** A coach structurally cannot query another coach's partition.

*Full reasoning:* architecture §7; ADR-002

### Every read of personal data is logged

**What it is.** Repository methods that return personal data require an `AccessContext` naming who is asking; scheduled jobs log one line per run; CloudTrail covers reads that bypass the app.

**Why.** "Who saw this child's record" must be answerable. The compiler makes the unlogged path impossible to write.

**Turned down:**
- *CloudTrail alone* — It sees the function's role, never the person.

*Full reasoning:* ADR-012

### Retention ends: TTL, an archive, deep storage

**What it is.** Items expire through DynamoDB TTL; each is copied to an archive bucket first, which moves to Glacier Deep Archive after 30 days. Unpaid lessons never expire.

**Why.** Keeping children's history forever in the live table is a retention decision made by default. Deep storage adds friction: archived data can only be read through a deliberate restore.

**Turned down:**
- *Keeping everything* — Grows the compliance surface without limit.

*Full reasoning:* ADR-017

### AWS-managed encryption keys

**What it is.** The table and buckets use AWS-managed keys.

**Why.** Encrypted and logged at no monthly cost. Customer-managed keys return if crypto-shredding is chosen for deletion requests.

*Full reasoning:* architecture §7

---

## Environments and testing

### Dev: built on demand, destroyed when done

**What it is.** Production is the only long-running environment. A dev stack is built from the same infrastructure code when there is work for it and destroyed afterwards. Its table is created from one import file when it's built: seed data by default, or a masked subset of production — chosen coaches and clients, remapped onto test accounts — only on request, never both. Its WAF and alarms are off by default. The scheduled canary runs against production as a dedicated test coach and family. A masked build is prepared by an AWS Step Functions workflow: export, mask in a transform Lambda, write the masked file; the table is created from it, then scanned. Both buckets delete their contents after 24 hours.

**Why.** The bulk-cancellation code needs realistic data before it touches a real term — but a copy of production is a copy of children's data. Masking happens in the pipeline and checks itself. Building dev only when needed costs nothing between uses, can't drift from production, and means masked data exists only while it's being used. Tearing it down is a purge, so it waits until any scanner finding is triaged, and dev's access logs are kept outside the stack.

**Turned down:**
- *A long-running staging environment* (ADR-011 d1, superseded) — Costs every month for occasional use, and drifts from production unless refreshed.
- *Test data only, never production data* — Simpler and safer, but loses reproducing an incident against a masked copy of a real coach's data.
- *A full, unmapped copy* — Data no dev login can reach, and a larger exposure.

*Full reasoning:* ADR-027; ADR-028; ADR-011

### Every feature has automated tests

**What it is.** JUnit with DynamoDB Local, Vitest with React Testing Library, two Playwright journeys, a shared fixture for logic that exists in both Java and TypeScript, and mutation testing on `core/`.

**Why.** A presence rule and mutation testing measure whether tests can catch a bug; a coverage percentage only measures execution.

**Turned down:**
- *A coverage threshold* — Rewards tests that assert nothing.

*Full reasoning:* ADR-013

---

## What it costs

| Item | Idle, per month |
|---|---|
| Compute, database, API, email, events | $2–6 |
| WAF | ~$12 |
| SMS number and carrier fees (coach alerts only in MVP) | $3–12 |
| Alarms, domain and DNS | ~$4 |
| Production canary's credentials (Secrets Manager) | ~$0.40 |
| Dev environment, most months (built only when needed) | ~$0.50 (its DNS zone) |
| A masked dev build (after launch, on request) | a cent or two per build |

The architecture itself is close to free when idle. Most of the bill is fixed fees for security and messaging features, chosen deliberately. Details: architecture §12.

## Still open

Still undecided: CDK or Terraform; how deletion requests work (Phase 2, owner 2026-10-20); the SMS number type; the product's final name; several questions waiting on a coach or the legal review. All are tracked in `Open-Pending.md`.
