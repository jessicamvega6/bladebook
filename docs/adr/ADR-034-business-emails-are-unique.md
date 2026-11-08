# ADR-034: Business Emails Are Unique

## Status

**Accepted** — 2026-11-08. *Decided by the owner.*

**Amends** [ADR-016](ADR-016-coach-signup.md) (the business email and its list of addresses,
amended 2026-10-13 and 2026-11-06), [ADR-021](ADR-021-tenant-isolation-at-the-database.md)
decision 5 (a second narrow statement outside the coach's partition, and two gate-test rows),
[ADR-023](ADR-023-rinkside-check-in-joins-the-coach-website.md) decision 10 (`auth-post-confirmation`
also looks up whether an address is someone's login email), [ADR-001](ADR-001-backend-stack.md)
(that function's role, and `api-coach` may call it) and [ADR-013](ADR-013-testing-requirement.md)
(the tests below).

---

## Context

A coach's `businessEmail` is the `Reply-To` on every email families get (ADR-016 decision 8), and
the address families see when the coach switches it on (decision 7a). Login emails are already
unique, because Cognito refuses a second account with the same username, and since ADR-016
decision 10 it ignores case. **Nothing made business emails unique.** Two coaches could put the
same address on their profiles, and families of both would reply into one inbox with nothing to
say which coach they meant.

The owner ruled that a business email must belong to one coach only, and must not be another
person's login email either.

---

## Decision

### 1. One business email, one coach

**No two coaches have the same business email**, and **a coach's business email can't be another
person's login email**, whether that person is a coach or a family. A coach can always use their
**own** login email. Addresses are compared in lowercase (ADR-016 decision 10).

This covers every address in the coach's list on the profile (ADR-016, amended 2026-10-13), not
only the one in use, so an address one coach keeps in reserve can't be picked up by another.

### 2. A claim record makes it a database guarantee

Each address a coach holds has a claim record:

| Key | Value |
|---|---|
| `PK` | `BIZEMAIL#<address>`, lowercase |
| `SK` | `CLAIM` |
| `coachId` | The coach who holds it |

- **Written** with the condition `attribute_not_exists(PK) OR coachId = :me`, in the same
  transaction that adds a confirmed address to the coach's list. At sign-up that is when the link
  is confirmed, or straight away when the coach picks *Use my login email*. If the condition fails,
  nothing in the transaction is written.
- **Removed** when the coach removes the address from the list, with the condition
  `coachId = :me`, and when the coach's account is closed (`docs/deletion` needs this case).
- **Not written for an address waiting on its link.** Two coaches can both be sent a link for
  the same address; the first to confirm holds it, and the second is refused at confirmation.

This follows ADR-021 decision 5's pattern for the `CODE#` item. The `coach-tenant` role gets one
more narrow statement:

- `PutItem`, `DeleteItem` and `ConditionCheckItem`, with `dynamodb:LeadingKeys` like `BIZEMAIL#*`;
- `dynamodb:Attributes` limited to `PK`, `SK` and `coachId`, and `ReturnValues` limited to `NONE`;
- **no `GetItem` or `Query`.** The coach never reads a claim; the conditional write is the check.

**The residual risk, as with `CODE#`:** a bug could delete another coach's claim. That reads
nothing and exposes nothing; at worst a second coach could then claim the address. The
`coachId = :me` condition on the delete guards against it in code.

### 3. Whether an address is someone's login email is asked of Cognito

Login emails live in Cognito, not the table, so the claim record can't see them. Before a link is
sent, and again before a confirmed address is added, **`api-coach` asks `auth-post-confirmation`**
whether the address is someone's login email. The function looks the address up in the user pool
(`cognito-idp:AdminGetUser`, which accepts an email in this pool) and answers only one of three
things: **free**, **the caller's own**, or **someone else's**. It returns no name, status or other
detail.

- **`api-coach` still holds no Cognito permission.** It gets `lambda:InvokeFunction` on that one
  function only. The only function that can read the user pool is the one that already writes to
  it, so a fault in `api-coach` can't list or read accounts.
- **`auth-post-confirmation`'s role gains `cognito-idp:AdminGetUser`** on this user pool only,
  beside `AdminAddUserToGroup`. BladeBook stays at seventeen functions.
- An unconfirmed account counts: its address is taken until it is deleted (ADR-016 decision 11).

### 4. What the coach sees

When an address is taken, by another coach's claim or by someone's login email, the coach is told
*"That email is already used on BladeBook. Please use a different one."* No link is sent. The
message doesn't say whether the address belongs to a coach or a family.

**At sign-up**, if *Use my login email* fails because another coach already claimed that address
as their business email, the coach is asked for a different business email. This happens only
when two people share one inbox.

### 5. What is not checked

**A new sign-up, or a family changing their login email, is not refused because the address is
already a coach's business email.** Those requests go from the website straight to Cognito, and
refusing them would need a Cognito pre-sign-up trigger (a new function). The person has also
proved they own the inbox by confirming the code sent to it. So the rule holds when a business
email is chosen, not forever after.

---

## Consequences

- **Replies always reach one coach.** Every `Reply-To` names an inbox only one coach can use from
  BladeBook.
- **Two coaches at one club can't share a lessons address** (`lessons@club.com`). The second must
  use another address. Whether coaches do this is a question for Kim (`Items to ask Kim About.md`
  §14).
- **A coach can test whether an address has a BladeBook account**, by trying it as a business
  email. Coach accounts are self-serve (ADR-016 decision 1), so anyone can. It is the same exposure
  as the sign-up page (ADR-016 Open), and is settled with it.
- **One function now serves three callers**: Cognito's post-confirmation call, the add-coaching
  route (ADR-016 decision 12) and `api-coach`'s lookup. Each is tested separately; its name now
  describes only the first.
- **New code in Batch 1's profile and sign-up paths.** The confirm-link and *Use my login email*
  writes gain the claim, and the remove-address write gains the delete.

**Tests** ([ADR-013](ADR-013-testing-requirement.md)):
- A second coach's claim on an address the first holds fails, and nothing in its transaction is
  written. The same coach claiming its own address again succeeds.
- An address that is another account's login email is refused before a link is sent and again at
  confirmation. The coach's own login email is allowed.
- Case: `Kim@Rink.com` and `kim@rink.com` are the same address in every check.
- Removing an address deletes its claim, and another coach can then claim it.
- The lookup returns only free, the caller's own or someone else's, never account details.
- ADR-021's gate tests gain two rows: coach A's session can put and delete a `BIZEMAIL#` claim
  in a transaction with `COACH#A/PROFILE`; it cannot `GetItem` or `Query` a `BIZEMAIL#` item.

---

## Open

- **A limit on lookups per coach.** Decision 4's message lets a signed-in coach test addresses one
  at a time. A cap such as 10 new business-email links per coach per day would stop anyone using
  it as a lookup tool. Settle with ADR-016's Open item on the sign-up page.
- **Whether two coaches at one club need to share an address** (Kim §14). If they do, this ADR
  needs a way for one coach to let another use theirs.

---

## Revisit if

- **Coaches at one club ask to share an address.** That would turn the claim into a shared one,
  with consent from the coach who holds it.
- **A Cognito pre-sign-up trigger is added for another reason.** Decision 5's gap could then be
  closed at no extra cost.
- **Login emails move into the table** (for example, a record per account). Decision 3's Cognito
  lookup could then become one more conditional check in the same transaction.
