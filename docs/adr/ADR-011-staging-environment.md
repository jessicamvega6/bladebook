# ADR-011: Staging Environment and Production Data Masking

## Status

**Accepted** — 2026-08-28.

Reverses **ADR-001**'s implicit "there is no staging environment," and supersedes the
**"No staging environment"** line under ADR-010's *Explicitly not doing*.

Extends `architecture.md` §7's child-data obligations to a second environment.

**Amended — 2026-09-29.** Brought in line with two later ADRs. Decision **3**'s coach row
follows the profile [ADR-016](ADR-016-coach-signup.md) defined, and the `CODE#` lookup item
is masked with it. Decision **6c**'s containment disables **both** staging Cognito app
clients, since [ADR-014](ADR-014-check-in-app-and-offline-capture.md) decision 10 gave the
check-in app its own.

**Amended again — 2026-09-29.** Settles the two questions the first amendment left open.
Decision **8**: staging holds a **subset** of production — coaches and clients named on
each run — remapped onto fixed staging test accounts so the copied data can be used through
the app. Decision **9**: profile photos are replaced with one placeholder. Decision 7's
refresh log gains the subset, the export time and a reason.

**Amended — 2026-10-05.** [ADR-023](ADR-023-rinkside-check-in-joins-the-coach-website.md)
removes the check-in app's own Cognito app client, so decision **6c**'s containment disables
the coach website's app client (and the family website's, if it has its own). There is no
`api-checkin`.

**Amended — 2026-10-06.** [ADR-025](ADR-025-many-coaches-per-skater.md): a client can have several coaches, so naming a client in
decision **8a** brings in **all** their coaches.

**Partly superseded — 2026-10-07** by [ADR-027](ADR-027-on-demand-dev-environment.md). There is **no long-running staging
environment**: production is the only one, and a **dev** stack is built when needed and
destroyed afterwards. Superseded: decision **1** (a permanent second stack), **7a** (refresh
cadence; staging subdomains, now `dev.<domain>`), **8a**'s default coach list (coaches are
named on every load) and **8c**'s accounts kept across refreshes (they are created with each
stack). Every masking rule — decisions 2–6c, 7, 8b, 8d–8f and 9 — **carries over to dev
unchanged**; read "staging" as "dev" and "refresh" as "load". Tearing dev down is a purge, so
it waits for triage (ADR-027 decision 4).

**Amended — 2026-10-09.** [ADR-027](ADR-027-on-demand-dev-environment.md) decision 9: each load is
an AWS Step Functions workflow. Decision 6a's checks, its fresh-export restart and 6b's after-load
scan (run whether the load succeeds or fails) are its steps. Its run history and CloudTrail cover
most of decision 7's log.

---

## Context

There is one thing about to be built that no unit test can cover: a consumer whose job is to
**delete bookings in bulk** (ADR-006 decision 5, redesigned in ADR-010 decision 5). Nothing
currently allows it to be observed behaving correctly against realistic data before it runs
against a coach's real term.

The architecture makes a second environment unusually cheap — pay-per-use throughout, no
always-on infrastructure, so a duplicate stack costs a few dollars a month at most.

The expensive part is not the environment. It is that **a copy of production is a copy of
children's data**, and §7 commits to handling that carefully.

---

## Decision

### 1. There is a staging environment

*Superseded 2026-10-07 by [ADR-027](ADR-027-on-demand-dev-environment.md) decision 1: dev is built on demand and destroyed afterwards.*

A full second stack: its own DynamoDB table, Lambda functions, API Gateway, Cognito user
pool, EventBridge bus and Scheduler, S3 buckets and CloudFront distribution.

The Cloud Development Kit (CDK) app becomes environment-parameterised, with stack names and
resource names carrying the environment. The React build takes its Cognito pool identifier
and Application Programming Interface (API) endpoint from environment-aware configuration
rather than constants.

### 2. Staging is loaded from production, and the data is masked before it arrives

**Masking happens in the pipeline, never in staging.** The sequence is:

```
DynamoDB export (production) → S3 → masking transform → DynamoDB import (staging)
```

