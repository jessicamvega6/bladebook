# ADR-024: The Client Write Link Check — Structural, Logged, and Alerted on Patterns

## Status

**Accepted** — 2026-10-05. *Decided by the owner.* Clears blocker #6 in
`Blockers-Before-Coding.md`.

**Settles** `monitoring-questions.md` §1's first two questions and the matching items in
`Open-Pending.md` §9: whether the link check is a shared `core/` function, and what a failed
check does.

**Amends** [ADR-022](ADR-022-client-isolation-at-the-database.md) decision 8 (how the code half
of the write boundary is enforced), [ADR-010](ADR-010-availability-and-reliability.md) decision
4 (one more page), [ADR-012](ADR-012-pii-access-logging.md) (a security event alongside the
access log) and [ADR-013](ADR-013-testing-requirement.md) decision 4 (tests for both).

**Note — 2026-10-06.** [ADR-026](ADR-026-shared-lessons-by-invitation.md) relies on this ADR: an invited skater joins a shared lesson only
through their own family's session and a `LinkedSkater`. `requireActive` currently means an
unapproved skater can't be invited; that may change with Kim's answer (ADR-026 P3).

**Note — 2026-10-07.** ADR-026 P3 is answered by the owner, and `requireActive` stands: a skater
**can be invited** before the coach accepts them, but **can't join** until they're `ACTIVE`. A
**sibling** in the booking family's own family is joined directly by that family's session, with
no invitation, because it holds both skaters; `requireActive` applies to the sibling the same way.

**Note — 2026-10-07, later.** ADR-026 decision 5 adds **one exception** to "a skater is added only
by their own family's session": when the coach accepts an invited skater who wasn't yet their
student, the **coach's own session** joins that skater **automatically** as part of the coach's
Accept, on behalf of a family who confirmed the invitation while signed in. The database confines
that session to the coach's own partition (ADR-021), and the join writes nothing unless the
booking still exists, the lesson hasn't started, there's room, and the booking names that skater
in `invitedStudentId`. *Settled by the owner the same day; no function gains a permission.*
*Replaced by ADR-031 decision 6 (2026-10-13): there is no separate join write. The coach's
Accept turns every one of that skater's `AWAITING_COACH` seats into `BOOKED`, each if its lesson
hasn't started, and ~~re-splits the shares~~ raises each lesson's `shareCount`. See the
2026-10-13 amendment below.* *Revised 2026-10-13 (ADR-031 revision): no share is stored on a
seat, so nothing is re-split; the shares follow from the lesson time's `shareCount`.*

**Amended — 2026-10-07.** [ADR-027](ADR-027-on-demand-dev-environment.md): the alarms are proved in the on-demand **dev** stack; read
"staging" as dev.

**Amended — 2026-10-13.** *Decided by the owner.* [ADR-031](ADR-031-lessons-and-seats.md)
rebuilds booking as **lesson times** and a **seat** for each skater. ~~The one exception to "a
skater is added only by their own family's session" is now this:~~ *Revised 2026-10-13 (ADR-031
revision): there is no exception. No family's action writes another family's records, so the
rule holds for shared lessons as written. The points below say how.*

- **A family's booking creates an `INVITED` reservation seat for another family's skater.** It
  holds only that skater's display name and status (and the invitation's `inviteId` and
  `invitedByClientId`). Nothing of the invited family's can be changed through it (ADR-031
  decision 5). *Revised 2026-10-13 (ADR-031 revision): the invited seat is the **inviting
  family's** record until it is accepted. It has no `clientId` until then. Only the inviting
  family can withdraw it, and only while it is still `INVITED` and `invitedByClientId` is the
  caller. Once accepted (`AWAITING_COACH`), only the invited family, the coach or the deadline
  sweep can end it. If the inviting family cancels their own seat while the invited seat is
  `INVITED` or `AWAITING_COACH`, ~~`consumer-invite` ends it as `WITHDRAWN`~~ *Revised
  2026-10-13 (option B): still `INVITED`, it is the inviting family's own record, so their
  cancel ends it as `WITHDRAWN` in the same transaction; already `AWAITING_COACH`, the cancel
  only sets an `INVITER_LEFT` deadline on it, due at once, and the hourly sweep ends it as
  `WITHDRAWN` (ADR-031 decisions 5 and 12). `consumer-invite` never ends a seat.* So the invited family
  can see it before accepting, `consumer-invite` adds `invitedClientId` and their GSI1 (global
  secondary index 1, by client) keys to it — a read-only copy, not a family's write. The invited family may
  also **decline**, under the same condition as accepting (no `clientId`, `INVITED`, their own
  skater): it is their answer to an invitation addressed to their skater, and moves the seat to
  `SEATEND#` as `DECLINED`.*
