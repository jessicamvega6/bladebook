# ADR-025: Skaters and Coaches Are Many-to-Many

## Status

**Accepted** — 2026-10-06. *Decided by the owner.*

**Supersedes** [ADR-002](ADR-002-client-registration.md) decision **5** (*"Students are scoped
to a single coach for MVP"*) and decision **4**'s transactional contact fan-out.

**Amends** [ADR-021](ADR-021-tenant-isolation-at-the-database.md) decision 6
(`consumer-student-link` also writes each coach's view of the skater's other coaches; *Phase 2
since 2026-10-07*),
[ADR-022](ADR-022-client-isolation-at-the-database.md) decision 2 (`coachId` and `linkStatus`
are per coach), [ADR-011](ADR-011-staging-environment.md) decision 8a (naming a client brings
in all their coaches) and [ADR-001](ADR-001-backend-stack.md) A5 (one more consumer, thirteen
functions).

**Amended — 2026-10-06.** [ADR-026](ADR-026-shared-lessons-by-invitation.md): `consumer-family-sync` (decision 6) also issues each new
skater's share code, as a `SKATERCODE#` item.

**Amended — 2026-10-06.** Decision **2** extends to sign-up: a new family can enter **several
coach codes** when they register, not only add coaches later (`FeatureDecriptions/Client Sign Up`).

**Amended — 2026-10-07.** [ADR-027](ADR-027-on-demand-dev-environment.md): read "staging" as the on-demand **dev** stack; naming a client in
a load still brings in all their coaches.

**Amended — 2026-10-07.** [ADR-026](ADR-026-shared-lessons-by-invitation.md) decision 5: an
invitation to a shared lesson is a second way to add a coach. A family whose skater isn't yet the
coach's student follows the invitation's consent link and goes through decision 2's route, as if
they had entered the coach code. Decision 5's clash warning is shown on the invitation's confirm
page, where the family chooses to go ahead or cancel; it isn't re-checked when the skater joins
later.

**Amended — 2026-10-07.** *Decided by the owner.* **No limit on coaches per skater** (product
detail — see `FeatureDecriptions/Client Sign Up`, "More than one coach"). **Decision 4 (*"Also coached by"*) moves to Phase 2**, which takes MVP's
only exception to keeping coaches' data apart out of MVP.

**Amended — 2026-10-12.** [ADR-029](ADR-029-skater-registration-number.md) extends decision 1: the
`SKATER#` item gains `skatingOrg` and `registrationNumber`, required for every skater and copied
to each coach's `STUDENT#` record by `consumer-family-sync` (decision 6).

**Amended — 2026-10-13.** *Decided by the owner.* **Booking with more than one coach**
(decisions 3, 5 and 7). Items **a–g** are product rules for the booking pages, *moved to
`FeatureDecriptions/Bookings:` ("Booking with more than one coach") on 2026-11-08*. The
technical parts that stand here:

- **b.** A clash is any overlap in time; lessons that only touch don't clash. Decision 5's check
  uses that rule.
- **e.** A booking across coaches is **one request per coach** (decision 3), and each succeeds or
  fails on its own. A retry resends only the failed coach's picks, and a time already booked for
  the skater is recognised and never booked twice (ADR-006 d4b).
- **f.** The clash check can miss a clash made a second or two earlier (decision 5); accepted
  for now. Revisit when coaches can book on a family's behalf (Phase 2, ADR-009).
- **g.** One coach removing a skater, or cancelling their lessons, doesn't affect the skater's
  lessons with other coaches. (Narrows blocker #17.)

**Amended again — 2026-10-13.** *Decided by the owner.* **The rest of the family website**
(decisions 2, 3 and 7). Items **h–o** are product rules for the family website, *moved on
2026-11-08 to `FeatureDecriptions/Client Sign Up` (h), `FeatureDecriptions/ClientHomeView`
(i, j, l), `FeatureDecriptions/ClientProfileView` (k, n), `FeatureDecriptions/C_Client Payments.md`
(m) and `FeatureDecriptions/C_Client My Bookings.md` (o)*. The technical parts that stand here:

- **h.** Registration may carry several coach codes (decision 2's 2026-10-06 amendment).
- **i.** A family's site-wide "waiting" state ends once any coach approves any of its skaters;
  per coach, `linkStatus` still governs what it can read (decision 3, ADR-022 d6), so nothing of
  a coach still to approve is readable.
- **m.** Payments (Phase 2) are never totalled across coaches (decision 7).
- **n.** Removing a skater from one coach or from all is Phase 2, with blocker #17.

**Note — 2026-10-13.** [ADR-031](ADR-031-lessons-and-seats.md) rebuilds booking as **lesson
times** (the coach's) and a **seat** for each skater. **Nothing in this ADR's multi-coach rules
changes**; only the storage words do. "A booking" is now the skater's seat, the "booking lock" is
the lesson time in each coach's partition, the clash check (decision 5) reads the family's seats
through GSI1, and item e's "already booked" is found by reading the family's own seat key
(ADR-031 decision 4).

**Amended — 2026-10-20.** [ADR-033](ADR-033-invite-only-accepted-skaters.md): the 2026-10-07 amendment (an invitation to a shared
lesson as a second way to add a coach) is Phase 2. In MVP a skater can be invited only to a lesson with a coach
they are already `ACTIVE` with; adding a coach is through the coach code.

**Amended — 2026-11-06.** *Decided by the owner, settling a conflict with the Harbor design
(`design/harbor/client/screens-account.js`, "To add a new skater, add them under Skaters first").*
**Item k: a skater added on the profile can start with no coach** (product rule and screens —
see `FeatureDecriptions/ClientProfileView`, "Add a skater with no coach yet"). That skater gets a
`SKATER#` item and a share code, but no link item and no `STUDENT#` record anywhere, so they
can't be booked, invited or added as a sibling until the family adds a coach (decision 2).
- `consumer-family-sync` has no coach to copy a skater with no coach to, so it writes nothing but the
  share code. The "waiting" rule (item i) doesn't count a skater with no coach either way.

---

## Context

ADR-002 decision 5 tied a family account to one coach: registration takes one coach code, and
nothing adds a second. Real skating families don't work that way. One skater can have a
figure-skating coach and a power-skating coach, and siblings in one family often have
different coaches. The owner wants both.

ADR-002 decision 3 anticipated this. The family's link items are keyed
`STUDENT#<coachId>#<studentId>`, so *"supporting a client with students under two coaches
later requires no key redesign."* The keys hold. What changes is the rules and screens around
them, and three things a single coach never raised:

1. **Can a coach see the skater's other coaches?** Tenant isolation (ADR-021) keeps every
   coach's data apart, and the 2026-10-05 gate tests proved it holds.
2. **Two coaches can book the same skater at the same time.** Each coach's booking lock sees
   only their own calendar. *(Since ADR-031, 2026-10-13, the lock is each coach's stored lesson
   time.)*
3. **A family's contact change has to reach every coach.** ADR-002 decision 4 copies contact
   details onto each skater's record in one transaction. ADR-022 decision 8 confines each
   family session's writes to one coach's partition, so one transaction can't reach two
   coaches.

---

## Decision

### 1. One skater, one ID, any number of coaches

*Decided by the owner, 2026-10-06:* both cases are supported. A skater can have several
coaches, and a family's skaters can have different coaches.

**A skater keeps one `studentId` for life**, whichever coaches they join. Each coach still
holds their own `STUDENT#<studentId>` record in their own partition, with their own status (and,
from Phase 2, price override). Two coaches' records of the same skater share the ID and nothing else.

**The family owns the skater's details.** A new item in the family's partition is the source
of truth for who the skater is:

| Item | PK | SK | Attributes |
|---|---|---|---|
| Skater | `CLIENT#<sub>` | `SKATER#<studentId>` | studentName, isMinor, clientRelationship |

The link items (`CLIENT#<sub>/STUDENT#<coachId>#<studentId>`), one per coach the skater is
with, are unchanged in shape.

### 2. Adding a coach

A signed-in family can **add a coach** to existing or new skaters (the screen is product — see
`FeatureDecriptions/ClientProfileView`, "More than one coach"). Each new link starts `PENDING`
with that coach and is approved by that coach alone (ADR-002 decision 2), independently of
the skater's other coaches.

The code is resolved exactly as at sign-up, under the family's first session (ADR-022
decision 7), with the same WAF rate limit on lookups (ADR-019). The family is told about
decision 4's disclosure when adding a coach (wording in `FeatureDecriptions/ClientProfileView`).
***Phase 2*** *(owner, 2026-10-07):* this message ships with decision 4, not in MVP.

*Amended 2026-10-06:* **several coaches at sign-up too.** A new family can enter more than one
coach code while registering. Each code is looked up as now (before sign-in, under the
`code-lookup` role and the WAF limit), and the family then chooses which skaters go with which
coach. Registration writes one link per skater per coach, each `PENDING` with its own coach.
After sign-in, registration resolves every code again under the family's first session, as
ADR-022 decision 7 requires, rather than trusting coach IDs the browser carried over. The same
disclosure line shows when more than one coach is chosen. *Phase 2, with decision 4.*

### 3. Each request is about one coach

ADR-022 decision 2 already anticipated this: *"If that is relaxed, `coachId` becomes the coach
this request is about, chosen from the links."* That is now the rule.

- **`coachId`** is the coach whose page the family is on, chosen from the family's own link
  items, never from the request body (the `LinkedCoach` rule stands).
- **`linkStatus` is per coach:** `ACTIVE` if any of the family's skaters is `ACTIVE` **with
  that coach**. A family can be approved by Coach Dana and still waiting for Coach Sam; their
  session for Coach Sam is `PENDING` and reads nothing of Sam's (ADR-022 decision 6).

The session cache is already keyed by all three tags, so a request about another coach
selects another session. No policy changes; the database-gate tests still describe it.

ADR-024's `LinkedSkater` already carries the coach ID, so the write link check is per coach
with no change.

### 4. Coaches see the names of a skater's other coaches

***Phase 2*** *— moved by the owner, 2026-10-07.* Not built in MVP: `consumer-student-link`
doesn't maintain `otherCoaches`, and the family isn't told about it when adding a coach. When it
ships, existing skaters need a **one-off backfill**, because the list is otherwise only
recomputed when a link changes. The design below stands for then.

*Decided by the owner, 2026-10-06.* On a skater's record, a coach sees the names of the skater's
other coaches (screen wording in `FeatureDecriptions/Coach Dashboard on website.md`, Student List).

**Only the names, and only between approved links.** Coach A sees Coach B's first and last
name, and only once the skater is `ACTIVE` with both. Nothing else crosses: not the other
coach's schedule, prices, lessons, notes or contact details.

**This is a copy, not a new permission.** No policy changes, and coach A still can't read
coach B's partition. `consumer-student-link` (ADR-021 decision 6), which already runs on its
execution role with the reach to do it, maintains an `otherCoaches` attribute on each coach's
`STUDENT#` record: a list of `{coachFirstName, coachLastName}` for the skater's other
`ACTIVE` coaches. It recomputes the list for every coach of that skater whenever one of the
skater's links becomes `ACTIVE` or is removed, and when a coach changes their name.

`otherCoaches` is not one of the fields that raise `StudentChanged` (ADR-021 decision 6), so
the consumer's own write doesn't trigger it again.

This is a deliberate, narrow exception to tenant isolation, and the family is told about it
when they add a coach (decision 2).

### 5. A clashing booking is warned about, not refused

*Decided by the owner, 2026-10-06.* When a family books, the family website checks the
skater's other lessons, with any coach, and warns about an overlap; the family can book anyway
(product rule and wording — see `FeatureDecriptions/Bookings:`, "Booking with more than one
coach"). For a recurring booking the check covers every date.

**How:** the family's own bookings, across every coach, are already one query on GSI1, which
is keyed by family (ADR-022 decision 4). *(Since ADR-031, 2026-10-13, GSI1 indexes the family's
**seats**, `GSI1SK = SEAT#<date>#<startTime>`.)* The check is a read in the family's own partition,
filtered on `studentId` and the time range. No lock and no new item. GSI1 is eventually
consistent, so a booking made a second earlier with another coach may not be seen. For a
warning that is acceptable.

### 6. Family changes reach every coach through a consumer

ADR-002 decision 4's single transaction can't reach more than one coach's partition. Family
edits become two steps:

1. The family's session writes **only its own partition**: the profile (contact details,
   `smsOptIn`) or a skater's `SKATER#` item.
2. A new consumer, **`consumer-family-sync`**, copies the change onto every coach's
   `STUDENT#` record for that family's skaters. It is triggered by a new `FamilyChanged` event,
   which the Pipe derives from a `CLIENT#` `PROFILE` or `SKATER#` item being modified. Its
   role: `GetItem` and `Query` on the family's partition, `UpdateItem` on the table. It goes
   through the Pipe and bus like `consumer-student-link`, idempotent, with a dead-letter queue
   (ADR-010 decision 2). *Amended 2026-10-13 (owner, ADR-031 d14): a skater's name change also
   updates `studentName` on their upcoming seats. For each of the skater's coaches it queries that
   coach's upcoming `SEAT#` items and keeps the skater's, so its role also needs `Query` on the
   coaches' partitions; it gets no index across families. Name changes are rare, so the extra
   reads don't matter.*

**The lag is about a second.** A reminder sent in that window uses the old phone or email.
That's acceptable for a contact change; it doesn't widen anyone's access.

### 7. The family website works across coaches

*Moved to `FeatureDecriptions/ClientHomeView` ("Across coaches"), with copies of each row to the
page it describes, on 2026-11-08 — product content, not an architecture decision.* The one
technical constraint: payments owed (*Phase 2*) are never totalled across coaches, because
coaches may use different currencies (USD and CAD).

---

## Alternatives considered

- **A separate `studentId` per coach.** Keeps every coach's record fully separate, but the
  family's skater becomes several unrelated records, and the clash check (decision 5) can't
  match them without a mapping. Rejected for "both".
- **Refuse clashing bookings.** Rejected by the owner: back-to-back lessons at one rink are
  normal.
- **Let a coach read the other coach's profile directly** to show the name. Rejected: it means
  a new read permission across tenants, which the gate tests were built to rule out. A copied
  name needs no permission change.
- **Fan family changes out per coach from `api-client`**, one session per coach. Rejected:
  not atomic, and a request that fails halfway leaves coaches out of step with no retry. The
  consumer retries and has a dead-letter queue.

---

## Consequences

- **The keys don't change.** One new item type (`SKATER#`), one new attribute
  (`otherCoaches`, Phase 2), one new consumer and one new event.
- **Thirteen functions.** `consumer-family-sync` joins `consumers.jar`.
- **A family's contact changes are eventually consistent** across coaches, about a second
  behind, where they were transactional.
- **Coach A learns that a skater trains with coach B**, by name. The family is told this
  when they add the coach. *Phase 2 since 2026-10-07* (decision 4).
- **Double-booking a skater across coaches is possible**, and warned about.
- **New screens on both sites**: adding a coach, the coach switcher, cross-coach lessons and
  payments (payments Phase 2, item m), and *"Also coached by"* on the coach's skater record (*Phase 2*).
- **Knock-ons recorded elsewhere:** "remove a student" (blocker #17) is now per coach, and Phase 2 since 2026-10-13; erasure
  on request must reach every coach a skater had; staging's subset brings in all of a family's
  coaches (ADR-011 decision 8a).

**Tests** (ADR-013 decision 4):

- A family `ACTIVE` with one coach and `PENDING` with another reads the first coach's
  schedule and nothing of the second's.
- *(Phase 2)* `otherCoaches` appears on both coaches' records only when the skater is `ACTIVE`
  with both, and disappears when one link is removed.
- A booking that overlaps the skater's lesson with another coach returns the clash for a
  warning and still books when confirmed. Lessons that only touch return no clash.
- A booking across two coaches where one coach's request fails leaves the other coach's
  lessons booked; retrying the failed coach books only theirs, and nothing twice.
- A coach removing a skater leaves the skater's lessons with other coaches untouched.
- A contact change reaches every coach's `STUDENT#` copy; a duplicate `FamilyChanged`
  delivery has one effect.

---

## Open

- ~~**Is there a limit on coaches per skater?**~~ **Settled by the owner, 2026-10-07: no
  limit.** A skater signs up with 1 to 10 coaches and adds more as needed.
- *Moved to `FeatureDecriptions/ClientProfileView` ("Open questions") on 2026-11-08: the designs
  for the new screens, and what the family sees when one coach removes their skater — product
  content, not architecture decisions.*

---

## Revisit if

- A coach objects to other coaches seeing their name. The copy can be dropped, or made
  something each coach switches on, without touching anything else.
- Clashes cause real problems. Decision 5's check can become a refusal with no data change.