An unmasked row must never exist in a staging-accessible table, not even briefly. "We mask
it right after loading" is not this decision — a table that held real children's data for
ninety seconds held it.

The same applies to the S3 reports bucket, which holds per-student attendance: staging gets
masked reports or no reports.

### 3. What gets replaced

Every field below, wherever it appears — including the copies the model denormalises:

| Item | Fields |
|---|---|
| `STUDENT#` | `studentName`, `clientName`, `clientEmail`, `clientPhone` |
| `CLIENT#…/PROFILE` | `clientName`, `clientEmail`, `clientPhone` |
| `CLIENT#…/STUDENT#…` | `studentName` |
| `CANCELLED#` lines | `studentName` |
| `COACH#…/PROFILE` | `firstName`, `lastName`, `loginEmail`, `businessEmail`, `phone`, `paymentInstructions`, `cashappHandle`, `venmoHandle`, `paypalHandle`, `coachCode` — *amended 2026-09-29 to ADR-016's profile; was `name`, `email`, `paymentInstructions`, `coachCode`* |
| `CODE#<coachCode>` lookup | the code in the **key**, rewritten to the same masked code as the profile — *added 2026-09-29* |
| S3 daily reports | student names throughout |

`paymentInstructions` is free text a coach typed and ADR-003 decision 6 already treats it as
personally identifiable information (PII)-adjacent — in practice it contains phone numbers
and payment handles. It is replaced wholesale, not scrubbed.

`coachCode` is not PII but it is a **shared secret** that grants candidacy to a coach's
roster (ADR-002 decision 2). A production code must not exist in a lower environment.

**The code also appears in a key**, as `PK = CODE#<coachCode>` on the lookup item (ADR-002
decision 3). Masking the profile attribute alone would leave the real code in staging and
point the lookup at a code no profile carries. The transform rewrites that key with the same
masked value, which decision 5's determinism already guarantees, and the masked value must
be a valid-looking code — right length, ambiguity-safe characters — so client sign-up can be
exercised in staging. *Added 2026-09-29.*

The payment handles are replaced like `paymentInstructions`: they are account identifiers
for a real person's money. Masked emails and phones follow decision 4 whichever field they
sit in. *Added 2026-09-29.*

### 4. Replacements are non-deliverable by construction

*Amended 2026-10-07 by [ADR-027](ADR-027-on-demand-dev-environment.md) decision 8:* the two
layers below assumed, without saying so, that staging was in its own AWS account. SES sandbox
mode applies to a whole account in a region, so it only holds because dev is now a separate
account from production.

Not scrambled — **incapable of reaching a real person.** Scrambling produces plausible
addresses, and a plausible address in a system that sends email means sending mail to
strangers.

| Field | Replacement | Why it is safe |
|---|---|---|
| Email | `<token>@example.com` | RFC 2606 reserves `example.com`; it can never route |
| Phone | `+1 555 01XX` | The North American Numbering Plan reserves 555-0100–555-0199 for fictional use |
| Names | Generated from a fixed word list | No relation to the source value |

**Two further layers, so the mask is not the only thing standing between staging and a real
recipient:**

- **Staging never leaves Simple Email Service (SES) sandbox mode.** Sandbox only sends to
  individually verified addresses, so an unmasked address that slipped through still would
  not receive mail.
- **Staging gets no toll-free or 10DLC number.** Without one, Simple Notification Service
  (SNS) cannot send SMS at all.

### 5. Masking is deterministic, so referential integrity survives

The same source value maps to the same replacement everywhere it appears — a stable
one-way function of the value, salted per refresh.

This is required, not cosmetic. ADR-002 decision 4 denormalises client contact details onto
every `STUDENT#` item, with `CLIENT#…/PROFILE` as source of truth. Masking those
independently would produce a staging environment where a client's profile and their
student records disagree — and a test failing for that reason teaches nothing about the
code.

**The salt is rotated on every refresh and never stored.** A stable mapping across refreshes
would become a lookup table from fake identity back to real one.

### 6. Structure is preserved; identity is not