- **The invited family converts it on accept**, in their own session, after the link check:
  `requireActive` gives them a `LinkedSkater`, and the seat goes `INVITED → BOOKED` (already
  the coach's student) or `INVITED → AWAITING_COACH` (new to the coach) (ADR-031 decision 6).
  *Revised 2026-10-13 (ADR-031 revision): accepting is the invited family's own write. For a
  skater new to the coach, the check is that the skater is in the caller's own family. Its
  condition is: the seat has **no `clientId`**, is `INVITED`, and its `studentId` is the
  caller's skater. It sets the seat's `clientId` to them. From then on the seat is theirs.*
- **The coach's Accept turns `AWAITING_COACH` seats into `BOOKED`**, in the coach's own session
  and partition (ADR-021), each if its lesson hasn't started. This replaces the automatic join
  of the 2026-10-07 note.
- **A sibling's seat** is written directly by the booking family's session, which holds both
  skaters: `BOOKED`, or `AWAITING_COACH` if the sibling isn't approved yet.
- *Added 2026-10-13 (ADR-031 revision):* **Nothing on the other family's seat changes** when a
  skater joins or leaves. Shares are worked out from the lesson time (ADR-031 decision 7). A leave
  in time is recorded on the lesson time, not on the staying family's seat (decision 8). The
  partner name and status are written by `consumer-invite`, a system function, not by a family
  (decision 6).

Decisions 1–3 are otherwise unchanged. The ownership condition now guards **seats**.

---

## Context

The database-gate tests (2026-10-05) proved the database keeps families apart for **reads**.
**Writes** are only half covered. When a family books, cancels or edits a skater, they write
into their coach's partition. ADR-022 decision 8 confines those writes to the right coach, but
DynamoDB can't confine them to the right family: there is no sort-key condition, and booking
items carry names and contact details, so they can't be narrowed by attribute. A bug in
`api-client` could overwrite or cancel another family's booking with the same coach.

The guard is a code check, the **link check**: is the skater, or the booking, this family's?
`architecture.md` §7 calls it *the one boundary in the system that only code enforces*. Two
questions were open:

1. **Where the check lives.** If each handler has to remember to call it, one forgotten call is
   a gap that passes every honest test.
2. **What a failed check does.** A failure is either a bug or tampering, and the two want
   different responses.

---

## Decision

### 1. The check is structural: a write can't be expressed without it

**New writes take a `LinkedSkater`, not a skater ID.** `core.data` gains a `LinkedSkater` value
holding a skater ID and coach ID, with a **private constructor**. The only way to get one is
`ClientLinks.requireActive(caller, skaterId)`, which reads the family's own link items under
their own tenant session and returns a `LinkedSkater` only if that skater is linked to them and
`ACTIVE`. Every repository method that writes into the coach's partition on a family's behalf
(booking a lesson, a recurring series, editing a skater) takes a `LinkedSkater`. There is no
overload that takes a `String`. A handler that skips the check doesn't compile.

This is the pattern ADR-022 decision 2 already uses for the coach ID (`LinkedCoach`), and that
ADR-012 uses for logging (`AccessContext`).

**Writes to an existing item carry an ownership condition.** Cancelling a lesson, changing a
recurrence, or anything else that updates or deletes an item the family already owns, adds
`clientId = :callerSub` to the write's condition expression, inside the repository method.
DynamoDB then refuses a write to another family's booking in the same step as the write,
however the request was built. Handlers never write the condition themselves.

**An ArchUnit rule holds both in place.** The build fails if:

- anything outside `core.data` constructs a `LinkedSkater`, including through a JSON
  deserializer or framework annotation; or
- `api-client` reaches the coach's partition other than through these repository methods.

Java reflection can still force a `LinkedSkater` into existence. That takes deliberate code
(`setAccessible(true)`) a review would catch, and the ownership condition still protects every
existing booking.

### 2. A failed check is told apart by why it failed

`requireActive` and the ownership condition fail for two different reasons, and they're
handled differently:

| Why it failed | Response to the family | Logged as | Counts toward the alert |
|---|---|---|---|
| **The skater was linked, but isn't `ACTIVE` now:** removed, declined or still pending. Most often the coach changed it while the family had the page open. | A clear message: *"Mia's lessons are no longer available to book. Contact Coach Dana."* (HTTP 409) | An ordinary application event | No |
| **The skater or booking was never this family's** | A plain "not found" (HTTP 404). It doesn't confirm the item exists. | A **security event** | Yes |

The security event follows ADR-012 decision 2's rules: **identifiers only, never values**. It
records the family's ID, the skater or booking ID they asked for, the operation, the request
ID, the source address and the time. It is written by `core.data`, in the same place the check
runs, so no handler can skip or reword it. It goes to the access-log group (ADR-012 decision
6), whose read policy and retention already fit records about minors.

### 3. Alert on a pattern, not on each failure

A single never-linked failure is most likely a bug, and it's in the log to review. A burst from
one family looks like someone probing. So a CloudWatch metric counts the security events, and
**two alarms page**, by the same route as everything else page-worthy (ADR-010 decision 4: SNS
to the owner's phone):

| Alarm | Starting value |
|---|---|
| **One family**, several never-linked failures in a short window | **3 or more in 15 minutes** |
| **Everyone**, across the whole system | **10 or more in a day** |

**Both thresholds and both windows are configuration, not code.** They live in the
infrastructure configuration per environment, alongside the WAF's switches (ADR-019 decision
4a), so they can be changed with a deploy and no code change. The values above are starting
points, to be revisited once there is real traffic.

As with every alarm (ADR-010 decision 4), production keeps these permanently; staging gets them
only temporarily, to prove they fire.

---

## Alternatives considered

- **A check each handler calls.** The status quo. Rejected: correct only as long as every
  handler remembers, and a forgotten call passes every test written with honest data.
- **Refuse silently, no logging.** Rejected: a probing family and a real bug would both go
  unnoticed.
- **Page on every failure.** Rejected: the "was linked, now removed" case is ordinary and would
  page for a coach doing their job. Splitting that case out removes most of the noise, but a
  single never-linked failure is still more likely a bug than an attack.
- **Move bookings into the family's own partition**, so the database could confine writes to
  the family. Rejected in ADR-022 decision 8: it breaks the coach's date-range queries, the
  booking lock and GSI2.

---

## Consequences

- **The one code-only boundary becomes compiler-enforced for new writes and database-enforced
  for existing items.** What remains code-only is the correctness of `requireActive` itself:
  one method, tested directly.
- **A family whose skater was removed mid-session gets an explanation**, not an error.
- **The owner learns about probing** within 15 minutes, and about a slow drip within a day.
- **Two more alarms to prove in staging** before launch, per ADR-010 decision 4.
- **`core.data` gains three types** (`LinkedSkater`, `ClientLinks`, the security-event emitter)
  and one ArchUnit rule.

**Tests** (ADR-013 decision 4):

- `requireActive` returns a `LinkedSkater` for an `ACTIVE` linked skater, and refuses a pending,
  removed, declined or never-linked one with the right reason.
- A cancel or update of another family's booking with the same coach fails on the ownership
  condition, against DynamoDB Local (a condition expression, which DynamoDB Local does honour).
- The ArchUnit rule fails a build that constructs `LinkedSkater` outside `core.data`.
- A never-linked failure writes one security event with identifiers and no values; a
  was-linked failure writes none.

---

## Open

- **Writes to the other family's seat in a shared lesson** (*raised 2026-10-13*). ADR-031 calls
  the invited seat "the one exception ADR-024 allows". But its decisions 6–8 also have one
  family's transaction change the other family's seat: `partnerName` and `partnerStatus` on every
  change, the share re-split when someone joins, and `YOUR_CHOICE` with `answerBy` when someone
  leaves in time. A booking family withdrawing an invitation also removes a seat that carries the
  invited family's `clientId`. Decision 1's ownership condition (`clientId = :callerSub`) would
  refuse each of these as written. How they pass it — a narrower condition, such as
  `invitedByClientId` for a withdraw, or a fixed list of fields one family may set on the
  other's seat — is not yet decided. ~~*Settled 2026-10-13 in ADR-031 decision 5: the exception is
  widened to a fixed list of writes on the other seat in the same lesson, made only by the server
  inside the transaction that changes the caller's own seat (create the invited seat; withdraw it
  while `INVITED` and `invitedByClientId` is the caller; the partner fields; the share on an
  `UNPAID` seat; `YOUR_CHOICE` with `answerBy`). Nothing else on the other seat can change.*~~
  *Withdrawn 2026-10-13 (ADR-031 revision): the exception isn't needed. The owner
  decided that no family's action writes another family's records. The invited seat is the
  inviting family's until accepted, so a withdraw is a write to their own record. The partner
  fields are written by `consumer-invite`. No share is stored on a seat. A leave in time is
  recorded on the lesson time, not on the other seat. So decision 1's ownership condition stands
  with no list of exceptions. The only family write that touches a seat it doesn't yet own is
  accepting an invitation, and that is the invited family's own write after the link check. Its
  condition is: no `clientId`, `INVITED`, and `studentId` is the caller's skater (ADR-031
  decision 5).*

## Revisit if

- The alarms fire on real traffic that turns out to be benign. Tune the thresholds in
  configuration first; if a new benign cause appears, give it its own reason, like the
  "was linked" case.
- ~~A family can be linked to more than one coach (ADR-002 decision 5).~~ *Happened 2026-10-06
  (ADR-025); `LinkedSkater` carries the coach, so the check holds unchanged.* `LinkedSkater` already
  carries the coach ID, so the check holds, but the tags in ADR-022 decision 2 need a look.
