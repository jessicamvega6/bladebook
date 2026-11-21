# Runbook: Database-Gate Tests

**Status:** Run 2026-11-20 against dev's real table and deployed tenant roles: **76 passed, 0 failed**
([`gate-results-20261120-155510.txt`](gate-results-20261120-155510.txt)). Re-run whenever a tenant role's policy, the
family allowlist (`backend/core/src/main/resources/bladebook/client-read-allowlist.json`) or the key layout changes.
**Clears:** blockers **#4**, **#5** and **#23** in `Blockers-Before-Coding.md`; closes G-26 and SC-3 in the root
`README.md`.
**Source:** [ADR-021](../adr/ADR-021-tenant-isolation-at-the-database.md) decision 7 and
[ADR-022](../adr/ADR-022-client-isolation-at-the-database.md) decision 9; ruling I11 (`AI/plan-history.md`).
**Script:** [`database-gate-tests.sh`](database-gate-tests.sh), in this folder.

---

## What this answers

BladeBook relies on DynamoDB itself to keep coaches and families apart, not only on its own code. Each request runs
under a temporary role tagged with who is asking, and the role's policy only reaches that person's data. DynamoDB Local
ignores permissions, so this has to be proven against a real table. (Local mode plays the family roles' policies too,
`LocalFamilyPolicy`, so the backend's tests catch most mistakes first; this run is the proof.)

**Since 2026-11-20 (I11) it tests the real thing:** dev's table and the roles CDK deployed
(`infra/lib/tenant-roles.ts`), read from the stack's outputs. Nothing is copied. Before, the script built its own
table and roles from policies pasted from the ADRs, in a sandbox account; those runs are under Results, below.

---

## How it works

- **The records are the seed's.** Dev's table is created from the seed file (ADR-028), so the script picks, by key
  only, coach A (the coach whose booked seats come from the most families), families A and B (two of them), coach B,
  two of coach A's lesson times, an `ACTIVE` and a `PENDING` skater, coach A's code and a share code. Nothing personal
  is printed or saved: the results file holds row names and outcomes only.
- **Every test runs as a tenant session**, started from `bladebook-dev-gate-test`. That role exists in dev only, you
  sign into it, and it can do nothing but start tenant sessions under the same tag rules as the APIs. It has no
  DynamoDB access of its own (row 021-8 proves it). An infra test keeps it, and the tenant roles' trust in it, out of
  production.
- **Your own sign-in** only reads the stack's outputs, lists the table's keys to pick the records, and deletes what the
  run wrote.
- **The run writes very little, and deletes it:** `TEST#…` items (no event consumer matches them, so no email or
  event follows) and one `CODE#GATE…` code claim. Writes that should be refused carry a condition that can't pass, so
  even a wrongly allowed one changes nothing. Everything listed is deleted when the run ends, even if it fails;
  `clean` removes leftovers of an interrupted run.
- **Cost:** a fraction of a cent.

---

## Steps

### 1. Sign in to dev
```
aws sso login --sso-session bladebook
export AWS_PROFILE=bladebook-dev
```
Dev's app stack must be deployed (`infra/README.md`), since the script reads its outputs (`TableName`, the three tenant
role ARNs and `GateTestRoleArn`).