Dates, times, prices, `isMinor`, `bookingStatus`, `studentStatus`, block patterns, booking counts and every key
prefix are copied unchanged. The point of loading from production is to get realistic
*shape* — a coach with four blocks and thirty recurring bookings — and none of that requires
knowing who anyone is.

`isMinor` in particular stays true where it was true; the child-data code paths are the ones
most worth exercising.

### 6a. The pipeline asserts its own work, and fails the run rather than the environment

*Decided by the owner, 2026-08-30.* The masking transform is the only thing standing between
production records and a lower environment, which makes it a control rather than a
data-quality step. It verifies itself.

**Where the assertion lives is the whole point.** Proving a mask worked by comparison
requires holding the real value and the masked value at the same moment — and anything that
persists both has recreated the problem one level up. The transform is the one place both
legitimately exist, in memory, for the duration of a single item. So the assertion goes
there and nowhere else.

**Per item, before it is written:**

- For every field on decision 3's list: **`output != input`**. A field that comes out
  unchanged is a mask that did not fire.
- Emails match `@example.com`; phones match `+1 555 01XX`. Not merely different from the
  source — recognisably fake, so a value that was scrambled into something plausible fails
  too.
- **Deny by default:** every string field on an item is either on an allowlist of fields
  known not to carry personally identifiable information (PII), or matches a masked pattern.
  Anything else fails.

That last rule is the one that earns its keep. The likeliest failure here is not a mistake —
it is an omission: a field added to `STUDENT#` six months from now that the masking job
knows nothing about and copies straight through, in an environment that looks entirely
normal afterwards. An allowlist fails on the unknown field without anyone having remembered
to update anything. A denylist would not.

**A failed assertion aborts the refresh.** It does not log a warning and continue, and it
does not mask-and-retry. The import never runs, so staging keeps whatever it had — stale
data is a nuisance, unmasked data is an incident.

**Partial runs abort too.** A refresh that dies midway leaves staging on its previous
contents rather than a half-masked mixture, and the next attempt starts from a fresh export
with a fresh salt.

### 6b. A shape check runs against staging itself

*Decided by the owner, 2026-08-30.* Decision 6a asserts inside the transform, which covers
data arriving by the refresh. It cannot see anything written to staging by any other
path — a manual fix, a test fixture, a developer pasting a real record to reproduce a bug.
So staging is also checked from the outside.

**What it does.** A Lambda function scans the staging table and applies the same
deny-by-default rule as 6a: every string field must be either on the allowlist of fields
known not to carry personally identifiable information (PII), or match a masked pattern
(`@example.com`, `+1 555 01XX`). It covers the S3 reports bucket too, which holds student
names.

It **never compares against production** and has no need to. The question is not "does this
differ from the source" but "is everything here recognisably fake," which staging can answer
alone.

**Three ways it runs:**

1. **Automatically at the end of every refresh** — on success *and* on failure. The failure
   case is the one that matters more: 6a promises an aborted refresh leaves staging on its
   previous contents, and this is what verifies that promise held rather than trusting it.
2. **Ad hoc**, by invoking the function directly. It takes no arguments and holds no state,
   so there is nothing to set up — useful after any manual poking at staging, or before
   handing the environment to anyone.
3. **On a schedule — daily.** *Added 2026-08-30.* This is the only trigger that catches
   data written *between* refreshes, which is the case the outside-in check exists for at
   all: 6a already covers everything arriving by the refresh.

   Daily bounds the exposure window at 24 hours. A shorter interval buys a shorter window
   and costs almost nothing — the table is small — so the interval is a judgement about
   alarm fatigue rather than about money. Revisit if a bad day ever ends with the answer
   "it sat there for twenty hours."

**The scanner is structurally unable to read production.** Its Identity and Access
Management (IAM) role grants read on the staging table and the staging reports bucket, and
nothing else. A component that scans for personally identifiable information is exactly the
component that must not be able to reach the real thing.

**On failure it pages**, by the ADR-010 decision 4 route — Simple Notification Service (SNS)
to a phone. Unmasked production data sitting in a lower environment is the most page-worthy
condition in the system; it is a live exposure rather than a broken feature.

