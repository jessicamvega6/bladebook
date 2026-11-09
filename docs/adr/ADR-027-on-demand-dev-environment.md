# ADR-027: An On-Demand Dev Environment Replaces Staging

## Status

**Accepted** — 2026-10-07. *Decided by the owner.* Decisions 8 and 9 (separate AWS accounts;
where the masking job and the surviving logs live) added the same day.

**Amended — 2026-10-09.** *Decided by the owner.* An AWS Step Functions workflow runs each load
(decision 9, amended). Its steps carry out ADR-011 decision 6a's checks, 6b's after-load scan and
most of decision 7's load log.

**Amended — 2026-10-09, later.** [ADR-028](ADR-028-dev-table-built-from-one-import.md): dev's table is created from one import file when the
stack is built — seed data or masked production, never both. Decisions 2, 3, 4 and 9 are
amended; `load-dev` becomes `build-dev`.

**Amended — 2026-10-15.** *Decided by the owner.* Decision 7's canary does **not** run on a
schedule in MVP. In its place:

- **A post-deploy check.** The production deploy job (ADR-032) ends by running ADR-013 decision
  3c's second flow once against production, as the test coach and test family. It runs inside
  the job the owner has just approved, so it needs no second approval. A failure fails the job,
  with the owner there to roll back.
- **An up-check, always on.** Health checks call the website's home page and a new **`/health`**
  route on the API about once a minute, and alarm through ADR-010's paging. `/health` needs no
  sign-in, reads no data and returns only "OK". It catches the site or API being down, an
  expired certificate or domain, and the firewall blocking everyone. *Decided by the owner,
  2026-10-15:* **`/health` is rate-limited** by the firewall like the other routes that need
  no sign-in ([ADR-019](ADR-019-waf-in-mvp.md), amended 2026-10-15).

The **scheduled canary moves to Phase 2**, undecided. Between releases, a stall in the
cancellation path that the up-check can't see goes unnoticed until a coach reports it. That gap
is accepted for MVP.

**Supersedes** [ADR-011](ADR-011-staging-environment.md) decision **1** (a long-running
second stack), decision **7a** (the refresh cadence and the staging domains), decision
**8a**'s default coach list and decision **8c**'s accounts "created once and kept across
refreshes". ADR-011's masking rules (decisions 2–6c, 7, 8b, 8d–8f and 9) **carry over
unchanged**, now applied to dev.