### 2. Run it
```
docs/runbooks/database-gate-tests.sh run
```
About a minute. Each line looks like:
```
PASS  022-14d  expected DENY     got DENY      BatchGetItem with a key in coach B
```
`got` is **ALLOW** (it worked), **DENY** (AccessDenied), **CONDFAIL** (a condition failed, as expected for rows 9a and
12), **ERROR** (something else; the message is printed underneath) or **NOSESSION** (a role couldn't be assumed).
The results are saved to `docs/runbooks/gate-results-<date>-<time>.txt`.

### 3. If it stopped partway
```
docs/runbooks/database-gate-tests.sh clean
```
Deletes any `TEST#…` item and `CODE#GATE…` claim left in the table.

### 4. If a row fails

A FAIL means a deployed policy doesn't do what its ADR says. **Don't change the policy to make it pass** without
deciding what the ADR should say. Note the row, then:

| Failing rows | Likely cause |
|---|---|
| Any **DENY** row that came back **ALLOW** | A real isolation gap. Stop and record it. |
| **021-7a or 021-7b** allowed | The trust policy's tag conditions aren't holding. Serious: fix before anything else. |
| **021-4v** or **022-12v** fail | A refused transaction partly wrote. Not expected from DynamoDB; run `clean` and re-run once. |
| An **ALLOW** row on a read came back **DENY** | The allowlist is missing an attribute the code needs (`client-read-allowlist.json`). The backend's local policy would usually have caught it first. |
| Lots of **NOSESSION** | The gate role or the tenant roles changed moments ago. Wait a minute and run again. |

### 5. Record the result

Commit the results file next to this runbook, update the Status line above, and add the outcome to ADR-021 decision 7
and ADR-022 decision 9 if a row's answer changed.

---

## The rows

**ADR-021 decision 7** (as coach A's `coach-tenant` session): 1a–1b own profile and partition allowed; 2a–2e coach B
refused for every action; 3a–3b GSI3 locked to the coach; 4 a transaction across two coaches refused whole, 4v nothing
of it written; 5 own item plus a `CODE#` claim allowed; 6a–6e `CLIENT#` writes, GSI1, GSI2, GSI4 and `Scan` refused;
7a–7b a session without the `coachId` tag, or with an extra tag key, refused; 8 the gate role's own credentials refused.

**ADR-022 decision 9** (as family A's `client-tenant` sessions): 1–2 own partition and GSI1 allowed, family B's
refused; 3 lesson times and the weekly schedule with allowlisted fields allowed; 4 `pendingLeave`, a seat's
`studentName` or `clientId`, or no projection refused; 5 a `PENDING` session reads nothing of the coach, an `ACTIVE` one
reads the profile's public fields but not `loginEmail`; 6 coach B refused; 7 a conditional write into coach A allowed,
into coach B refused; 8 `ReturnValues ALL_OLD` refused; 9 a failing write onto family B's seat: without a return option
it fails its condition (the write is allowed), with `ReturnValuesOnConditionCheckFailure ALL_OLD` it's refused, so
nothing leaks; 10 the first session (no coach tag) reads nothing of the coach; 11 `code-lookup` reads a code's name
fields only, and the first session resolves a code's `coachId`; 12 a transaction naming a `PENDING` skater refused
whole, 12v nothing written; 13 the share-check reads `studentStatus` only, while `ACTIVE`; 14 `BatchGetItem` of lesson
times with the allowlist only, in coach A only, while `ACTIVE`; 15 the seats' keys can be listed (accepted risk: skater
IDs, no names); 16 family B's seat details refused, the family's own seat's `idempotencyKey` allowed; 17 GSI1 returns the
family's own seats in full and nothing of family B's.

**ADR-MASTER §16 and I30:** sc-1a–1d a share code gives its `studentId` and `studentName` only, and not to
`code-lookup`; gsi4 a family can't query GSI4; i30-a own items plus one coach's in a transaction through that coach's
session (waiting) allowed; i30-b the same through the first session refused.

**Not a database row:** "a family session can't change another family's accepted seat" (Blocker 23). Writes into the
coach's partition can't be limited by family (ADR-022 decision 8); that stays the code's link check, in ADR-013's
cross-tenant tests.

---

## Results

### 2026-11-20, dev (793581837527), us-east-1, the real table and deployed roles

**76 passed, 0 failed.** File: [`gate-results-20261120-155510.txt`](gate-results-20261120-155510.txt).

- Every ADR-021 and ADR-022 row holds against the deployed roles, including ADR-022's 2026-11-17 allowlist,
  `BatchGetItem` (row 14) and the share-check (row 13).
- **Row 15, as accepted:** 15 seat keys of coach A came back to family A, with skater IDs and no names.
- **Row 9:** with `ALL_OLD` on failure the write is refused by IAM, as in 2026-10.
- **I30:** a family's write into a coach's partition works only through that coach's session, which is why
  registration now writes one coach at a time.

### Earlier: 2026-10-05, a sandbox account with copied policies

46 passed, 0 failed, over two runs ([`gate-results-20261005-174949.txt`](gate-results-20261005-174949.txt),
[`gate-results-20261005-175359.txt`](gate-results-20261005-175359.txt)). GSI3 locked to the coach (Blocker #4), GSI1
locked to the family (Blocker #5), and row 9 refused by IAM. Those runs used the 2026-10 key layout (`SLOT#`,
`BOOKING#`), which no longer exists.
