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

**Amended — 2026-10-07.** *Decided by the owner.* Answers P1 (default 1, most 2, raisable later)
and P3 (the coach always accepts a skater before any lesson is booked for them; being invited
doesn't need it). Decision 4's lookup checks only that the skater exists. Decision 5 is
rewritten: the share box shows only on shareable times and takes one code; booking waits for
the code to check out; the invited family is emailed straight away; a skater who isn't the
coach's student joins the coach's roster through a consent link and the coach-code pending
route; the invited family confirms on a signed-in page that shows any clashes; once the coach
accepts, the coach's own Accept joins the skater automatically if the lesson still exists,
hasn't happened, has room and names that skater as invited, and otherwise writes nothing and
the invited family is told. One
invitation covers a whole recurring series, and a sibling is added directly.

*Revised the same day.* An earlier version of this amendment had the coach see only a display
name and the invited family hear nothing until the coach accepted; the owner replaced it with
the consent link above. **Who writes the automatic join is settled by the owner, the same
day:** `api-coach`, in the coach's own session, as part of the coach's Accept. No function gains
a database permission (decision 5, Consequences).

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
per block: 6–8 AM private, 4–6 PM up to 2, and so on. It works the same in the weekly schedule,
temporary schedules and per-date changes, because they share the block shape.

**The most a coach may choose is 2.** *Decided by the owner, 2026-10-07, answering P1.* It is a
configuration value, not built into the code, because it may be raised later.

Families never see `maxSkaters`.

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
- **Looking a code up checks only that the skater exists** in BladeBook, whether or not they're
  this coach's student, and returns only a display name, *"Mia R."* (first name, last initial), so
  the booking family can check it's the right skater. *Amended 2026-10-07.* It never returns the family, contact
  details or anything else. This needs **one new read statement on `client-tenant`**: `GetItem`
  on `SKATERCODE#*`, limited to the display-name attributes, like ADR-022 decision 7's coach-code
  read. The gate tests gain rows for it (see Consequences).
- **The same WAF rate limit as coach-code lookups** (ADR-019: 20 per 5 minutes per address)
  stops codes being guessed.
- **A family can issue a new code** for a skater, which retires the old one.

Code length and alphabet follow the coach-code decision (blocker #7), so they're settled once.

### 5. The invitation flow

*Rewritten 2026-10-07, decided by the owner.* **The rule underneath:** the coach always accepts a
skater before any lesson is booked for them. A family can invite a skater the coach hasn't
accepted, but nothing is booked for that skater until the coach does.

**On the booking screen**

- **A *share this lesson* box appears only on times whose block has `maxSkaters` of 2 or more.**
  Families can tell a time is shareable, never how many skaters it takes.
- **It takes one skater code.** A note says the other skater's family must accept before their
  skater joins the lesson.
- **The code is checked before the booking can continue.** A code that doesn't check out stops
  the booking at that step; one that does shows *"Mia R."*.
- **Family A's lesson is then booked as normal,** private, exactly as today.

**Then, for another family's skater**

1. Family A's session writes the **invitation** into its own partition:
   `CLIENT#<familyA>/INVITE#<inviteId>`, with the coach, the booking's key, the invited skater
   and `inviteStatus`. In the same request it stamps **`invitedStudentId`** (skater B) on its own
   booking, or on each booking in a recurring series. The join later requires it (step 5).
2. **`consumer-invite`**, triggered by `InviteChanged`, copies the invitation into Family B's
   partition and **emails Family B straight away** (plus a text pointing to the email if they've
   opted in to texts; ADR-007).
   - **Skater B is already the coach's accepted student:** the email is an ordinary invitation
     to accept or decline.
   - **Skater B isn't:** the email says, in substance, *"Coach Dana needs to accept you first. By
     following the link below you agree to be added to Coach Dana's roster of students, and Mia
     will join the lesson on Tue 14 Oct at 4:00 once Coach Dana accepts."*
3. **The link opens a confirm page that needs Family B to sign in.** Opening the link does
   nothing on its own: email security scanners and link previews open links automatically, and
   signing in proves it's Family B rather than whoever the email was forwarded to.
   - **The page shows any of skater B's lessons that clash** with the shared lesson (ADR-025
     decision 5), and Family B chooses **Go ahead** or **Cancel**.
4. **For a skater who is already the coach's student,** Go ahead runs the join now: Family B's own
   session, for that coach, gets a `LinkedSkater` for Mia (ADR-024) and runs decision 3's join
   transaction.
5. **For a skater who isn't,** Go ahead sends skater B down **exactly the route a coach code at
   sign-up takes** (ADR-002 decisions 1–2, ADR-025 decision 2): skater B becomes a `PENDING`
   student with the coach, with Family B's contact details, because Family B has now agreed to
   that. The pending `STUDENT#` item also carries **`pendingJoins`**: one entry per lesson to
   join, holding the booking key and the invitation ID. The family API writes it only after
   checking that Family B holds that invitation. `inviteStatus` becomes `AWAITING_COACH`.
   - **The coach accepts:** in the same request, **`api-coach` joins skater B automatically**, in
     the coach's own session, so the database confines it to that coach's partition (ADR-021).
     Family B's confirmation stands as their agreement. For each `pendingJoins` entry it runs
     decision 3's join transaction, with every check written as a condition on that one write,
     so nothing can change between checking and writing:
     - the booking still exists;
     - **the lesson hasn't started** (`startsAtUtc` is after now);
     - there's still room (`skaterCount < maxSkaters`);
     - **the booking's `invitedStudentId` is skater B**;
     - skater B's participant item doesn't exist yet.

     A lesson that fails any condition gets **nothing written**. The Accept then clears
     `pendingJoins` and records each lesson's outcome on the `STUDENT#` item. `consumer-invite`
     picks up that change, updates both invitations, and **tells Family B** of any lesson that
     was no longer available, so their skater wasn't added to it. Skater B stays the coach's
     student either way.

     **Why `invitedStudentId`.** The database confines a family's writes to the right coach, not
     to the right items (ADR-022 decision 8), so the family API's invitation check is the only
     thing deciding what goes into `pendingJoins`. If that check ever had a bug, a family could
     list a shareable lesson they were never invited to. The stamp is a second check, made at
     the join itself: Family A writes it on their own booking when they invite, so a made-up
     entry fails and writes nothing.
   - **The coach declines, or doesn't act before the lesson:** nothing is booked for skater B,
     the lesson goes ahead private, and Family A is told. Family B gets the ordinary decline
     email.
   - **Clashes aren't re-checked at join time.** One booked between Family B confirming and the
     coach accepting goes unwarned, which matches ADR-025: clashes are warned about, never
     refused.
6. `consumer-invite` copies each status change back to Family A's invitation, and **Family A's
   booking shows both skaters** once skater B joins. Family A sees the invited skater's display
   name and status, never Family B's participant item.

Family B can **decline**, which closes the invitation and tells Family A. Family A can
**withdraw** an invitation Family B hasn't confirmed.

`inviteStatus` is `PENDING | AWAITING_COACH | CONFIRMED | DECLINED | WITHDRAWN`.
`AWAITING_COACH` means Family B has confirmed and the skater is waiting for the coach's
acceptance. *Added 2026-10-07.*

**A recurring booking shares every lesson in the series.** One invitation covers them all, and one
confirmation joins skater B to each lesson in it.

**A sibling is added directly.** If the code belongs to a skater in Family A's own family, there is
no invitation and no confirmation: Family A's session joins the sibling itself, since it holds both
skaters (ADR-024). The coach-acceptance rule still applies: a sibling who isn't the coach's student
yet goes to the coach first with `pendingJoins` on their pending item, Family A's booking carries
the sibling as `invitedStudentId`, and the coach's Accept joins them exactly as above.

**Who writes the participant item.** Whenever Family B is signed in, it's Family B's own session,
so Family A never writes anything for a skater who isn't theirs (ADR-024). **The automatic join
is the one exception:** no one from Family B is signed in when the coach accepts, so the coach's
own session writes it, inside the coach's own partition, only for lessons Family B confirmed
while signed in and that name skater B as invited.

### 6. Coaches see every skater in the slot

The coach's week view, lesson list, payments and the rinkside page show every skater in a shared
slot, each with their own attendance and payment status. A coach cancelling a lesson, day or week
cancels every skater in it, and each family is told (ADR-009).

---

## Pending Kim

Each is a question in `Items to ask Kim About.md` §8. **None of them blocks private booking**,
which is unchanged. *Since 2026-10-07 P1 and P3 are answered by the owner, and P5 in part.*

| # | Question | The owner's leaning |
|---|---|---|
| **P1** | ~~The **most skaters** a coach may allow in one lesson~~ | **Answered by the owner, 2026-10-07: 2**, as a setting that may be raised (decision 1) |
| **P2** | **How a shared lesson is priced**: each skater's own price, the lesson price split, or a shared-lesson price per skater; and whether anyone's price changes when a skater joins or leaves | Kim decides; affects P4 and P5 |
| **P3** | ~~Must an invited skater **already be approved** by this coach?~~ | **Answered by the owner, 2026-10-07:** no to be invited; yes before any lesson is booked for them (decision 5). Kim §6 can't remove this approval |
| **P4** | If the **booking family cancels**, what happens to the invited skaters? | **Ask the invited family** whether to continue, once pricing is known |
| **P5** | If an invitation **isn't confirmed in time** | **Partly answered by the owner, 2026-10-07:** if the coach hasn't accepted the skater, the lesson goes ahead private. Still open: when an invitation the family hasn't accepted lapses; leaning towards the coach's notice period (24 hours by default), once pricing is known |

**P3's answer is what ADR-024 already does.** `requireActive` only issues a `LinkedSkater` for a
skater `ACTIVE` with that coach, so a skater can't join until the coach has accepted them.

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
  `sns:Publish`. *Settled 2026-10-07:* its permissions are unchanged by decision 5's rewrite. It
  also reacts to the `STUDENT#` item changing when the coach accepts or declines, to update
  invitations and tell families, which needs no database write outside the families'
  partitions.
- **No new database permission for the automatic join.** It runs in `api-coach` under
  `coach-tenant` (ADR-001 A8), which already writes and updates items in the coach's own
  partition. The booking gains **`invitedStudentId`**; the pending `STUDENT#` item gains
  **`pendingJoins`**.
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
- A `pendingJoins` entry for a lesson whose `invitedStudentId` isn't that skater writes nothing.
- A coach accepting after the lesson has started writes nothing, and Family B is told.

---

## Open (not for Kim)

- **Recurring shared lessons.** ~~Whether one invitation covers a whole recurring series~~ —
  **yes**, decided by the owner 2026-10-07 (decision 5). Still open: what happens when skater B
  can't join some dates in the series (for example, a clash with another lesson). Can Family B
  accept the dates that work, or is it all or none?
- **A skater in two places at once.** Joining a shared lesson that clashes with the skater's other
  lesson gets ADR-025's warning; confirm that's enough here too.
- **What lowering `maxSkaters` does** to lessons already booked with more skaters. The stamp
  (decision 1) protects booked lessons; confirm that's the intended behaviour.

---

## Revisit if

- Kim's answer removes coach approval (P3). ADR-024's `requireActive` changes with it.
- Families want to find each other to share, rather than arranging it outside the app. That's the
  "open spots" alternative, and it reopens the visibility question.
