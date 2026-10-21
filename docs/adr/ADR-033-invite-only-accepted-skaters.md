# ADR-033: Only a Coach's Accepted Skaters Can Share a Lesson

## Status

**Accepted** — 2026-10-20. *Decided by the owner*, after the architecture review of the same
day (`docs/reviews/architecture-review-2026-10-20.md`, part P4 and gap G16).

**Amended — 2026-10-20, later.** *Decided by the owner.* The Open question is settled: a
**share-check endpoint** on `api-client` tells the booking page whether the invited skater is on
the coach's student list, as soon as the code is entered (decision 2a). Adds `studentStatus` to
`client-tenant`'s read allowlist for `STUDENT#` items, with a gate-test row.

**Moves to Phase 2** the way a skater who isn't yet the coach's student joins the coach's roster
through a shared-lesson invitation (the consent link). It isn't removed from the design: the
mechanics in the ADRs below are kept as the record of what Phase 2 builds.

**Supersedes, for MVP:**

- [ADR-026](ADR-026-shared-lessons-by-invitation.md) decision 5's rule underneath (*"A family can
  invite a skater the coach hasn't accepted"*), step 2's consent-link email, step 5 (a skater new
  to the coach goes down the coach-code route and joins on the coach's Accept), and the
  `AWAITING_COACH` cases; decision 5a's warning and banner; and the owner's answer to Kim §8
  question 4 (2026-10-07).
- [ADR-031](ADR-031-lessons-and-seats.md) decision 5's `AWAITING_COACH` sibling seat, the accept
  check for "a skater new to the coach", the `INVITER_LEFT` case; decision 6's "new to the coach"
  path and the coach's Accept turning `AWAITING_COACH` seats into `BOOKED`; and decision 12's
  `WARN` and `INVITER_LEFT` deadlines, the 9pm warning timing and the late-confirmation rule.
- [ADR-002](ADR-002-client-registration.md)'s amendment of 2026-10-07: an invitation is no longer
  a second way onto a coach's roster in MVP. The coach code is the only way.
- [ADR-025](ADR-025-many-coaches-per-skater.md)'s amendment of 2026-10-07: an invitation is no
  longer a way to add a coach in MVP.

**Amends** [ADR-024](ADR-024-client-write-link-check.md) (every accept goes through
`requireActive`, with no "skater in the caller's own family" alternative),
[ADR-022](ADR-022-client-isolation-at-the-database.md) decisions 6 (`studentStatus` on the read
allowlist, decision 2a) and 9,
[ADR-019](ADR-019-waf-in-mvp.md) (the share-code rate rule covers the share-check route; *since 2026-10-20 that is decision 2's code-lookup rule, widened*),
[ADR-012](ADR-012-pii-access-logging.md) (the share-check route is logged), and
[ADR-021](ADR-021-tenant-isolation-at-the-database.md) decision 7 (one more gate-test row), and
[ADR-010](ADR-010-availability-and-reliability.md) (the sweep's work shrinks; its alarm is
unchanged).

Every other behaviour rule in ADR-026 and ADR-031 still holds: share codes, the share box on
times that allow 2 or more skaters, the invited seat holding the place, the invited family
confirming while signed in, the price split, leaving in time or late, the staying family's
answer, freed places, the hourly sweep, and the read-only copies `consumer-invite` writes.

*Amended 2026-10-20, later: also amends ADR-001 (the sweep's role and triggers) and ADR-013 (the
tests in Consequences); the supersede list also covers ADR-031 d2's `seatStatus`, d7, d10 and
d14, and ADR-026's Consequences. ADR-021 decision 7 gains two gate-test rows, not one.*

*Related owner decisions, 2026-10-20: the share-code read returns `studentId` and the display
name to `api-client` (ADR-022, ADR-026 d4); the share-code lookup is a logged read (ADR-012).*

---

## Context

Under ADR-026 decision 5, a family could invite a skater the coach hadn't accepted. The invited
family's email doubled as a consent link: following it and confirming added the skater to the
coach's roster as `PENDING`, and the coach's Accept then joined them to the lesson. That path
brought a seat state of its own (`AWAITING_COACH`), a warning sent at the 9pm run before the
lesson with banners on both families' Home pages, an `INVITER_LEFT` deadline for an inviting
family that cancels first, an expiry email asking the family to get accepted, and an accept
check that didn't go through `requireActive`.

The architecture review found two problems with it at BladeBook's scale:

- **It is most of the shared-lesson complexity** (P4): a seat state, two of the four deadline
  kinds, a warning schedule, banners and three extra emails.
- **It lets a stranger reach a child's details** (G16). With a free coach account, a free family
  account and a child's share code, which never changes and is passed between families by design,
  a stranger could send that family a BladeBook-branded *"join Coach X's roster"* email. If the
  family confirmed, the skater became `PENDING` with that coach, and the coach's approval screen
  shows the guardian's name and email and the skater's registration number.

Families who want to share a lesson with a coach's new skater have a simpler route: that family
signs up with the coach's code first, as every family does.

---

## Decision

### 1. Only a skater the coach has accepted can be added to a lesson

A skater can be put in a shared lesson only if they are **`ACTIVE` with that lesson's coach**:

- **by invitation** (a share code at booking, or a one-lesson invite on a freed place); or
- **as a sibling** in the booking family's own family.

There is no seat that waits for the coach. `AWAITING_COACH` is not a seat status in MVP;
`seatStatus` is `INVITED | BOOKED | CHECKED_IN | NO_SHOW`.

### 2. The check is made at booking, by the database

The booking transaction that puts the invited seat also checks the invited skater's record:

- a **`ConditionCheckItem` on `COACH#<coachId>/STUDENT#<studentId>`**, condition
  `studentStatus = ACTIVE`, in the same transaction as the lesson-time update, the booking
  family's seat and the invited seat;
- `client-tenant` already allows `ConditionCheckItem` in the coach's partition (ADR-022 decision
  8), so **no policy change** is needed;
- a failed check fails that date's transaction and returns nothing about the item
  (`ReturnValuesOnConditionCheckFailure` is never used on the client path, ADR-022).

The skater's ID comes from the share-code record, read by `api-client` and never returned to the
browser (ADR-026 decision 4).

**What the family sees:** if the code belongs to a skater who isn't the coach's student, the
booking stops at the share step with *"Mia R. isn't one of Coach Dana's students yet. Mia's
family can sign up with Coach Dana's code, and once Coach Dana accepts Mia you can share a
lesson."* Nothing is booked.

A sibling not yet accepted by the coach is shown on the booking page as **not available to add
until Coach Dana accepts them**, and can't be picked.

### 2a. The booking page asks first: the share-check endpoint

*Added 2026-10-20, decided by the owner.* So the family learns at the share step, not when the
booking is sent, `api-client` has one more route:

```
POST /api/client/share-check
{ "shareCode": "MIA-4K7QX", "coachId": "<the coach of the lesson being booked>" }
→ 200 { "displayName": "Mia R.", "onCoachRoster": true | false }
→ 404 when the share code doesn't exist
```

It takes the three things the check needs:

- **The person sending the invite** comes from the verified token (`clientId = sub`), never the
  request body (§7). The caller must have a skater `ACTIVE` with that coach: the coach ID becomes
  a `LinkedCoach` only through the family's own links (ADR-022 decision 2), and the second
  session must carry `linkStatus = ACTIVE`. Anything else is the ordinary 404.
- **The invited skater** is named by the share code, the only handle the inviting family has.
  `api-client` resolves it to the skater's ID with the share-code read (ADR-026 decision 4). The
  ID is never returned.
- **The coach** is the coach of the lesson being booked.

It then reads `COACH#<coachId>/STUDENT#<studentId>` with `Select = SPECIFIC_ATTRIBUTES` and the
projection `studentStatus`, in the caller's tagged session. **`onCoachRoster` is true only for
`ACTIVE`.** A `PENDING` skater and a skater the coach has never had both answer false, so the
response doesn't say whether a request is waiting.

- **Permission:** `studentStatus` joins `client-tenant`'s read allowlist (ADR-022 decision 6).
  It is readable only in the caller's own coach's partition, only for an `ACTIVE` family, and
  only by key; a family can't list `STUDENT#` items or read any other field of them. The gate
  tests gain rows: the projection `studentStatus` is allowed; any other `STUDENT#` attribute is
  still refused; a `PENDING` session is refused.
- **Rate limit:** the firewall's share-code rule (ADR-019, 20 per 5 minutes per address) covers
  the route, as it does the plain code lookup. *(Amended 2026-10-20: that is ADR-019 decision 2's
  code-lookup rule, widened to both share-code routes; no separate rule.)*
- **Logging:** a display name is a child's personal data, so the route writes an access-log
  line like the share-code lookup (ADR-012).
- **The booking transaction's check (decision 2) stays the authority.** The endpoint is advice
  for the screen; a skater declined between the check and the booking is still refused there.

*Amended 2026-10-20.* *Decided by the owner.* **Book stays disabled while the share-code box has
anything in it, until the share-check for that exact code and coach answers `onCoachRoster: true`.**
That covers a code still being typed, a check in flight, a 404, the skater's own code,
`onCoachRoster: false`, and a failed or rate-limited check (*"Couldn't check that code. Try
again."*). Changing the code, or the picks' coach, clears the answer and checks again. Clearing the
box allows a private booking. This is a screen rule only; the booking transaction's
`ConditionCheckItem` (decision 2) stays the authority.

### 3. Accepting always goes through the link check

The invited family accepts in their own session after **`ClientLinks.requireActive`** gives them
a `LinkedSkater` for their skater (ADR-024). The accept condition is unchanged otherwise: the
seat has no `clientId`, is `INVITED`, and its `studentId` is the caller's skater. On success the
seat goes **`INVITED → BOOKED`**, if the lesson hasn't started, and the lesson time's
`shareCount` goes up.

If the skater stopped being `ACTIVE` between the invitation and the answer (in MVP that means
the coach declined them, which deletes the record), `requireActive` refuses with ADR-024's
ordinary "no longer available" message.

### 4. What the inviting family's cancel does

- **The invited seat is still `INVITED`:** it is the inviting family's own record, so their
  cancel ends it as `WITHDRAWN` in the same transaction (unchanged, ADR-031 decision 5).
- **The invited family has accepted:** the seat is `BOOKED` and theirs, so the inviting family's
  cancel is an ordinary leave of a shared lesson, in time or late (ADR-031 decision 8).

There is no third case, so there is **no `INVITER_LEFT` deadline**.

### 5. The deadline sweep keeps two kinds

`dueKind` is **`EXPIRE | ANSWER`**:

| `dueKind` | On | When |
|---|---|---|
| `EXPIRE` | Invited seat still `INVITED` | The lesson's start |
| `ANSWER` | Lesson time with a pending leave | The pending leave's `answerBy` |

`sched-deadline-sweep` still runs **hourly**, still uses GSI4, and keeps its missed-run alarm.
**The shared-lesson warning, its 9pm timing, the late-confirmation rule and both families' red
banners are gone**: they existed only for a seat waiting on the coach.

### 6. Emails

`consumer-invite` still sends the invitation and the outcome emails. Gone from MVP:

- the consent-link version of the invitation (*"Coach Dana needs to accept you first…"*);
- the warning to both families and the coach;
- the expiry email asking the family to be accepted onto the coach's roster;
- *"no longer available after the coach's Accept"*;
- the coach-declined outcome for an invited skater.

An invitation that reaches the lesson's start unanswered expires with the ordinary *"no longer
available"* email.

### 7. Phase 2: the consent-link roster join

**Moved to Phase 2, not removed.** The design in ADR-026 decision 5 (steps 2, 5 and the
`AWAITING_COACH` closes), decision 5a, and ADR-031 decisions 5, 6 and 12 is the starting point
when it returns. Before it does, G16 needs an answer, for example letting families rotate share
codes and saying plainly in the email that this is a coach they don't have yet.

**Bring it back when** families or coaches report that signing up with the coach code before
sharing a lesson is a burden.

---

## Alternatives considered

- **Keep the consent link as designed** (ADR-026). Rejected: the complexity and G16 above, for a
  step a family can do with the coach code.
- **Remove it outright.** Rejected by the owner: it may be wanted later, so it is recorded as
  Phase 2 with its design kept.
- **Coach-arranged sharing** (the coach adds the second skater). Not chosen: it needs a coach
  booking for a family, which is Phase 2, and it drops the second family's in-app consent before
  their skater is added and charged.
- **Check the invited skater when the code is entered, by reading their record.** Needs
  `studentStatus` on `client-tenant`'s read allowlist, a new read in the coach's partition. The
  transaction check in decision 2 needs no new permission. Whether the share step can show the
  result before the confirm pop-up is Open. *Chosen 2026-10-20 (decision 2a), alongside the
  transaction check, not instead of it.*
- **A dry-run transaction holding only the `ConditionCheckItem`** (2026-10-20). Needs no new
  permission, but whether DynamoDB accepts a transaction with no write is unconfirmed, and a
  check that fails as a cancelled transaction is awkward to read as a yes-or-no answer. Turned
  down for decision 2a's plain read.

---

## Consequences

- **Gap G16 is closed for MVP.** A share code reaches only a skater the coach has already
  accepted, so an invitation can't put a family on a stranger's roster.
- **Simpler shared lessons:** one seat state, two deadline kinds, no warning schedule, no
  banners and five fewer emails. The function count is unchanged: `consumer-invite` and
  `sched-deadline-sweep` both stay.
- **The coach's Accept no longer touches seats.** It changes only the `STUDENT#` item, as for
  any new skater.
- **A family can't share with a skater new to the coach** until that family signs up with the
  coach's code and the coach accepts them.
- **Gate-test rows** (ADR-021 decision 7, ADR-022 decision 9): a booking transaction whose
  invited seat names a skater who isn't `ACTIVE` with the coach is refused whole; and, for
  decision 2a, a `GetItem` of a `STUDENT#` item projecting only `studentStatus` is allowed for an
  `ACTIVE` session, refused with any other attribute, and refused for a `PENDING` session.
  *Amended 2026-10-20: and for ADR-022's widened share-code read, a `GetItem` of `SKATERCODE#`
  returns `studentId` and the display name only; any other attribute, no projection, or a `Query`
  is refused.*
- **ADR-013 tests:** the sibling and invited-skater checks refuse a `PENDING` skater; a skater
  declined between invitation and answer can't accept; an inviting family's cancel after the
  invited family accepted is an ordinary leave.
- **Designs to revisit:** the Harbor screens for inviting a skater new to the coach
  (`design/harbor/client/static/invite-new-student.html` and the demos), the warning banners, and
  the coach's pending list showing shared-lesson context. *Done 2026-10-20: those pages are
  removed, and `book-share-not-student`, `book-share-sibling-waiting` and `invite-accepted` show
  the new behaviour.*

---

## Open

- ~~**How the share step tells the family before the confirm pop-up.** The decision 2 check runs
  when the booking is sent. Showing *"isn't one of Coach Dana's students yet"* as soon as the
  code is typed needs either a dry-run transaction holding only that `ConditionCheckItem` (to be
  confirmed that DynamoDB accepts one) or the allowlist change in Alternatives.~~ *Settled
  2026-10-20 by the owner:* the share-check endpoint (decision 2a).

## Revisit if

- Families or coaches report that signing up with the coach code before sharing is a burden
  (decision 7).
- A coach booking for a family arrives (Phase 2), which would make coach-arranged sharing cheap.
