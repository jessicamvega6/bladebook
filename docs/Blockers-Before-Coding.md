# BladeBook — Blockers Before Coding

**As of:** 2026-10-13
**Purpose:** What stops code from being written, sorted by how much it blocks. Drawn from
`Open-Pending.md`, the ADRs' Open sections, `Items to ask Kim About.md` and the designs.
`Open-Pending.md` remains the full list; this is the subset that gates code.

There is no application code yet: no `backend/`, `web/` or `infra/` folder.

---

## 1. Before any code at all

These shape the repository and the first commit. Settle them first.

| # | Blocker | Why it blocks | Source |
|---|---|---|---|
| 1 | **Commit the work that isn't in git.** Commit `terraform/` and the uncommitted edits. A root-level `redesign/` folder duplicates `design/redesign/`. | Code built on top of an uncommitted design has no record to point back to, and one bad command loses weeks of decisions. | `git status`, Open-Pending §13 |
| 2 | **Choose the infrastructure tool: CDK or Terraform.** ADR-001 A4 re-opened it and lists the criteria; it hasn't been decided. | It decides the `infra/` folder, the language it's written in, how least-privilege is checked in CI (`cdk-nag` or `checkov`/`tfsec`), and how ADR-021/022's tenant roles are written. Switching gets expensive once anything is deployed. | ADR-001 A4, Open-Pending §1 |
| 3 | **Set up the first CI pipeline.** | ADR-013's test rule (every public class in `core/` has a test, mutation testing on `core/`) only switches on with CI. Code written before it exists isn't held to the rule. | ADR-013 decision 2 |
| 22 | **Set up the AWS Organization** — production and dev accounts, IAM Identity Center, `dev.<domain>` delegated — which needs **a BladeBook domain bought first** (moved here 2026-10-09 from *Before launch*). Before any infrastructure: tables and Cognito users can't move accounts later. | Anything deployed into the wrong account has to be rebuilt. | ADR-027 d8 |

## 2. Before the data layer (`core.data`)

The repository is where every read and write goes, so its shape has to be right first.

| # | Blocker | Why it blocks | Source |
|---|---|---|---|
| ~~4~~ | **Done 2026-10-05: all pass; GSI3 is locked to the coach, so ADR-021 stands.** ~~Write and run ADR-021's database-gate tests~~ (8 checks against a real table in a sandbox account, `bb-gate-test`). Open: does `dynamodb:LeadingKeys` on a GSI3 query check the index's own partition key? | The repository gets its DynamoDB client from the `AccessContext` with per-coach credentials. If the GSI3 check fails, the coach's unpaid list moves to the main table. DynamoDB Local ignores IAM, so this needs a real AWS table. | ADR-021 d7 · how to run: [runbooks/database-gate-tests.md](runbooks/database-gate-tests.md) |
| ~~5~~ | **Done 2026-10-05: all pass; GSI1 is locked to the family, so ADR-022 stands.** ~~Write and run ADR-022's client-gate tests~~ (10 checks). Open: the same index question for GSI1 (now keyed by client), and what a failing conditional write returns with `ReturnValuesOnConditionCheckFailure = ALL_OLD` under an attribute allowlist. | If GSI1 fails, a family's own bookings need a copy under `CLIENT#<sub>`, which changes the booking write. Row 9 decides whether an ArchUnit rule is the only guard against reading another family's booking. | ADR-022 d9 · how to run: [runbooks/database-gate-tests.md](runbooks/database-gate-tests.md) |
| ~~6~~ | **Done 2026-10-05 by ADR-024:** a `LinkedSkater` type plus an ownership condition makes the check structural; failures are logged, and patterns page (thresholds configurable). ~~Make GSI1's link check a shared `core/` function, and decide what a failed check does** (403 only, or log and alert). | Smaller since ADR-022 made reads structural, but client **writes** into a coach's partition still depend on it. It's easier to put in `core/` from the start than to route every handler through it later. | monitoring-questions §1, Open-Pending §9 |
| ~~7~~ | **Done 2026-10-13 (owner):** a coach code is 8 random characters from a set with no look-alikes, `7K2Q-M9XT`; it never expires and the coach can rotate it (ADR-002, amended). A skater's share code is the first 3 letters of their first name and 5 random characters, `MIA-4K7QX` (ADR-026 d4). ~~**Coach code format and lifetime.** The client sign-up note checks at 8 characters, ADR-016 says 5, the designs show 8. Ambiguity-safe characters and expiry are also open.~~ | The `CODE#` key, code generation at sign-up, the family's code-entry screen and the WAF rate limit on lookups all depend on it. | ADR-002 Open, Open-Pending §2 |
| 23 | *Added 2026-10-13.* **Add ADR-031's rows to the gate tests and re-run them:** lesson times, seats, ended seats and the new deadline index (GSI4). The family's read allowlist must cover lesson-time attributes (for availability) and the family's own seat (for retry checks). *Revised 2026-10-13 (ADR-031 revision): also add the rows "the availability read leaves out `pendingLeave`" and "a family session can't change another family's accepted seat".* | ADR-031 changes what a family reads and writes in the coach's records: booking writes a seat, and sharing writes a seat for another family's skater. The gate tests prove what the database refuses, so they need these rows before the booking code is built on them. | ADR-031 Consequences, ADR-021, ADR-022, Open-Pending §2a |
| 24 | *Added 2026-10-13.* **Write the IAM roles of `sched-lesson-roller` and `sched-deadline-sweep`.** Only the sweep may read GSI4, which, like GSI2 and GSI3, is read across coaches. | Both jobs read and write in every coach's records, and the sweep can delete them, so their roles need to be written and checked before the code that runs under them. | ADR-031 d14, Open-Pending §2a |