### 6c. What happens when the shape check fails

*Decided by the owner, 2026-08-30.*

**Two failures, two responses.** They look similar on a dashboard and are not the same
thing:

| | Meaning | Response |
|---|---|---|
| **The check found something** | Possible live exposure — a value in staging does not look masked | Contain, then triage |
| **The check did not run** | Loss of assurance, not exposure — Lambda error, timeout, permissions | Dead man's switch alarm (ADR-010 decision 4), fix, re-run |

The second needs `treatMissingData: breaching` for the same reason the cron jobs do: a
scanner that silently stops running looks exactly like a scanner that keeps passing.

---

**Contain automatically. Do not destroy automatically.**

The instinct on finding personally identifiable information (PII) in a lower environment is
to purge it. That is the wrong first move, for a reason worth stating plainly: **purging
destroys the evidence needed to understand what happened.** How many records, which fields,
which write path put them there, whether anyone read them — all of it lives in the data you
just deleted. You would end up with a clean environment and no idea whether the same thing
is about to happen again.

Containment stops the exposure and preserves the evidence. It is strictly better as an
automatic action.

**The automatic response is: disable the staging Cognito app clients — both of them.**
Every authenticated path into staging data goes through API Gateway's JSON Web Token (JWT)
authorizer, so cutting the app clients closes the realistic exposure surface in one action.
*Amended 2026-09-29:* since ADR-014 decision 10 there are two — the website's and the
check-in app's — and a leak reachable through `api-checkin` is still a leak, so containment
disables both. It is fast,
reversible, and destroys nothing.

It is deliberately *not*: disabling the CloudFront distribution (~15 minutes to propagate,
and the static site is not where the data is), or an Identity and Access Management (IAM)
deny on the table (breaks the application while leaving the data readable to anyone holding
Amazon Web Services (AWS) credentials).

---

**What gets logged, and what must not.**

The finding records the **item key and the field name** — enough to locate and count.

It **never records the value.** Writing an unmasked email into CloudWatch moves the exposure
from a table into a log group, which is the same mistake one layer over, in a place with
different retention and different access controls. The alert says *"14 items, field
`clientEmail`, does not match the masked pattern."* It does not say what the address was.

---

**Triage, in order:**

1. **Is it real, or an allowlist gap?** By far the likeliest cause is a legitimately
   non-PII field that nobody classified — see below. Confirm against the item key before
   treating it as an incident.
2. **Scope.** How many items, which fields, one type or several.
3. **Origin.** Did the refresh produce this, or did something else write to staging? A
   refresh origin means a bug in the masking list; any other origin means an undocumented
   write path, which is the more worrying answer.
4. **Access.** Did anyone read it? The staging access logs answer this and are the reason
   containment precedes purge.
5. **Then purge and re-refresh** — a human action, taken once the first four are known.
6. **Reportability.** A PII exposure involving minors may carry notification obligations
   depending on jurisdiction. §7 already flags legal review before launch; this is the
   scenario that review needs to have covered, so the answer is known *before* the day it
   is needed rather than researched during it.

---

**The false-positive path is routine, not an incident.**

Decision 6a's rule is deny-by-default, so a new field that carries no PII will fail the
check the first time it appears. That is the rule working, not misfiring.

The response is to **add the field to the allowlist and re-run** — but as a deliberate act,
reviewed like any other change, because adding to the allowlist is a claim that a field is
safe. It should be a commit, never a console edit.

The containment still fires in this case, and that is accepted: a few minutes of a disabled
staging login is a fair price for not having to decide, at speed, whether a given failure is
"probably fine."

---

### 7a. When staging is refreshed, and where it lives

*Superseded 2026-10-07 by [ADR-027](ADR-027-on-demand-dev-environment.md) decisions 2 and 6: dev starts on test data, production data is loaded only on request, and the domains are `dev.<domain>` and `api.dev.<domain>`.*

*Decided by the owner, 2026-09-30.*