**Amends** [ADR-010](ADR-010-availability-and-reliability.md) decision 4 and *Explicitly not
doing* (alarms are proved in dev; the canary runs against production),
[ADR-012](ADR-012-pii-access-logging.md) decision 5 (dev's access logs outlive the stack),
[ADR-013](ADR-013-testing-requirement.md) decision 3c (the canary moves to production),
[ADR-017](ADR-017-data-retention-ttl-and-archive.md) decision 7,
[ADR-019](ADR-019-waf-in-mvp.md) decisions 4–4b, [ADR-023](ADR-023-rinkside-check-in-joins-the-coach-website.md)
(the rinkside page's dev address), [ADR-024](ADR-024-client-write-link-check.md) and
[ADR-025](ADR-025-many-coaches-per-skater.md) (wording only: "staging" becomes "dev"),
[ADR-001](ADR-001-backend-stack.md) A4 criterion 5, and *(added 2026-10-08)*
[ADR-021](ADR-021-tenant-isolation-at-the-database.md) decision 7 and
[ADR-013](ADR-013-testing-requirement.md) decision 4 (database-gate tests run in dev).

---

## Context

ADR-011 created **staging**: a full second stack, running all the time, refreshed from
production at least monthly. Reading the documents back, the owner found that "staging" had
been used for something they don't want. **The only long-running environment is
production.** A development environment is built when it's needed and destroyed when the work
is done.

ADR-011 had already named this as the fallback. Its Open section recorded *ephemeral stacks*
as "near-zero cost when not running, and no drift because each is built fresh … the cheaper
option if persistent staging becomes a maintenance burden."

Two things depended on staging always being there, and the owner settled both:

- **Whether production data is ever copied into dev.** *Yes, as a masked subset, on demand.*
  Reproducing an incident against a masked copy of a real coach's data is worth keeping.
- **Where the scheduled canary runs.** ADR-013 decision 3c's second Playwright flow ran on a
  schedule against staging, and it's the only check that catches the change-data-capture path
  stalling. *It moves to production, with a dedicated test coach and test family.*

---

## Decision

### 1. Production is the only long-running environment

**Dev** is a full stack built from the same infrastructure code as production: its own
DynamoDB table, Lambda functions, API Gateway, Cognito user pool, EventBridge bus and
Scheduler, S3 buckets and CloudFront distribution. It is built when there is work for it and
destroyed when that work is done. There is one dev environment at a time, not one per branch.

The name "staging" is retired. Everything ADR-011 said staging was for is done in dev:

- running the bulk-cancellation consumer against realistic data before a release that
  touches scheduling, cancellation or payments;
- the Playwright flows before a release;
- proving each alarm fires (ADR-010 decision 4);
- running the firewall in block mode before launch (ADR-019 decision 4a);
- the database-gate tests (ADR-021, ADR-022);
- reproducing an incident.

### 2. Dev starts on test data; production data is loaded only on request

A newly built dev holds **seeded test data** only. Before launch that is all it ever holds.

After launch, a **masked subset of production** can be loaded into a dev stack that is up:

```
load-dev --coaches <id>,… [--clients <id>,…] [--as-of <timestamp>]
```

*Amended 2026-10-09 by ADR-028: production data is not loaded into a running stack; dev is built
from it, with `build-dev --masked`.*

Everything ADR-011 requires of a refresh applies to a load: masking in the pipeline, never
after loading (decision 2); undeliverable replacements (decision 4); a per-load salt that is
never stored (decision 5); the transform's self-checks, which abort the load (decision 6a);
filtering in the transform (decision 8b); every identifier rewritten and checked (decisions
8d–8e); one placeholder photo (decision 9); and the load log (decision 7).

**Coaches are named on every load.** ADR-011 decision 8a's default list in Parameter Store is
dropped: there is no long-running place to keep it, and every load into a fresh stack is a
deliberate act anyway. Naming a client still brings in all their coaches (ADR-025).

### 3. Test accounts are created with the stack

ADR-011 decision 8c's pools (`coach-a@example.com`…, `client-1@example.com`…) are created each
time dev is built. Their Cognito `sub`s change with every build, which costs nothing: the load
reads the current pool's `sub`s by email, and assignment by order is unchanged. Nothing
linking a real identity to a test login is stored, as before. *Amended 2026-10-09 by ADR-028
decision 4: the test accounts are a separate stack, built first.*

### 4. Tearing down is a purge, so it follows ADR-011 decision 6c's rules

Destroying dev deletes its data. ADR-011 decision 6c says purging comes **after** triage,
because deleting the data also deletes the evidence of how it got there. So:

- **No teardown while a scanner finding is open.** A finding is triaged first (6c's steps 1–4),
  and only then is the stack destroyed, which is the purge.
- **The scanner keeps running while dev exists.** ADR-011 decision 6b's three triggers stay:
  after every load, on demand, and daily. The daily schedule is part of the dev stack, so it
  starts and stops with it. *Amended 2026-10-09 by ADR-028: "after every load" reads as "after
  every build from production data".*
- **Evidence lives outside the stack.** Dev's access logs (ADR-012 decision 5's data events on
  the table and buckets) and the load log are written somewhere the teardown doesn't delete,
  and kept as long as production's access logs. Otherwise triage step 4, "did anyone read
  it?", becomes impossible the moment dev is destroyed.

Containment is unchanged: on a finding, dev's Cognito app clients are disabled automatically.

### 5. Teardown deletes everything, and can't reach production

In dev, the table and buckets are created to be deleted with the stack, emptied first where
needed. In production they keep `RemovalPolicy.RETAIN` and deletion protection (ADR-010
decision 7). Which settings apply is derived from the environment name in one place, and an
infrastructure test asserts that production's table and buckets are retained and protected.
That way a dev setting can't silently reach production.

After a teardown, nothing tagged as dev should remain. A leftover bucket costs money and may
hold masked data.

### 6. What stays the same in dev

- **Never leaves Simple Email Service (SES) sandbox mode**, and **gets no toll-free or 10DLC
  number** (ADR-011 decision 4). Both are layers in case a mask is missed.
- **Firewall off by default** (ADR-019 decision 4a), switched on to rehearse block mode before
  launch and before firewall-relevant releases. Its cost is now only for the hours it runs.
- **Alarms off by default** (ADR-010 decision 4), switched on to prove they fire.
- **Domains:** `dev.<domain>` and `api.dev.<domain>`, replacing ADR-011 decision 7a's staging
  subdomains for the same reason: Cognito's allowed sign-in redirects, each API's cross-origin
  resource sharing (CORS) rule and the custom domain must be set up the way production's are.
  *(Amended 2026-11-09: there are no Cognito sign-in redirects since the websites use their own
  sign-in forms ([ADR-023](ADR-023-rinkside-check-in-joins-the-coach-website.md) decision 11);
  the CORS rule and the custom domain still need the subdomains.)*
  The records are created and removed with the stack. Search engines are told not to index it.

### 7. The canary runs against production, as a test coach and test family

ADR-013 decision 3c's second Playwright flow, which saves a schedule change that cancels
bookings, runs **on a schedule against production**. It signs in as a dedicated test coach and
a test family that exist only for this.

- **Their emails go to a mailbox the owner controls,** not `example.com`. Production sends
  real mail, and mail to an undeliverable address bounces. ADR-010 decision 4 pages on the SES
  bounce rate, so a canary that bounces every run would trigger that page.
- **The test family has no SMS opt-in,** so the canary never sends a text.
- **The skater is fictional.** No real person's data is involved.
- **The accounts are marked as test accounts** on their profiles. Anything that counts or
  reports across coaches leaves them out: usage figures, a future licence or billing check,
  anything summed over the whole table. Per-coach views need no change, because only the test
  coach sees their own data.
- **The canary's credentials are kept in Secrets Manager.**
- **Its cancellations are real records.** They age out under ADR-017's retention like any
  others.

*Amended 2026-10-15:* in MVP this flow runs once after each production deploy, not on a
schedule; the scheduled run is Phase 2 (see Status).

### 8. Production and dev are separate AWS accounts

*Decided by the owner, 2026-10-07.* Two accounts under one AWS Organization: a **production
account** and a **dev account**. Sign-in to both goes through IAM Identity Center, with
multi-factor authentication. Accounts, the Organization and Identity Center cost nothing.

**Why.** In one account, Identity and Access Management (IAM) policy is the only thing between
dev and production. A separate account is a hard wall: nothing in dev can reach production
unless production explicitly allows it.

- **ADR-011 decision 4's safety layers only work this way.** Simple Email Service (SES) sandbox
  mode applies to a whole account in a region, so once production is approved to send real
  mail, a dev stack in the same account could send real mail too. SMS spending limits and
  number registrations are per account as well. In its own account, dev stays in the sandbox
  and has no number, by construction rather than by configuration.
- **Teardown becomes routine.** ADR-010 decision 7 names a destroy against the wrong stack as
  the likeliest way to lose the table. Credentials for the dev account can't destroy anything
  in production.
- **Checking a teardown is simple** (decision 5): anything left in the dev account while dev is
  down is a leftover.
- **Masked copies of children's data sit behind an account boundary**, which is the boundary a
  legal review will ask about.
- **Dev's cost is billed separately.**

**Why now.** Moving later is a migration. DynamoDB tables can't move between accounts; they are
exported and imported. Cognito users can't move with their passwords, so every coach and family
would have to reset theirs. Deciding before anything is built costs nothing extra.

**DNS.** The domain's zone stays in the production account. `dev.<domain>` is delegated to its
own hosted zone in the dev account (about $0.50 a month), so the dev stack creates and removes
its own records without any permission in production.

A third account just for logs, as AWS's standard multi-account setup recommends, is not needed
yet; see *Revisit if*.

### 9. The masking job and the surviving logs live in their own stack, in the production account

*Decided by the owner, 2026-10-07.* A small, rarely deployed **data-loading stack** in the
production account, separate from the application stack, holds:

- **the masking job and its role**, ADR-011 decision 7's "own role, used by nothing else". It
  starts the production export, masks it, and writes to the current dev table through a role in
  the dev account that trusts it; *amended 2026-10-09 by ADR-028: the workflow ends at the masked
  file; the table is created from it when the dev stack is built;*
- **the load log** (ADR-011 decision 7);
- **the bucket for dev's access logs** (decision 4), which dev's CloudTrail writes to across the
  account boundary and which teardown can't reach.

**Why its own stack.** The cross-environment permission is the sharpest edge in the design. In
the dev stack it would be deleted and recreated with every build, and a role in another account
that is deleted and recreated stops being trusted, so production's trust would break each time.
It would also vanish with the stack, along with the evidence of what a bad load did. In the
production application stack, every routine deploy would touch it. On its own it is stable,
idle and costs nothing between loads.

**Turned down:** *running the job from the owner's machine.* Unmasked records would pass
through a laptop's memory and disk, breaking ADR-011's rule that they exist only inside the
transform.

**Amended — 2026-10-09.** *Decided by the owner.* **An AWS Step Functions workflow runs each
load**, in the data-loading stack. Its steps: start the production export (as of now or
`--as-of`), check on it until done, run a **transform Lambda** (filter, mask, remap, ADR-011
6a's checks), start the import in the dev account, check on it until done, then run ADR-011
6b's scan, **whether the load succeeded or failed**. A failed check sends the workflow to a
fail step, so the import never starts. It is started by hand with the coaches, clients,
as-of time and reason; its run history and CloudTrail's record of who started it cover most of
ADR-011 decision 7's load log. *Amended 2026-10-09 by ADR-028: the workflow ends at the masked
file; the table is created from it when the dev stack is built.* *Amended 2026-10-13 by the
owner: 6b's scan runs only after a successful masked build (ADR-028 decision 4). A failed build
leaves no dev table to scan.*

- **Two buckets.** The raw export is unmasked production data, so it lands in an **export
  bucket** readable only by the transform, with a rule that **deletes it automatically after a
  day**. The masked output goes to a separate **masked bucket** that only the dev account's
  import may read. Dev never touches the raw export. *Amended 2026-10-09 by the owner
  ([ADR-028](ADR-028-dev-table-built-from-one-import.md) decision 6): the masked bucket also
  deletes its contents automatically after 24 hours.*
- **A restart is a new run** with a fresh export and a fresh salt (ADR-011 6a); nothing is
  resumed.
- **Why not one Lambda for the whole load:** it would wait through the export and the import,
  and could be cut off by its 15-minute limit with no scan afterwards. Cost doesn't decide it:
  both come to a cent or two a load, mostly the export and import.

---

## Alternatives considered

- **Keep a long-running staging.** Rejected by the owner. It costs money every month for
  something used only now and then, and it drifts from production unless it's refreshed.
- **Test data only, never production data in dev.** It would remove the masking pipeline, the
  scanner and containment entirely, which is a large reduction in risk. The owner chose to keep
  incident reproduction against a masked copy of real data. ADR-011's *Revisit if* still names
  test-data-only as the answer if a mask ever leaks.
- **A dev stack per branch.** More than one developer would need it. One environment at a time
  covers the work.
- **Run the canary only while dev is up.** Production would then go unwatched between
  releases, which is exactly the silent failure ADR-010 asks a canary to catch.

---

## Consequences

**Easier.**
- **Cheaper.** Staging cost about $2–5 a month normally, and $12–15 with its firewall on. Dev
  costs only for the hours it exists.
- **No drift.** Every dev stack is built fresh from the same code as production, so "staging
  no longer looks like production" can't happen.
- **Masked data exists only while it's being used.** Between loads there is no lower
  environment holding a copy of anyone's data.
- **The canary watches the real system**, not a copy of it.

**Harder.**
- **Building takes time.** A new stack, especially its CloudFront distribution and
  certificate, can take tens of minutes before work can start.
- **The infrastructure code must build from nothing, reliably.** Staging only ever had to be
  updated. Dev has to be built and destroyed cleanly every time. That's a good test of the
  infrastructure code, but it's also a new way for a session to fail.
- **Data retention (ADR-017) is harder to exercise.** DynamoDB's Time to Live (TTL) deletes
  expired items typically within a few days. Seeing the archiver run end to end means keeping
  dev up that long.
- **Two AWS accounts to set up and sign in to.** Identity Center makes it one login, but the
  masking job, the surviving logs and DNS each need a cross-account permission written once.
- **Production holds test accounts.** They need to stay out of anything summed across coaches,
  and every new feature that counts across coaches has to remember them.
- **Deploys go from a short-lived dev straight to production.** ADR-010 decision 7's deletion
  protection and `RemovalPolicy.RETAIN` are what stand between a bad deploy and the table.

---

## Open

- ~~Where the masking job and its cross-environment role live.~~ **Settled 2026-10-07** —
  decision 9.
- ~~Where dev's access logs and load log are kept, and whether dev is a separate AWS
  account.~~ **Settled 2026-10-07** — decisions 8 and 9.
- ~~**What runs the masking job.**~~ **Settled 2026-10-09:** a Step Functions workflow
  (decision 9).
- **How long dev may hold loaded production data.** Should a dev stack with loaded data page,
  or remind the owner, after some number of days?
- ~~**The canary's cadence and where it runs** (a scheduled CI job or CloudWatch Synthetics), and
  which mailbox the test accounts use.~~ *Settled in part 2026-10-15 (Status):* MVP runs it after
  each production deploy. **Still open:** which mailbox the test accounts use, and, for Phase 2,
  whether to run it on a schedule at all, and where: a GitHub Actions schedule with the test
  passwords kept as GitHub secrets (no AWS access for GitHub), or CloudWatch Synthetics inside
  the production account.
- **Checking that teardown left nothing behind** (decision 5): a script or a check at the end
  of the destroy.

---

## Revisit if

- The production table nears ~5 GB (roughly a few hundred coaches). The export always covers the
  whole table, so one transform Lambda can no longer finish in 15 minutes: add a parallel
  step that transforms each export file separately.
- Exports cost tens of dollars or take hours (tables of hundreds of GB). Switch routine loads
  to reading the named coaches and families directly, and keep the full export for incidents
  that need `--as-of`.
- Several people need access to production, or an audit asks for logs no one with production
  access can alter. That is when a separate log account earns its setup.
- A second developer joins. Two people sharing one on-demand dev environment will collide, and
  per-branch stacks become worth their cost.
- Building dev routinely takes long enough that work is skipped rather than tested there.
- The production canary ever touches a real coach's or family's data, or its test accounts
  leak into a cross-coach figure.
- Payments arrive (§10 Phase 2). ADR-011's *Revisit if* still applies to loaded data.
