# ADR-028: The Dev Table Is Built From One Import — Seed Data or Masked Production

## Status

**Accepted** — 2026-10-09. *Decided by the owner.*

**Amends** [ADR-027](ADR-027-on-demand-dev-environment.md):

- decision **2**: production data is no longer loaded into a dev stack that is up; dev is
  *built from* it;
- decision **3**: test accounts are built first, in their own stack;
- decision **4**: the scanner's after-load trigger becomes "after a build from production data";
- decision **9** as amended 2026-10-09: the workflow stops at the masked file, and the import
  becomes part of the build.

Settles the gap in ADR-027's 2026-10-09 amendment, whose workflow started an import "in the dev
account" with no table for it to load into.

---

## Context

ADR-027 decision 2 has dev start on seeded test data, with a masked subset of production
"loaded into a dev stack that is up". Its 2026-10-09 amendment has a Step Functions workflow
export production, mask the export, and then "start the import in the dev account".

**A DynamoDB import from Amazon Simple Storage Service (S3) always creates a new table.** It
cannot load into a table that already exists. ADR-011 knew this: a staging refresh replaced the
table, "which staging is then pointed at". That worked for a long-running staging environment.
It does not work for an on-demand dev stack:

- **An imported table outside the stack escapes the teardown.** ADR-027 decision 5's purge
  works because the stack owns the table. A table the import created separately would survive
  `destroy`, and so would the masked data in it.
- **Repointing means a redeploy.** The functions, the stream and the event pipeline are all
  wired to the stack's table.

Writing the masked items into the stack's existing table instead, with a loader function, would
send every item through DynamoDB Streams to EventBridge. Consumers would act on the loaded data:
confirmation emails, the student-link and family-sync updates, invitations. The event pipeline
would have to be paused for every load, and a failed load would leave dev half-loaded.

The owner's model for dev settles it: **before launch, dev runs on seed data; after launch, dev
is gone, and when it is rebuilt its data comes from the transform.** Keeping seed data as an
option after launch is what lets routine release testing go on without copying production.

---

## Decision

### 1. A dev table is created from one import file, when the stack is built

Every dev table is created **by an import from one file in S3**, as part of building the
stack. The table still belongs to the stack, so teardown deletes it and ADR-027 decision 5's
purge holds. Both Infrastructure as Code (IaC) tools under consideration (ADR-001 A4) support
this: the Cloud Development Kit (CDK) through `importSource` on `Table`, and Terraform through an
`import_table` block on `aws_dynamodb_table`.

**Nothing is loaded into a dev table after it is built.** No batch writes, no second import.

### 2. Two sources: seed data or masked production data

