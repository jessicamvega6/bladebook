# ADR-026: Shared Lessons, by Invitation

## Status

**Accepted** — 2026-10-06. *Decided by the owner, after talking with an end user.*
**Five points wait on Kim** (see Pending Kim); none of them blocks private booking.

**Extends** [ADR-006](ADR-006-open-booking-recurring-lessons-and-cancellation.md) (a booking
can carry more than one skater) and [ADR-008](ADR-008-schedule-editor.md) (a block gains
*skaters per lesson*).

**Amends** [ADR-022](ADR-022-client-isolation-at-the-database.md) (one more read statement, for
skater share codes, so its gate tests gain rows), [ADR-025](ADR-025-many-coaches-per-skater.md)
decision 6 (`consumer-family-sync` also issues share codes) and
[ADR-001](ADR-001-backend-stack.md) A5 (one more consumer, fourteen functions).

Source: `FeatureDecriptions/Schedule lesson split`.

---

## Context

A coach can split one lesson slot between several skaters, for example two friends sharing a
semi-private lesson. Until now the design assumed one skater per slot, and that assumption runs
through everything:

- **The booking is the slot.** Each lesson is one item keyed `BOOKING#<date>#<startTime>` in
  the coach's partition, written with `attribute_not_exists(SK)`. That one condition is what
  prevents double-booking (ADR-004 decision 2, ADR-006).
- **Everything hangs off that item:** the price stamp, payment status, attendance, the
  reminder and report (GSI2), the unpaid list (GSI3), the family's own lessons (GSI1) and
  cancellation.

The owner's answers after talking with the end user:

- **Every booking starts private.** A family books a slot as today and it shows as taken.
  Other families never see that a slot could be shared, or how many skaters it holds.
- **Sharing is by invitation.** While booking, the family can add another family's skater. That
  family confirms, and then the booking shows both.
- **The coach decides how many skaters each block allows.**

---

## Decision

### 1. A block has a "skaters per lesson" setting

Every schedule block (ADR-008) gains **`maxSkaters`**, default **1** (private). The coach sets it
per block: 6–8 AM private, 4–6 PM up to 3, and so on. It works the same in the weekly schedule,
temporary schedules and per-date changes, because they share the block shape.

The upper limit a coach may choose is **pending Kim** (P1). Until then the editor allows 1 only,
which keeps every lesson private.

`maxSkaters` is stamped onto the booking when it is made, like the price (ADR-003), so a later
schedule edit doesn't change a lesson already booked.

### 2. The slot lock doesn't change

The first family books exactly as today: one `BOOKING#<date>#<startTime>` item, written with
`attribute_not_exists(SK)`. That item still **is** the slot and still carries the booking
family's skater, price, payment and attendance. It gains two attributes:

| Attribute | Meaning |
|---|---|
| `maxSkaters` | Stamped from the block at booking |
| `skaterCount` | 1 at booking; raised as invited skaters join |

To everyone else the slot is taken from the moment the first family books, as now (§7: never
who holds it, and now never how many).

### 3. Each invited skater is their own participant item

An invited skater who joins gets their own item in the coach's partition, next to the booking:

| Item | PK | SK | Attributes |
|---|---|---|---|
| Lesson participant | `COACH#<coachId>` | `PARTICIPANT#<date>#<startTime>#<studentId>` | studentId, clientId, durationMinutes, price and fee stamps (P2), paymentStatus, outcome, reminder flags; GSI1, GSI2 and GSI3 keys exactly as a booking has |

Because a participant carries the same index keys as a booking:

- **The invited family sees the lesson in "My lessons"** (GSI1, keyed by their own client ID).
- **The 7 AM reminder and 9 PM report include them** (GSI2): one reminder per skater per lesson,
  as ADR-002 decision 7 already requires.
- **Their unpaid lesson is on the coach's list** (GSI3), paid or waived separately.
- **The coach checks each skater in separately**, rinkside and on the lesson list.