**Cadence.** Before launch there is no production data, so staging runs on seeded test data,
re-seeded whenever a clean slate is wanted. After launch, staging is refreshed from
production:

- before any release that changes scheduling, cancellation or payments;
- **at least monthly**, so its data does not drift from real shapes;
- for an incident, with decision 8's `--coaches` and `--as-of` flags.

A refresh replaces staging's table — DynamoDB imports always create a new table, which
staging is then pointed at — so anything set up by hand in staging is wiped. That is part of
why refreshing is deliberate rather than continuous. *Amended 2026-10-09 by ADR-028: dev's table is
instead created from the import as part of building the stack, never repointed.*

**Domain.** Staging uses subdomains of the production domain, in the same DNS zone:

| | Production | Staging |
|---|---|---|
| Website | `<domain>` | `staging.<domain>` |
| API | `api.<domain>` | `api.staging.<domain>` |

Not AWS's default addresses, because three things depend on the domain and must be set up
in staging the same way as in production: Cognito's allowed sign-in redirects, each API's
cross-origin resource sharing (CORS) rule, and the API's custom domain. Staging also tells
search engines not to index it. Which domain `<domain>` is remains open — see Open.

### 7. The refresh is deliberate and logged

- Refresh is a manually triggered job, not a schedule. Nobody should be surprised by
  production data moving.
- The masking job is the only thing with read access to production data and write access to
  staging. That cross-environment permission is the sharpest edge in this decision and it
  gets its own role, used by nothing else.
- Each refresh is logged: who ran it, when, how many items. *Amended 2026-09-29:* also the
  coach and client IDs requested, the `--as-of` export time, and a free-text reason. Pulling
  a specific family's data into a lower environment because of an incident is a deliberate
  act on real people's data, masked or not, and the record should say why. *Amended 2026-10-09 by
ADR-027: the workflow's run history and CloudTrail now cover most of this log.*

### 8. Staging holds a subset, remapped onto fixed test accounts

*Decided by the owner, 2026-09-29.*

**The problem this solves.** Every coach partition is `COACH#<coachId>` and every client
partition `CLIENT#<clientId>`, and both identifiers are the account's Cognito `sub` (ADR-016
decision 2, ADR-002 decision 3). Cognito generates a `sub` when it creates an account and
it cannot be chosen or copied, and production accounts must never be copied anyway. So a
straight copy leaves every coach and client partition keyed to an account that does not
exist in staging: realistic data that no staging login owns. The bulk-cancellation consumer
— the reason this environment exists — could not be triggered through the app against it,
and neither could ADR-013 decision 3c's Playwright canary.

#### 8a. The subset is an input to each run, not deployed configuration

*Amended 2026-10-07 by [ADR-027](ADR-027-on-demand-dev-environment.md) decision 2: the command is `load-dev`, and the default list in Parameter Store is dropped — coaches are named on every load.*

```
refresh-staging [--coaches <id>,…] [--clients <id>,…] [--as-of <timestamp>]
```

- **`--coaches`** — production coach IDs to copy. With no subset flags, a default list is
  read from Systems Manager Parameter Store, editable without a deployment.