## 3. Before the API functions

| # | Blocker | Why it blocks | Source |
|---|---|---|---|
| ~~8~~ | ~~**How `api-coach` refuses tokens from the check-in app.**~~ **Closed 2026-10-05 by ADR-023:** check-in joins the coach website and `api-coach`, so there is nothing to refuse and no Lambda authorizer. | — | ADR-019 d3, ADR-023 |
| ~~9~~ | ~~**Confirm the Cognito plan allows a WAF association** on the user pool.~~ **Closed 2026-10-05:** AWS documents that *"AWS WAF web ACLs are available in all user pool feature plans"* ([Cognito developer guide](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-waf.html)). | — | ADR-019 |

## 4. Before specific features

Other work can go ahead while these wait. Each blocks only the feature named.

| # | Blocker | Blocks | Needs | Source |
|---|---|---|---|---|
| 10 | ~~**Hand-edited booking prices.** Re-pricing would overwrite them. Remove per-booking price editing, or mark hand-set prices so they're never re-priced.~~ *Settled 2026-10-13 by the owner: per-lesson price editing is removed (ADR-031).* | Re-pricing on schedule save (MVP feature 6), and per-lesson price editing | Kim, §5 | ADR-020 Open |
| 11 | ~~**Shape of the per-student price.** A fixed price (today it replaces every lesson length, so 60 minutes costs the same as 30), a percentage, or an amount off. Does changing it re-price booked lessons? Can `0` mean free?~~ *Phase 2 since 2026-10-13 (ADR-003); no longer blocks MVP.* | The student price dialog, price resolution at booking, re-pricing | Kim, §5 | ADR-003, ADR-020 |
| 12 | **Large-price-change warning threshold.** | The schedule review's must-acknowledge warning | Kim, §1 | ADR-020 d4 |
| 13 | **Who sends the SMS opt-in confirmation.** No function holds `sns:Publish` where it happens; a stream consumer is suggested. | the coach's late-cancellation text (client SMS is Phase 2) | Owner | ADR-007 d8, ADR-001 A6 |
| 14 | **Toll-free number or 10DLC** for texts, and what each needs from an individual without a registered business. | Sending any real text | Research | ADR-007, Open-Pending §10 |
| ~~15~~ | ~~**Profile photo storage.**~~ **Moved to Phase 2 by the owner, 2026-10-05.** MVP ships without coach photos, so the bucket, upload route and resize step are no longer needed to build. | Nothing in MVP | — | ADR-016 d5 (amended) |
| 16 | ~~**Who sends the decline email** for a rejected student. `consumer-student-link` already receives the removal and is the natural home.~~ *Settled 2026-10-12: `consumer-student-link` sends it (Open-Pending §8).* | Declining a pending student | Owner | ADR-002 2b, ADR-021 d6 |
| ~~17~~ | ~~*Since ADR-025 (2026-10-06) this is per coach: one coach removing a skater who stays with another. 2026-10-13: the skater's lessons with other coaches aren't affected.* **What "remove a student" means:** going forward or retroactive, whether the family can still book, what they see. The designs show one reading.~~ *Phase 2 since 2026-10-13 (owner): every way of removing a student is Phase 2; no longer blocks MVP.* | Nothing in MVP (neither website has a Remove button) | Owner | Open-Pending §8, ADR-025 n |
| ~~18~~ | **Settled 2026-10-08 from Kim (§6): the coach approves each family; the pending step stays.** ~~Whether the coach approves new families at all (Kim §6). If approval goes, the pending flow and ADR-022's "pending sees nothing" rule go with it.~~ | The pending queue, approve/decline, the pending family's home | Kim, §6 | ADR-002 d2, ADR-022 d6 |
| 19 | *Phase 2 (2026-10-12): all client SMS deferred.* **Text-message templates for price changes**, each length-tested. | Re-pricing notifications by text | Owner | ADR-007, ADR-020 |
| 20 | **Unpaid-lesson reminder:** threshold, cadence, repeat. The job is built switched off until set, so this blocks turning it on, not building it. | The weekly unpaid email to the coach | Coach | ADR-018 |
| ~~21~~ | **Done 2026-10-13 (owner):** no cutoff before the lesson; an invitation the family hasn't accepted expires when the lesson starts (ADR-026 P5, ADR-031 d12). ~~**Shared lessons (ADR-026):** when unaccepted invitations lapse.~~ Pricing and the booking family cancelling were settled the same day. | Lapsing unaccepted invitations | Kim, §8 | ADR-026, ADR-031 |