**A different sort-key prefix keeps participants out of availability.** The availability query
reads `BOOKING#` items for a date range. Participants sort under `PARTICIPANT#`, so they're never
returned to a family looking at open times, and a determined family can't count them.

**Joining is one transaction**, written by the invited family's own session (decision 5):

1. update the booking: `skaterCount = skaterCount + 1`, on condition `skaterCount < maxSkaters`
   and that the booking still exists;
2. put the participant item, on condition `attribute_not_exists(SK)`.

Both happen or neither does, so a lesson can't go over its limit, even with two invitations
confirmed at the same moment.

### 4. A skater is invited with a share code

**Every skater gets a short share code**, for example `MIA-4K7Q`, shown on their profile in the
family website. A family gives it to the family they want to share with, the same way a coach
gives out their coach code.

- **The code is issued by `consumer-family-sync`** (ADR-025 decision 6) when a `SKATER#` item is
  created, written as a `SKATERCODE#<code>` item with `attribute_not_exists(PK)` so codes are
  unique, and copied back onto the `SKATER#` item. Families never write code items, so no new
  write permission is needed.
- **Looking a code up returns only a display name**, *"Mia R."* (first name, last initial), so
  the booking family can check it's the right skater. It never returns the family, contact
  details or anything else. This needs **one new read statement on `client-tenant`**: `GetItem`
  on `SKATERCODE#*`, limited to the display-name attributes, like ADR-022 decision 7's coach-code
  read. The gate tests gain rows for it (see Consequences).
- **The same WAF rate limit as coach-code lookups** (ADR-019: 20 per 5 minutes per address)
  stops codes being guessed.
- **A family can issue a new code** for a skater, which retires the old one.