- **`--clients`** — production client IDs to copy. **Naming a client brings in their coach
  automatically**: a client belongs to exactly one coach in MVP (ADR-002 decision 5), and
  *(amended 2026-10-06 by ADR-025: all of the client's coaches)*
  the coach's ID is in the client's link record, so the coach need not be looked up by hand.
- **`--as-of`** — export the table as it stood at a given second, within Point-in-Time
  Recovery's 35-day window (ADR-010 decision 7). Omitted, the export is of now.

IDs are identifiers, not personal data: they are what production logs and ADR-012's access
log already record. Changing the default list or running with different flags is an edit
and a button press, never a deployment. That is what makes the incident path work: find
the coach's or client's ID in the logs, and refresh with them included — as of the moment
the problem happened, if that matters.

#### 8b. Filtering happens in the transform

A DynamoDB export always covers the whole table, so the transform keeps only:

- the requested coaches' partitions, `COACH#<coachId>`;
- the `CLIENT#` partitions of clients linked to those coaches' students;
- those coaches' `CODE#` lookup items.

Everything else is dropped in memory and never reaches staging. This is also the smaller
exposure the subset was wanted for: a masking bug can only affect the families copied.

A refresh replaces staging's data, so anything created by hand in staging since the last
refresh is gone. To keep the default coaches while adding an incident coach, pass both. *Since ADR-027 there is
no default list: name every coach.*

#### 8c. Fixed pools of test accounts, assigned by order

*Amended 2026-10-07 by [ADR-027](ADR-027-on-demand-dev-environment.md) decision 3: the pools are created each time dev is built, so their `sub`s change per build; the load reads them by email. Assignment by order is unchanged.*

Created once in the staging Cognito pool and kept across refreshes, so their `sub`s never
change:

- **Test coaches** — three to five: `coach-a@example.com`, `coach-b@example.com`, …
- **Test clients** — about ten: `client-1@example.com`, `client-2@example.com`, …

Their `sub`s are ordinary configuration; they are test accounts, not secrets.

**Assignment is by order, so no mapping needs to be recorded.** The first coach requested —
or pulled in by the first requested client — becomes `coach-a`, the next `coach-b`. The
first client named in `--clients` becomes `client-1`, the next `client-2`. Requested clients
take test accounts **before** any other client; the rest of a copied coach's clients fill
the remaining slots, and any beyond the pool get a fresh random identifier: still visible
in the coach's roster and week view, but not someone anyone can sign in as.

The person running the refresh knows which account is which because they typed the order.
Nothing linking a production identity to a test login is written anywhere — the same rule
as decision 5's salt, which is rotated and never stored.

**A run that asks for more named coaches or clients than a pool holds stops with an error.**
It does not quietly leave a requested account without a login.

**A mapped account's emails are its test login**, not a generated mask:
`coach-a`'s profile carries `loginEmail = coach-a@example.com`, so the staging profile
matches the staging Cognito user. Unmapped clients' emails are masked by decision 4 as
before.

#### 8d. Every occurrence of an identifier is rewritten

A `sub` appears in far more places than a partition key. The transform rewrites, from the
in-memory mapping:

| Item | Coach identifier | Client identifier |
|---|---|---|
| Everything in the coach's partition | `PK = COACH#…` | — |
| `STUDENT#` | — | `clientId` |
| `BOOKING#` | `GSI2SK = COACH#…#<startTime>`, `GSI3PK = COACH#…`, `markedPaidBy`, `waivedBy` | — |
| `CHANGEBATCH#` | `cancelledById`, when a coach acted | `cancelledById`, when a client acted |
| `CANCELLED#` | — | `clientId` |
| `RECURRENCE#` | — | `clientId` |
| `CLIENT#…/PROFILE` and links | the link's sort key, `STUDENT#<coachId>#<studentId>` | `PK = CLIENT#…` |
| `CODE#` lookup | `coachId` | — |

Student, booking and batch identifiers are generated by the application, not by Cognito,
and are copied unchanged.

#### 8e. The transform asserts that no production identifier survived

Beside decision 6a's checks, per item: **no string field contains any production
identifier from the run's mapping.** A match aborts the refresh exactly as an unmasked email
does.

A missed row in 8d is the likely bug here, and it would not look like a personal-data leak
to decision 6a — it would be a thread from staging back to a real account, and a broken
reference. Like 6a's allowlist, the assertion catches the field added six months from now
that nobody added to the rewrite table.

#### 8f. What the subset does not do

- **Masking can hide the bug being investigated.** A problem that depends on actual values —
  a name with `é` pushing an SMS into UCS-2, payment instructions breaking the email's
  escaping — is replaced by exactly the masking that protects the family. Structural bugs
  reproduce: schedules, recurrences, conflicts, timing. Content bugs are worked from
  production logs.
- **It does not exercise whole-table behaviour**, such as the 7am reminder across many
  coaches. Copying more coaches is a flag, not a redesign.
- **It is not instant.** An export and an import into a new table take minutes to tens of
  minutes.

### 9. Profile photos are replaced with one placeholder

*Decided by the owner, 2026-09-29.* A profile photo (ADR-016 decision 5) is a real person's
face. It cannot be masked the way an email can, and decision 6b's scanner cannot recognise
one, so the outside check has no way to catch a real photo that got through.

So photos are never copied. The transform sets every `profilePhotoKey` to one shared
placeholder image, and the staging photo storage holds that placeholder and nothing else.
That turns the scanner's job into something it can check: **any object other than the
placeholder is a finding**, handled under decision 6c like any other.

Setting the key rather than clearing it keeps the "coach has a photo" path exercised in
staging; the "no photo" path is exercised by any coach created there by hand.

---

## Consequences

**Easier.** The bulk-deletion consumer can be exercised against realistic data before it
touches a real coach's term. Wrong Identity and Access Management (IAM) policies, a
mis-wired change-data-capture path, and EventBridge Scheduler's daylight-saving behaviour —
untested per ADR-001 assumption 8 — all become observable somewhere other than production.

**Harder.** A second stack is a second thing that can break, and ADR-001's framing is that
the compounding cost for a solo developer is nights spent debugging. Two environments also
drift unless refreshed regularly, and a staging environment that no longer resembles
production produces false confidence rather than none. *Read "staging" as dev since ADR-027;
a dev stack built fresh each time can't drift.*

**The masking pipeline is a compliance-critical component**, and decision 6a makes it
self-verifying rather than trusted. The cost is that a refresh can now fail for reasons that
look pedantic — a new field nobody classified will abort the whole run. That is the intended
behaviour: the alternative is a refresh that quietly succeeds while carrying a field nobody
thought about.

---

## Open

- ~~Refresh cadence.~~ **Settled 2026-09-30** — decision 7a.
- ~~Does staging get its own domain?~~ **Settled 2026-09-30: subdomains of the production
  domain** — decision 7a.
- **Which domain BladeBook runs on.** The owner holds `jessicavega.dev` but no BladeBook
  domain yet.
- ~~Cognito users are not part of the DynamoDB export.~~ **Settled 2026-09-29** — decision
  8. Test accounts are fixed pools created once in staging; production accounts are never
  copied; copied data is remapped onto the test accounts by order.
- ~~Profile photos.~~ **Settled 2026-09-29** — decision 9: one shared placeholder, never
  the real photo.
- ~~Is a full copy needed, or a subset?~~ **Settled 2026-09-29: a subset** — decision 8,
  named per run, defaulting to a list in Parameter Store. *Amended 2026-10-07 by ADR-027: no
  default list; coaches are named on every load.*
- ~~Who verifies the mask?~~ **Settled 2026-08-30** — decisions 6a and 6b. The transform
  asserts on itself in-pipeline and aborts the refresh on failure; a scanner then checks
  staging from the outside, after every refresh and on demand.
- ~~Should the shape check also run on a schedule?~~ **Settled 2026-08-30: daily**, in
  addition to per-refresh and ad hoc — see decision 6b.
- ~~What happens when the shape check fails?~~ **Settled 2026-08-30** — see decision 6c.
  Automatic containment (disable both staging Cognito app clients), never automatic
  destruction; purge is a human action after triage. Still open beneath it: **is the
  staging access log detailed enough to answer "did anyone read it"** — triage step 4
  assumes it is, and nothing has confirmed that.
- ~~**Ephemeral per-branch stacks** were considered as an alternative to a persistent staging
  environment.~~ **Chosen 2026-10-07, as one on-demand dev stack rather than one per branch** —
  [ADR-027](ADR-027-on-demand-dev-environment.md).

---

## Revisit if

- The masking job is ever found to have leaked a real value. That converts this from a
  process into an incident, and the answer becomes synthetic-only data.
- Staging drifts far enough from production that a bug ships anyway — at which point the
  environment is costing maintenance and returning nothing. *Can't happen since ADR-027: dev is
  built fresh each time.*
- Payments arrive (§10 Phase 2). Real payment identifiers in a lower environment are a
  different class of problem from contact details, and this decision would need rewriting
  rather than extending.