| Source | When | What it holds |
|---|---|---|
| **Seed** | Before launch, always. After launch, the default. | The seed data, assigned to the test accounts built with the stack. No real person's data. |
| **Masked production** | After launch, **only on request**. | A masked subset of production, under every rule ADR-027 decision 2 carries over from ADR-011 (masking in the pipeline, undeliverable replacements, a per-load salt, the transform's self-checks, filtering, identifier rewriting, one placeholder photo, the load log). |

The seed build covers the routine uses in ADR-027 decision 1: the Playwright flows before a
release, the database-gate tests, proving alarms fire, and the firewall rehearsal. A masked
build is for when realism is the point: the bulk-cancellation consumer against real-shaped data,
and reproducing an incident.

```
build-dev                                                            # seed
build-dev --masked --coaches <id>,… [--clients <id>,…] [--as-of <timestamp>] --reason "…"
```

`build-dev` replaces ADR-027's `load-dev`. Coaches are still named on every masked build, and
naming a client still brings in all their coaches (ADR-025).

*Amended 2026-10-15 (ADR-032): `build-dev` may run from the owner's machine with their IAM
Identity Center sign-in, or from a workflow.*

### 3. One source per table: seed data and production data are never mixed

**A dev table holds seed data or masked production data, never both.** This follows from
decision 1: the table is created from one import file and nothing is added afterwards.

- **To switch source, rebuild.** Going from a seed build to a masked one, or the other way,
  means destroying the application stack and building it again from the other file. The same
  applies to loading a different subset of production.
- **A masked build has no seed data in it.** It doesn't need any: the transform already
  assigns every real coach and family to a test account (ADR-011 decision 8c), so the test
  logins work.
- **Tests that rely on particular seed records** run only against a seed build.

### 4. Build order: test accounts first, then the data, then the table

The transform and the seed file both need the test accounts' Cognito `sub`s. Those exist only
once the accounts are created. So dev is built as **two stacks**:

1. **The account stack:** dev's Cognito user pools and test accounts (ADR-027 decision 3).
2. **The data file:**
   - *Seed:* the seed script writes the import file, reading the test accounts' `sub`s by
     email.
   - *Masked:* the Step Functions workflow (ADR-027 decision 9) exports production, runs the
     transform, which reads the `sub`s by email, and writes the masked file. A failed check
     goes to the fail step, so no masked file is written.
3. **The application stack:** the table is created from that file; the functions, API, event
   pipeline and the rest are built around it.
4. **The scan** (ADR-011 decision 6b's after-load trigger) runs as soon as a masked build
   finishes, before anyone signs in. The daily scan and the on-demand scan are unchanged.

The workflow no longer starts or watches an import; that is now the build's job. Its run history
and CloudTrail's record of who started it still cover most of ADR-011 decision 7's load log.

### 5. A build fails if the import doesn't match the file

An import does not stop on a bad item: it logs the error and skips the item. If two items share
a key, it keeps one **silently, with no error**. So:

- the transform and the seed script record **how many items they wrote**;
- after the import, the build compares that with the import's own count of items imported, and
  with its error count;
- **any difference fails the build**, and the application stack is torn down.

The transform also checks that no two items in its output share a key, since remapping is the
likeliest way to create a duplicate and the import would hide it.

### 6. The masked file is read across the account boundary

The masked file stays in the **masked bucket in the production account** (ADR-027 decision 9,
amended 2026-10-09). Only the dev account's table import may read it. Dev never touches the raw
export. *Settled 2026-10-09 by the owner:* the masked bucket **deletes its contents
automatically after 24 hours**, like the export bucket; the file is needed only until the build
reads it. *Phase 2 (decided by the owner, 2026-10-09):* the build also deletes the masked file as
soon as the import has read it, making 24 hours a hard limit. Until then only the S3 rule applies;
S3 counts whole days and removes expired files with some delay, so a file can last up to about
48 hours. The seed file lives in the dev account; it holds no real data.

---

## Alternatives considered

- **Import into a separate table and point dev at it** (ADR-011's staging approach). Rejected:
  the table would survive teardown, breaking ADR-027 decision 5's purge, and every load would
  need a redeploy to repoint the functions and the event pipeline.
- **A loader function that batch-writes into the stack's table.** Rejected: every write goes
  through the event pipeline, so it would have to be paused for each load; a failed load leaves
  dev half-loaded; and it adds a function.
- **The transform writes straight into dev across accounts** (ADR-027 decision 9's original
  wording). Rejected: production-account code would hold write access to dev, which the
  2026-10-09 bucket handoff was meant to avoid.
- **Every dev build after launch comes from production.** Considered by the owner and set
  aside: every release would copy (masked) children's data, where ADR-027 decision 2 and ADR-011
  allow it only on request.
- **Seed data and masked production data in one table.** Not done: decision 3. If it is ever
  needed, see *Revisit if*.

---

## Consequences

**Easier.**
- **Teardown is still a purge.** The table is the stack's, whatever it was built from.
- **Loaded data never sets off the consumers.** The import builds the table rather than writing
  to it, so no emails, invitations or link updates run against loaded data (see Open).
- **A failed import leaves nothing behind.** The table is never half-loaded: the build fails and
  the application stack goes.
- **One code path.** Seed and masked builds differ only in which file the table is created from.
- **No new function.** The function count is unchanged.

**Harder.**
- **Switching source or subset means a rebuild** of the application stack, which can take tens
  of minutes (ADR-027 *Consequences*).
- **Dev is two stacks**, built in order. The account stack must be up before any data file is
  written.
- **The seed script changes job.** `terraform/bladebook_seed.py` writes items straight into a
  table today, with fixed client IDs. It must instead write an import file and take each test
  account's `sub` by email. *Changed 2026-10-20: the owner removed `terraform/bladebook_seed.py`.
  A new seed script that writes an import file will be written under `infra/` once the IaC tool
  is chosen (ADR-001 A4).*
- **A dev table can't be topped up.** A test that needs one more record means adding it to the
  seed script and rebuilding.

---

## Open

- **Confirm that an import produces no stream records** on the first masked build. If it does,
  the event pipeline must be off until the import finishes.
- ~~**How long the masked file is kept.** It is needed only until the build reads it. The export
  bucket deletes its contents after a day; the masked bucket has no rule yet.~~ **Settled
  2026-10-09 by the owner:** 24 hours (decision 6).
- **Whether the account stack stays up between builds**, or is destroyed with the application
  stack. It holds only test accounts, but their `sub`s are what the data file was remapped to.

---

## Revisit if

- **A test needs real-shaped data and particular seed records together.** Then the transform
  adds the seed items to the masked file before the import. It is still one file and one import,
  so decision 1 holds.
- **Rebuilding to switch source happens often enough that work is skipped** rather than tested
  in dev.
- **DynamoDB gains an import into an existing table.** Decision 1 would still stand for the
  purge, but the loader alternative would need re-weighing.