Code length and alphabet follow the coach-code decision (blocker #7), so they're settled once.

### 5. The invitation flow

1. **While booking**, Family 1 can optionally add up to `maxSkaters − 1` skaters by share code.
   Each shows as *"Mia R. — invited"*. The booking itself is made immediately and is private.
2. Family 1's session writes an **invitation** into **its own partition**:
   `CLIENT#<family1>/INVITE#<inviteId>` with the coach, the booking's key, the invited skater
   and `inviteStatus = PENDING`.
3. A new consumer, **`consumer-invite`**, triggered by a new `InviteChanged` event, copies the
   invitation into **Family 2's partition** and emails Family 2: *"Dana's family invited Mia to
   share a lesson with Coach Dana on Tue 14 Oct at 4:00. Confirm or decline."* With SMS opt-in,
   a text points to the email (ADR-007).
4. **Family 2 confirms** from their account. Their own session, for that coach, gets a
   `LinkedSkater` for Mia (ADR-024) and runs decision 3's join transaction. ADR-025's clash
   warning applies here too.
5. `consumer-invite` copies the new status back to Family 1's invitation, and **Family 1's
   booking shows both skaters**. Family 1 sees the invited skater's display name and status,
   never Family 2's participant item.

Family 2 can **decline**, which closes the invitation and tells Family 1. Family 1 can **withdraw**
an invitation that hasn't been confirmed.

This keeps ADR-024's rule whole: **Family 1 never writes anything for a skater who isn't theirs.**
The participant is written by the family who owns the skater, under their own session.

### 6. Coaches see every skater in the slot

The coach's week view, lesson list, payments and the rinkside page show every skater in a shared
slot, each with their own attendance and payment status. A coach cancelling a lesson, day or week
cancels every skater in it, and each family is told (ADR-009).

---

## Pending Kim

Each is a question in `Items to ask Kim About.md` §8. **None of them blocks private booking**,
which is unchanged. Until they're answered, `maxSkaters` stays at 1 and sharing is off.

| # | Question | The owner's leaning |
|---|---|---|
| **P1** | The **most skaters** a coach may allow in one lesson | — |
| **P2** | **How a shared lesson is priced**: each skater's own price, the lesson price split, or a shared-lesson price per skater; and whether anyone's price changes when a skater joins or leaves | Kim decides; affects P4 and P5 |
| **P3** | Must an invited skater **already be approved** by this coach? | Tied to Kim §6, which may remove coach approval altogether |
| **P4** | If the **booking family cancels**, what happens to the invited skaters? | **Ask the invited family** whether to continue, once pricing is known |
| **P5** | If an invitation **isn't confirmed in time** | **It lapses at the coach's notice period** (24 hours by default), the lesson goes ahead private, and the booking family is told, once pricing is known |

**Today, P3 is effectively "yes".** ADR-024's `requireActive` only issues a `LinkedSkater` for a
skater `ACTIVE` with that coach, so an unapproved skater can't join. If Kim's answer removes
approval, ADR-024 changes with it.

---

## Alternatives considered

- **Open spots any family can book**, with the remaining count shown. Rejected by the owner: every
  booking is private until the booking family chooses to share.
- **Family 1 adds Family 2's skater directly**, without confirmation. Rejected: Family 2 would be
  booked, and billed, without agreeing, and Family 1 would be writing for a skater who isn't
  theirs, which ADR-024 forbids.
- **Invite by the internal skater ID.** Rejected: a long, unreadable identifier, and an internal
  key exposed to families.
- **Invite by searching the coach's skaters by name.** Rejected: any family could browse other
  families' children by name.
- **One booking item holding a list of skaters.** Rejected: each skater needs their own index
  keys (their own family's lessons, the reminder, the unpaid list), and an item has only one of
  each.

---

## Consequences

- **Private booking is unchanged.** The slot lock, the booking item and every existing flow stay
  as they are. Sharing adds to them.
- **Fourteen functions.** `consumer-invite` joins `consumers.jar`: it reads and writes invitations
  in both families' partitions and sends email and text, so it holds `ses:SendEmail` and
  `sns:Publish`.
- **Four new item types:** `PARTICIPANT#` (coach's partition), `INVITE#` (each family's
  partition), `SKATERCODE#` (its own partition), and the `shareCode` on `SKATER#`. One new event,
  `InviteChanged`.
- **`client-tenant` gains one read statement**, so the gate tests (runbook
  `database-gate-tests.md`) gain rows: a share-code lookup returns only the display name; any
  other attribute, no projection, or a `Query` is refused.
- **Everything that walks a lesson must include participants:** the schedule-change consumer's
  cancel and re-price (ADR-020), the change notifier (one message per family), the drift check,
  the end-of-day report, the coach's cancellation, and erasure on request.
- **Lapsing invitations need a timer** if Kim agrees to P5. Nothing today fires at a per-booking
  time; EventBridge Scheduler's one-off schedules are the likely fit, to be decided with P5.
- **New screens:** the share code on a skater's profile; "add a skater to share" on booking;
  invitations to confirm or decline; both skaters on a shared booking; every skater in a slot on
  the coach's views. None is in the Harbor designs.

**Tests** (ADR-013 decision 4):

- Two invitations confirmed at once for the last place: one joins, one is refused.
- A participant never appears in another family's availability query.
- Family 1's session can't write a participant item for Family 2's skater.
- A share-code lookup returns the display name and nothing else.
- A coach cancelling a shared lesson cancels every skater and notifies each family once.

---

## Open (not for Kim)

- **Recurring shared lessons.** Whether one invitation covers a whole recurring series, and what
  happens when the invited family confirms some dates and not others.
- **A skater in two places at once.** Joining a shared lesson that clashes with the skater's other
  lesson gets ADR-025's warning; confirm that's enough here too.
- **What lowering `maxSkaters` does** to lessons already booked with more skaters. The stamp
  (decision 1) protects booked lessons; confirm that's the intended behaviour.

---

## Revisit if

- Kim's answer removes coach approval (P3). ADR-024's `requireActive` changes with it.
- Families want to find each other to share, rather than arranging it outside the app. That's the
  "open spots" alternative, and it reopens the visibility question.
