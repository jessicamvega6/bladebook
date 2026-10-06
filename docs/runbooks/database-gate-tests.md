# Runbook: Database-Gate Tests

**Status:** Run 2026-10-05: all checks passed, twice. Blockers #4 and #5 are cleared. Re-run whenever a tenant role's policy changes.
**Clears:** blockers **#4** and **#5** in `Blockers-Before-Coding.md`.
**Source:** [ADR-021](../adr/ADR-021-tenant-isolation-at-the-database.md) decision 7 and
[ADR-022](../adr/ADR-022-client-isolation-at-the-database.md) decision 9.
**Script:** [`database-gate-tests.sh`](database-gate-tests.sh), in this folder.

---

## What this answers

BladeBook relies on DynamoDB itself to keep coaches and families apart, not only on its own
code. Each request runs under a temporary role tagged with who is asking, and the role's
policy only reaches that person's data. DynamoDB Local ignores permissions, so this has to be
proven against a real table.

The run checks 19 rows from the two ADRs (about 40 individual attempts). Most confirm what the
design expects. Three are genuinely unknown:

| Row | Question | If the answer is no |
|---|---|---|
| **021-3** | Does the policy lock a **GSI3** query (the coach's unpaid list) to that coach? | GSI3 comes off the coach role; the unpaid list is read from the main table by date. |
| **022-1b / 022-2b** | Does the policy lock a **GSI1** query (a family's own bookings) to that family? | Every booking also writes a copy under the family's `CLIENT#` partition, in the same transaction. |
| **022-9** | When a family's booking attempt fails because the slot is taken, does DynamoDB hand back the other family's booking? | Nothing changes in the design. It tells you the ArchUnit rule that forbids asking for it is the only guard. |

---

## Cost and safety

- **Cost:** under one cent. An on-demand table with about 12 items and about 60 requests, and
  four IAM roles, which are free. Delete everything at the end (step 8).
- **Scope:** the script only creates and deletes resources named `bb-gate-*`: one table,
  `bb-gate-test`, and roles `bb-gate-exec`, `bb-gate-coach-tenant`, `bb-gate-client-tenant`
  and `bb-gate-code-lookup`. It never touches anything else.
- **Data:** made-up coaches (`coach-a`, `coach-b`), families (`client-a`, `client-b`) and
  `@example.com` addresses. No real data.
- **Your identity:** you run setup, seed and teardown as yourself. Every test runs as one of
  the temporary roles, never as you. A test that can't get its role reports `NOSESSION`
  rather than quietly running with your permissions.
- **Every step asks before it creates or deletes anything** and shows the account and region.

---

## Before you start

You need:

1. **An AWS account where you can create IAM roles and DynamoDB tables.** An administrator
   sign-in is simplest. Use a personal or sandbox account, not one with production data.
2. **The AWS CLI, version 2.13 or newer.** Check with `aws --version`. (Yours was 2.36 on
   2026-10-05.)
3. **`jq`.** It's built into recent macOS; check with `jq --version`, or `brew install jq`.
4. **About 15 minutes.**

The region defaults to `us-east-1`, the region in `architecture.md` §12. To use another, put
`AWS_REGION=us-west-2` in front of each command.

---

## Steps

### 1. Sign in to AWS

If you use IAM Identity Center (SSO):
```
aws sso login --profile <your-profile>
export AWS_PROFILE=<your-profile>
```
If you use access keys, `aws configure` once is enough.

Check you're in the right account:
```
aws sts get-caller-identity
```
The `Account` number is where everything will be created.

### 2. Go to this folder
```
cd docs/runbooks
```

### 3. Create the table and roles
```
./database-gate-tests.sh setup
```
It shows the account, region and your identity, and asks `Continue? [y/N]`. Type `y`.

It creates:

- the table `bb-gate-test` with the same key layout as the real one: `PK`, `SK`, and indexes
  `GSI1`, `GSI2`, `GSI3`;
- `bb-gate-exec`, a stand-in for a Lambda function's execution role. It can switch into the
  tenant roles and has **no DynamoDB permissions of its own**;
- `bb-gate-coach-tenant`, `bb-gate-client-tenant` and `bb-gate-code-lookup`, with the exact
  policies from ADR-021 decisions 2 and 5 and ADR-022 decisions 3, 4, 6, 7 and 8.

It finishes with a 20-second wait so IAM has time to see the new roles. If setup stops partway,
run it again: it keeps whatever already exists.

### 4. Add the sample data
```
./database-gate-tests.sh seed
```
Writes 12 items: two coaches, two families who are both coach A's, one booking each, the
students, the family's link item and coach code `DANA7K2Q`.

### 5. Run the tests
```
./database-gate-tests.sh run
```
Takes about a minute. Each line looks like:
```
PASS  021-3a   expected ALLOW    got ALLOW     OPEN · Query GSI3 for own coach
```
- **PASS**: the database did what the ADR expects.
- **FAIL**: it didn't. See step 7.
- **INFO**: row 022-9, which records an answer rather than passing or failing.
- `got` is **ALLOW** (it worked), **DENY** (AccessDenied), **CONDFAIL** (a condition
  failed), **ERROR** (something else; the message is printed underneath) or **NOSESSION**
  (the role couldn't be assumed).

Lines marked **OPEN** are the unknown questions. The run ends with a summary that answers them
in plain words. Everything is also saved to `gate-results-<date>-<time>.txt` in this folder.

### 6. Read the summary

The summary prints one line per open question. What each means:

| Summary line | What to do |
|---|---|
| *Blocker #4 (GSI3): the index IS locked to the coach.* | Nothing. ADR-021 stands. |
| *Blocker #4 (GSI3): … Take GSI3 off coach-tenant* | The fallback in ADR-021 decision 7: the unpaid list (pattern 11) is served from the main table by date range, filtered on `paymentStatus`. |
| *Blocker #5 (GSI1): the index IS locked to the family.* | Nothing. ADR-022 stands. |
| *Blocker #5 (GSI1): … Use the CLIENT# booking copy* | The fallback in ADR-022 decision 9: each booking also writes a copy under `CLIENT#<sub>` in the same transaction, and cancel, re-price and attendance keep it in step. Needs its own ADR amendment. |
| *Row 9: … DOES NOT LEAK* or *DENIED* | Nothing. The ArchUnit rule is a second guard. |
| *Row 9: … LEAKS* | Expected by ADR-022 decision 8. Keep the ArchUnit rule on `api-client` and give it a test of its own; it is the only guard. |

### 7. If any other row fails

A FAIL outside the open rows means a policy doesn't do what its ADR says. **Don't change the
policy to make it pass** without deciding what the ADR should say. Note the row, then:

| Failing rows | Likely cause |
|---|---|
| **022-5c and 022-11a** (both `GetItem` with a projection) fail, while the `Query` rows with projections pass | DynamoDB may not set `dynamodb:Select` on a `GetItem`, so `StringEquals` on it never matches. The usual fix is `StringEqualsIfExists`, but then check that **022-11c** (no projection) still denies. Record which way it went. |
| **021-7a or 021-7b** allowed | The trust policy's tag conditions aren't holding. A session could start without a `coachId` tag. Serious: fix before building. |
| **021-4v** fails | A denied transaction partly wrote. Not expected from DynamoDB; re-run once to rule out a stale item. |
| Any **DENY** row that came back **ALLOW** | A real isolation gap. Stop and record it before any coach or family code is written. |
| Lots of **NOSESSION** | Roles weren't ready. Wait a minute and run step 5 again. |

### 8. Delete everything
```
./database-gate-tests.sh teardown
```
Asks before deleting, then removes the table and the four roles. Run it even after a failed
run. It's safe to run twice.

### 9. Record the result

1. Keep the results file: rename it `gate-results-<date>.txt` and commit it next to this
   runbook, or paste its summary below.
2. Add a dated amendment to **ADR-021** (decision 7) and **ADR-022** (decision 9) with the
   outcome of the open rows, following the ADR convention in `architecture.md` §11.
3. In `Blockers-Before-Coding.md`, strike through **#4** and **#5** with the date, or replace
   them with the fallback work if an index wasn't locked.
4. Tell Claude the summary lines. The C4 map, the repository design and any fallback ADR
   follow from them.

---

## Troubleshooting

| Message | Fix |
|---|---|
| `not signed in to AWS` | Step 1. With SSO, sessions expire; run `aws sso login` again. |
| Setup stopped partway | Run step 3 again. It keeps a table or role that already exists and only creates what's missing. |
| `IAM doesn't see the new role yet; waiting…` | Normal. IAM takes a few seconds to recognise a new role; setup retries for up to a minute. |
| `MalformedPolicyDocument … Invalid principal` and setup stops | IAM took over a minute. Run step 3 again. |
| `could not assume bb-gate-exec` | Your identity can't assume roles in this account, or IAM is still propagating. Wait a minute; if it persists, sign in as an administrator. |
| `ExpiredToken` partway through a run | The temporary sessions last an hour. Just run step 5 again. |
| `Unknown options: --return-values-on-condition-check-failure` | The AWS CLI is too old. Update it (`brew upgrade awscli`). |

---

## What the script mirrors, and what it doesn't

- **Mirrors:** the key layout, the three indexes, and the policies as written in ADR-021 and
  ADR-022 on 2026-10-05. If those policies change, update the script before re-running.
- **Simplifies:** the real execution roles are Lambda roles; here `bb-gate-exec` stands in,
  assumed by you. The trust conditions on the tenant roles are the same. Source identity and
  session names (ADR-021 decision 8) aren't tested; they don't affect access.
- **Doesn't cover:** the code-level checks (the client link check, ADR-012's `AccessContext`,
  the ArchUnit rules). Those are ADR-013's tests, written with the code.

---

## Results

### 2026-10-05, account 307202557124, us-east-1

**45 passed, 0 failed.** File: [`gate-results-20261005-174949.txt`](gate-results-20261005-174949.txt).

- **Blocker #4 (GSI3): locked to the coach.** ADR-021 stands as written.
- **Blocker #5 (GSI1): locked to the family.** ADR-022 stands as written.
- **Row 9: refused with an access error.** The first run only matched the word in a debug log,
  so the script gained a control check and was re-run.

### 2026-10-05, second run (row 9 confirmation)

**46 passed, 0 failed.** File: [`gate-results-20261005-175359.txt`](gate-results-20261005-175359.txt).

- **022-9a (control):** booking client B's taken slot with no return option fails its
  condition, so the write itself is allowed.
- **022-9b:** the same attempt with `ReturnValuesOnConditionCheckFailure = ALL_OLD` is refused
  with `AccessDeniedException`.
- **Conclusion:** the `client-tenant` policy blocks the leak at the database. ADR-022 decision 8
  amended; the ArchUnit rule stays as a second guard.