## 5. Before launch, not before coding

These don't stop code but must be done before real families use it.

- **The product's final name**, before SES leaves sandbox, before text registration, before launch. Keep the name and domain in configuration from the first commit. (Open-Pending §1)
- ~~**A BladeBook domain.** The owner holds only `jessicavega.dev`. (ADR-011 Open)~~ *Moved 2026-10-09 to row 22: `dev.<domain>` is needed before any infrastructure.*
- **Legal review:** COPPA, state privacy laws, and every retention window ADR-017 is waiting on. (Open-Pending §8)
- **Deleting a student's data on request**, extended to the archive and Point-in-Time Recovery. *Deferred.* (architecture §7, ~~`design/deletion/`~~ `docs/deletion/`)
- **Restore runbook**, SES bounce and complaint handling, dev test accounts created with the stack (ADR-027), WAF in block mode. (Open-Pending §9–11)

## 6. What can start now

None of this waits on the blockers above:

- **Framework-free logic in `core/`**, written and tested in plain Java: slot expansion from schedule blocks, price resolution, the schedule-change conflict test, recurrence date generation, week arithmetic. ADR-013 wants these driven from a shared JSON fixture that the React side tests against too.
- **The React frontend against the Harbor designs.** `design/harbor/harbor.css` holds the tokens and components, and the demos in `design/harbor/*/demo/` show every page working on sample data.
- ~~**The database-gate tests (items 4 and 5)** need only a real table and IAM roles. They can be written before the IaC choice, and run against a table created by hand.~~ **Done 2026-10-05.**
