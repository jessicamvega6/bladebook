# ADR-026: Shared Lessons, by Invitation

## Status

**Accepted** — 2026-10-06. *Decided by the owner, after talking with an end user.*
~~**P2 and P4 wait on Kim, and P5 in part**~~ **P2 and P4 answered by the owner, 2026-10-13**
(see the amendment below), and ~~P5 in part~~ **P5 answered by the owner, 2026-10-13**: no cutoff before
the lesson. P1 and P3 were answered 2026-10-07.
None of them blocks private booking.

**Extends** [ADR-006](ADR-006-open-booking-recurring-lessons-and-cancellation.md) (a booking
can carry more than one skater) and [ADR-008](ADR-008-schedule-editor.md) (a block gains
*skaters per lesson*).

**Amends** [ADR-022](ADR-022-client-isolation-at-the-database.md) (one more read statement, for
skater share codes, so its gate tests gain rows), [ADR-025](ADR-025-many-coaches-per-skater.md)
decision 6 (`consumer-family-sync` also issues share codes) and
[ADR-001](ADR-001-backend-stack.md) A5 (one more consumer, fourteen functions). *Since
2026-10-07 also* [ADR-002](ADR-002-client-registration.md) (an invitation is a second way onto a
roster), [ADR-024](ADR-024-client-write-link-check.md) (~~one exception: the coach's Accept joins an
invited skater~~ *revised 2026-10-13, ADR-031 revision: no exception; the coach's Accept is the
coach's own write*), [ADR-025](ADR-025-many-coaches-per-skater.md) decisions 2 and 5 (the invitation as
a way to add a coach; the clash warning on the confirm page) and, *since 2026-10-08,*
[ADR-021](ADR-021-tenant-isolation-at-the-database.md) decision 6 (`consumer-invite` also consumes
`StudentChanged`). *Since 2026-10-13 also* [ADR-015](ADR-015-late-cancellation-and-no-show-charges.md)
(in a shared lesson, the leaver may be charged their share of the late-cancellation fee).

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

**Amended — 2026-10-08.** *Decided by the owner.* `inviteStatus`'s first state renamed `PENDING` →
`SENT`; `EXPIRED` added; how an `AWAITING_COACH` invitation closes (decision 5). `consumer-invite`
is also triggered by `StudentChanged` (ADR-021 decision 6, ADR-001).

**Amended — 2026-10-09.** *Decided by the owner.* An invitation still waiting on the coach gets a
warning email and a home-screen banner before the lesson, and a nightly sweep closes any
invitation whose lesson has started (decision 5a, new). The coach's email is moved from Phase 2
to MVP. ~~Kim's P5, when an unanswered invitation lapses *before* the lesson, stays open.~~ *Settled by the
owner 2026-10-13: it doesn't; see P5.*

**Amended — 2026-10-13.** *Decided by the owner.* **How a shared lesson is priced, and what
happens when a skater leaves** (P2 and P4; Kim's list §8 questions 2, 3 and 5):

- **One set price, split.** The lesson has one price, the block's schedule price when it was
  booked, split evenly between its skaters: a $50 lesson shared by two is $25 each. *On the
  lesson time since ADR-031.* ~~Each
  participant line stamps its share.~~ *Replaced by ADR-031 decision 7 (2026-10-13): ~~each
  **seat** carries `shareMinor`. The price is split among the `BOOKED` seats,~~ and odd cents go
  one each to the earliest-joined seats.* *Revised 2026-10-13 (ADR-031 revision): the total
  price is stored only on the lesson time (`priceMinor`). A share is worked out, not stored:
  `priceMinor ÷ shareCount`, where `shareCount` is a lesson-time attribute. ~~A seat gets a fixed
  `amountMinor` only at check-in, at a no-show, or when marked paid or waived.~~* *Revised 2026-10-13: no amount is copied onto a seat; it's worked out from the lesson time (ADR-031 d7).* Personal prices are Phase 2 (ADR-003, amended the same
  day), so the split is always of the schedule's price.
- **Joining:** when a second skater joins, ~~both are re-stamped at the split price~~ the
  lesson time's `shareCount` goes up and both shares follow from it. Until then the booking
  family's lesson is private at the full price. *Revised 2026-10-13 (ADR-031 revision): nothing
  is re-stamped on either seat.*
- **Leaving in time** (outside the coach's notice period): the skater who stays is not
  re-priced automatically. Their family is told and chooses: **keep it as a private lesson at
  the full price**, or **cancel with no charge**. Until they answer, their share stands. ~~**No
  answer by the start of the notice period cancels it, with no charge.**~~ *Replaced by ADR-031
  decision 8 (2026-10-13): no answer by the **answer-by** time — whichever comes first, the start
  of the notice period or 7 days after the leave — cancels it with no charge. The hourly sweep
  does it.* *Revised 2026-10-13 (ADR-031 revision): the leave is recorded as a **pending leave**
  on the lesson time, with `answerBy`. The staying family's seat isn't touched. Keeping and
  cancelling are the staying family's own writes.*
- **Leaving late** (inside the notice period, or a no-show): the skater who leaves may be charged
  **their share of the late-cancellation fee** (half, for two skaters; ADR-015, amended the same
  day). The skater who stays isn't charged any fee and keeps their share of the price.
- **No special case for the booking family** (P4): once both skaters have joined, either family
  leaving follows the same rules. The invited family can cancel from My bookings like the
  booking family.

**Amended — 2026-10-12.** *Decided by the owner.* A lesson already booked can't have its
`maxSkaters` lowered; the decision 1 stamp is the intended behaviour, so a schedule edit changes
only lessons booked afterwards. Decision 1's "like the price" no longer holds since
[ADR-020](ADR-020-repricing-booked-lessons.md): the price follows schedule edits, `maxSkaters`
doesn't.

**Amended — 2026-10-13.** *Decided by the owner.* **Share codes can't be refreshed.** Decision 4's
"a family can issue a new code" is withdrawn: a skater keeps one share code for good, and the
family profile shows it with Copy only.

**Amended — 2026-10-13.** *Decided by the owner.* **P5: no cutoff before the lesson.** An invitation
the family hasn't answered stays open until the lesson starts, and then expires (decision 5a, ADR-031
decision 12's `EXPIRE`); the lesson goes ahead private. Nothing lapses earlier, so P5 needs no
new deadline in the sweep and no longer waits on Kim.

**Amended — 2026-10-13.** *Decided by the owner.* **The share code's shape** (decision 4). The
first **3 letters of the skater's first name**, a dash, then **5 random characters** from the
coach code's look-alike-free set ([ADR-002](ADR-002-client-registration.md), amended
2026-10-13): `MIA-4K7QX`. Names are uppercased with accents dropped (Zoë → `ZOE`) and letters
outside A–Z skipped; a first name shorter than 3 letters is filled from the last name (Bo Li →
`BOL`). Only the random part avoids look-alikes; the name letters can be any letter. A skater
renamed later keeps their code, old letters included. Typing ignores case and the dash. Each
three-letter start has about 17.2 million possible codes, so at the lookup's rate limit guessing
a skater takes millions of tries, years from one address, and a hit returns only a display name (to the family).

**Note — 2026-10-12.** [ADR-007](ADR-007-sms-message-constraints.md) (amended 2026-10-12): all SMS to clients is **Phase 2**. The invitation's text pointing to the email waits for
it; in MVP the invited family gets the email only.

**Superseded in part — 2026-10-13.** *Decided by the owner.*
[ADR-031](ADR-031-lessons-and-seats.md) replaces the **mechanics** of decisions 2, 3 and 5, and
decision 5a's **nightly** sweep. Shared and private lessons now go through one path: a stored
**lesson time** (the coach's) and a **seat** for each skater in it.

- **Participants → seats.** The booking item with a `PARTICIPANT#` item hanging off it is
  replaced by a lesson time (`LESSON#`) with one seat per skater (`SEAT#`). A private lesson has
  one seat; a shared lesson has two (ADR-031 decisions 1 and 2).
- **`INVITE#` copies → `partnerName` and `partnerStatus` on each seat**, ~~written in the same
  transaction as every change. No consumer keeps two families in step~~ (decision 6). *Revised
  2026-10-13 (ADR-031 revision): `consumer-invite` writes them, reacting to seat changes, about a
  second later. No family writes them.*
- **`pendingJoins` → `AWAITING_COACH` seats.** The coach's Accept turns every one of that
  skater's `AWAITING_COACH` seats into `BOOKED`, each if its lesson hasn't started (decision 6).
- **The nightly sweep → `sched-deadline-sweep`, every hour**, reading deadlines from a new
  sparse index, **GSI4** ~~(`WARN`, `EXPIRE`, `ANSWER`)~~ *Revised 2026-10-13 (ADR-031): `WARN`,
  `EXPIRE`, ~~`INVITER_LEFT`~~ on the invited seat; `ANSWER` on the lesson time.* *Revised
  2026-10-13 (ADR-031 d5, d12): `INVITER_LEFT` sits on the lesson time too, naming the invited
  seat.* The warning is still sent at the 9pm run
  before it's due, so it's never late and never sent at night (decision 12).

**It also closes gaps this ADR left:** how a skater leaves a shared lesson, what happens when the
booking family leaves and the invited family stays, whether a freed place can take a new invite,
and how re-pricing applies to split shares (ADR-031 decisions 7–10). Open's partial joins for a
recurring series are settled: **lesson by lesson** (decision 6). One rule is tightened: the
staying family's **answer-by** time is whichever comes first, the start of the notice period or
**7 days after the leave** (decision 8, option C).

**Every behaviour rule here still holds** — share codes, consent, the coach's acceptance, the
warning, the banner, siblings, coaches seeing every skater — unless ADR-031 says otherwise.

**Superseded in part — 2026-10-20** by [ADR-033](ADR-033-invite-only-accepted-skaters.md). *Decided by the owner.* In MVP only a skater
`ACTIVE` with the coach can be invited or added as a sibling. Moved to Phase 2: decision 5's rule
underneath (*"A family can invite a skater the coach hasn't accepted"*), step 2's consent-link
email, step 5, the `AWAITING_COACH` cases and how they close, all of decision 5a (the warning,
the banners and the late-confirmation rule) *(clarified 2026-10-20: 5a's expiry at the lesson start, and screens working out "expired" from the time, stay MVP)*, and P3's answer. The text below is kept as the Phase 2
record. A share-check endpoint tells the booking page whether the invited skater is on the coach's
student list (ADR-033 decision 2a).

**Amended — 2026-10-20, later.** *Decided by the owner.* Decision 4's share-code read returns the
skater's **`studentId` and display name** to `api-client`, which needs the ID for the booking and the
share-check (ADR-033); the family still sees only the display name. The booking resolves the code
again itself. See ADR-022, amended 2026-10-20.

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

~~`maxSkaters` is stamped onto the booking when it is made~~, like the price (ADR-003), so a later
schedule edit doesn't change a lesson already booked. *Replaced by ADR-031 decision 1
(2026-10-13): `maxSkaters` is on the **lesson time**, created from the schedule, and is never
lowered once the lesson time is booked.*

### 2. The slot lock doesn't change

~~The first family books exactly as today: one `BOOKING#<date>#<startTime>` item, written with
`attribute_not_exists(SK)`. That item still **is** the slot and still carries the booking
family's skater, price, payment and attendance. It gains two attributes:~~

| Attribute | Meaning |
|---|---|
| ~~`maxSkaters`~~ | ~~Stamped from the block at booking~~ |
| ~~`skaterCount`~~ | ~~1 at booking; raised as invited skaters join~~ |

*Replaced by ADR-031 decisions 1, 2 and 4 (2026-10-13): the slot is a stored **lesson time**
(`LESSON#<date>#<startTime>`), which carries `lessonStatus`, the price stamps, `maxSkaters` and
`seatsTaken`. Booking updates it from `OPEN` to `BOOKED` and puts the family's **seat** in one
transaction. The seat, not the lesson time, carries the skater, ~~their share,~~ payment and
attendance.* *Revised 2026-10-13 (ADR-031): no share is stored; it is worked out (ADR-031 d7).*

To everyone else the slot is taken from the moment the first family books, as now (§7: never
who holds it, and now never how many).

### 3. Each invited skater is their own participant item

*Replaced by ADR-031 decisions 2, 5 and 6 (2026-10-13): every skater, the booking family's
included, has their own **seat**, `SEAT#<date>#<startTime>#<studentId>`, with the same index
keys (GSI1, GSI2, GSI3) a participant was to have. An invited skater's seat is written at
booking as `INVITED` and holds the place at once; joining changes its status. `seatsTaken` on the
lesson time replaces `skaterCount`. The behaviour below — each family sees the lesson, one
reminder per skater, paid separately, checked in separately, never in availability — still
holds.*

An invited skater who joins gets their own item in the coach's partition, next to the booking:

| Item | PK | SK | Attributes |
|---|---|---|---|
| ~~Lesson participant~~ | `COACH#<coachId>` | ~~`PARTICIPANT#<date>#<startTime>#<studentId>`~~ | studentId, clientId, durationMinutes, price and fee stamps (its share of the set price; amended 2026-10-13), paymentStatus, outcome, reminder flags; GSI1, GSI2 and GSI3 keys exactly as a booking has |

Because a participant carries the same index keys as a booking:

- **The invited family sees the lesson in "My lessons"** (GSI1, keyed by their own client ID).
- **The 7 AM reminder and 9 PM report include them** (GSI2): one reminder per skater per lesson,
  as ADR-002 decision 7 already requires.
- **Their unpaid lesson is on the coach's list** (GSI3), paid or waived separately.
- **The coach checks each skater in separately**, rinkside and on the lesson list.

**A different sort-key prefix keeps participants out of availability.** The availability query
reads ~~`BOOKING#`~~ items for a date range. ~~Participants sort under `PARTICIPANT#`~~, so they're never
returned to a family looking at open times, and a determined family can't count them. *Since
ADR-031 (2026-10-13): availability reads `LESSON#` items; seats sort under `SEAT#`.*

*Since ADR-033 (2026-10-20): joining is always the invited family's own write; the coach's Accept joins no one.*

**Joining is one transaction**, written by the invited family's own session, or by the coach's
own session when the coach's Accept joins an invited skater (decision 5, which adds two more
conditions):

1. ~~update the booking: `skaterCount = skaterCount + 1`, on condition `skaterCount < maxSkaters`
   and that the booking still exists;~~
2. ~~put the participant item, on condition `attribute_not_exists(SK)`.~~

*Replaced by ADR-031 decisions 4–6 (2026-10-13): the invited seat is put, and `seatsTaken`
raised, in the **booking** transaction itself, so the place is held from the start. Joining
changes the seat `INVITED → BOOKED` (or `AWAITING_COACH`) and ~~re-splits both seats' shares~~
raises the lesson time's `shareCount` when the seat becomes `BOOKED`, one transaction per date.*
*Revised 2026-10-13 (ADR-031 revision): no share is stored on a seat, so nothing is re-split.*

Both happen or neither does, so a lesson can't go over its limit, even with two invitations
confirmed at the same moment.

### 4. A skater is invited with a share code

**Every skater gets a short share code**, for example `MIA-4K7QX`, shown on their profile in the
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
  read. *Amended 2026-10-20 (ADR-033; owner): the read returns `studentId` and the display name; `api-client` returns only the display name.* The gate tests gain rows for it (see Consequences).
- **The same WAF rate limit as coach-code lookups** (ADR-019: 20 per 5 minutes per address)
  stops codes being guessed.
- ~~**A family can issue a new code** for a skater, which retires the old one.~~ *Withdrawn
  2026-10-13 by the owner:* a skater's share code never changes; there is no way to refresh it.

*Settled 2026-10-13 (amendment above):* the first 3 letters of the skater's first name and 5 random
characters from the coach code's character set, `MIA-4K7QX`.

### 5. The invitation flow

*Phase 2 since ADR-033 (2026-10-20): only a skater `ACTIVE` with the coach can be invited or added as a sibling; the rule below is the Phase 2 record.* *Rewritten 2026-10-07, decided by the owner.* **The rule underneath:** the coach always accepts a
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

1. ~~Family A's session writes the **invitation** into its own partition:
   `CLIENT#<familyA>/INVITE#<inviteId>`, with the coach, the booking's key, the invited skater
   and `inviteStatus`. In the same request it stamps **`invitedStudentId`** (skater B) on its own
   booking, or on each booking in a recurring series. The join later requires it (step 5).~~
   *Replaced by ADR-031 decision 5 (2026-10-13): Family A's booking transaction puts skater B's
   **invited seat** (`INVITED`, display name, `inviteId`, `invitedByClientId`) beside its own,
   one per date in a series. ~~Family B's `clientId` comes from the share-code record, so the
   invitation shows in their My bookings.~~ The invited seat itself does the job
   `invitedStudentId` did.* *Revised 2026-10-13 (ADR-031 revision): the invited seat is Family
   A's record until Family B accepts, with no `clientId`. `consumer-invite` adds
   `invitedClientId` and Family B's GSI1 (global secondary index 1, by client) keys to it, so the
   invitation still shows on Family B's Home and My bookings before they accept (the Harbor
   design, `home-invited`). The share-code record no longer needs to hold `clientId`.*
2. ~~**`consumer-invite`**, triggered by `InviteChanged`, copies the invitation into Family B's
   partition and~~ **emails Family B straight away** (plus a text pointing to the email if they've
   opted in to texts; ADR-007). *Amended 2026-10-08: and by `StudentChanged`, when the coach
   accepts or declines an invited skater.* *Replaced by ADR-031 decision 6 (2026-10-13): there
   are no `INVITE#` copies to make. ~~Which function now sends this email is not said in ADR-031.~~*
   *Revised 2026-10-13 (ADR-031 decision 14): `consumer-invite` sends it.*
   - **Skater B is already the coach's accepted student:** the email is an ordinary invitation
     to accept or decline.
   - *Phase 2 since ADR-033 (2026-10-20): in MVP the invited skater is always the coach's student, so this consent-link version is Phase 2.* **Skater B isn't:** the email says, in substance, *"Coach Dana needs to accept you first. By
     following the link below you agree to be added to Coach Dana's roster of students, and Mia
     will join the lesson on Tue 14 Oct at 4:00 once Coach Dana accepts."*
3. **The link opens a confirm page that needs Family B to sign in.** Opening the link does
   nothing on its own: email security scanners and link previews open links automatically, and
   signing in proves it's Family B rather than whoever the email was forwarded to.
   - **The page shows any of skater B's lessons that clash** with the shared lesson (ADR-025
     decision 5), and Family B chooses **Go ahead** or **Cancel**.
4. **For a skater who is already the coach's student,** Go ahead runs the join now: Family B's own
   session, for that coach, gets a `LinkedSkater` for Mia (ADR-024) and runs decision 3's join
   transaction. *Since ADR-031 (2026-10-13): the seat goes `INVITED → BOOKED`, if the lesson
   hasn't started, and ~~both seats are re-split~~ the lesson time's `shareCount` goes up.*
   *Revised 2026-10-13 (ADR-031 revision): accepting is Family B's own write, after the link
   check. Its condition: the seat has no `clientId`, is `INVITED`, and its `studentId` is Family
   B's skater. It sets the seat's `clientId` to Family B. Family A's seat isn't touched.*
5. *Phase 2 since ADR-033 (2026-10-20): step 5 is the Phase 2 consent-link route. In MVP the booking stops at the share step instead (ADR-033 d2, d2a).* **For a skater who isn't,** Go ahead sends skater B down **exactly the route a coach code at
   sign-up takes** (ADR-002 decisions 1–2, ADR-025 decision 2): skater B becomes a `PENDING`
   student with the coach, with Family B's contact details, because Family B has now agreed to
   that. ~~The pending `STUDENT#` item also carries **`pendingJoins`**: one entry per lesson to
   join, holding the booking key and the invitation ID. The family API writes it only after
   checking that Family B holds that invitation. `inviteStatus` becomes `AWAITING_COACH`.~~
   *Replaced by ADR-031 decision 6 (2026-10-13): each invited seat goes `INVITED →
   AWAITING_COACH`. The seats themselves are the list of lessons to join.*
   - **The coach accepts:** in the same request, **`api-coach` joins skater B automatically**, in
     the coach's own session, so the database confines it to that coach's partition (ADR-021).
     Family B's confirmation stands as their agreement. ~~For each `pendingJoins` entry it runs
     decision 3's join transaction~~, with every check written as a condition on that one write,
     so nothing can change between checking and writing: *Replaced by ADR-031 decision 6
     (2026-10-13): the Accept turns every one of skater B's `AWAITING_COACH` seats into `BOOKED`
     in the same request, each if its lesson hasn't started, and ~~re-splits~~ raises each
     lesson's `shareCount` (*revised 2026-10-13, ADR-031 revision*). The place was held
     from booking, so room and the invited name are already settled by the seat existing. The
     conditions below are kept as the record.*
     - the booking still exists;
     - **the lesson hasn't started** (`startsAtUtc` is after now);
     - there's still room (`skaterCount < maxSkaters`);
     - **the booking's `invitedStudentId` is skater B**;
     - skater B's participant item doesn't exist yet.

     A lesson that fails any condition gets **nothing written**. ~~The Accept then clears
     `pendingJoins` and records each lesson's outcome on the `STUDENT#` item. `consumer-invite`
     picks up that change, updates both invitations, and~~ **tells Family B** of any lesson that
     was no longer available, so their skater wasn't added to it. Skater B stays the coach's
     student either way. *Since ADR-031 (2026-10-13): a seat whose lesson has started moves to
     `SEATEND#` as expired~~, and `partnerStatus` on the other seat is updated in the same
     transaction. Which function sends Family B's email is not said in ADR-031~~.* *Revised
     2026-10-13 (ADR-031 revision): `consumer-invite` updates `partnerStatus` on the other seat,
     about a second later, and sends Family B's email (ADR-031 decisions 6 and 14).*

     ~~**Why `invitedStudentId`.**~~ *Superseded by ADR-031 decision 5 (2026-10-13): the invited
     seat, written by Family A at booking, is what a join must find. The reasoning below is the
     record.* The database confines a family's writes to the right coach, not
     to the right items (ADR-022 decision 8), so the family API's invitation check is the only
     thing deciding what goes into `pendingJoins`. If that check ever had a bug, a family could
     list a shareable lesson they were never invited to. The stamp is a second check, made at
     the join itself: Family A writes it on their own booking when they invite, so a made-up
     entry fails and writes nothing.
   - **The coach declines, or doesn't act before the lesson:** nothing is booked for skater B,
     the lesson goes ahead private, and Family A is told. Family B gets the ordinary decline
     email. *Amended 2026-10-08:* a lesson that passes before the coach acts ends the
     invitation as **`EXPIRED`**, and Family B is told the lesson was no longer available.
   - **Clashes aren't re-checked at join time.** One booked between Family B confirming and the
     coach accepting goes unwarned, which matches ADR-025: clashes are warned about, never
     refused.
6. ~~`consumer-invite` copies each status change back to Family A's invitation, and~~ **Family A's
   booking shows both skaters** once skater B joins. Family A sees the invited skater's display
   name and status, never Family B's participant item. *Replaced by ADR-031 decision 6
   (2026-10-13): each seat carries `partnerName` and `partnerStatus`, the other skater's display
   name and status, ~~written in the same transaction as every change~~. Each family reads only its
   own seats.* *Revised 2026-10-13 (ADR-031 revision): `consumer-invite` writes them, reacting to
   seat changes. No family writes them.*

Family B can **decline**, which closes the invitation and tells Family A. Family A can
**withdraw** an invitation Family B hasn't confirmed. *Revised 2026-10-13 (ADR-031 revision,
decision 5): withdrawing is allowed only while the seat is `INVITED`. If Family A cancels their
own seat while skater B's seat is still `INVITED` or `AWAITING_COACH`, nobody is paying for the
lesson yet, so ~~`consumer-invite` ends skater B's seat as `WITHDRAWN` and emails Family B that the
lesson was cancelled~~ the invitation ends.* *Revised 2026-10-13 (option B, ADR-031 decisions 5
and 12): still `INVITED`, skater B's seat is Family A's own record, so their cancel ends it as
`WITHDRAWN` in the same transaction. Already `AWAITING_COACH`, it is Family B's, so the cancel
~~only sets an `INVITER_LEFT` deadline on it~~, due at once; the hourly sweep ends it as `WITHDRAWN`
and Family B is emailed that the lesson was cancelled, up to an hour later.* *Revised 2026-10-13
(ADR-031 d5, d12): the cancel doesn't touch skater B's seat; it records an `INVITER_LEFT`
deadline, due at once, on the lesson time, naming that seat. The sweep ends the seat as
`WITHDRAWN`, the lesson time goes back to `OPEN` (it was the last seat), and `consumer-invite`
emails Family B.* *Declining is Family B's answer to an invitation addressed to their skater,
under the same condition as accepting (no `clientId`, `INVITED`, their skater): the seat moves to
`SEATEND#` as `DECLINED`.*

`inviteStatus` is `SENT | AWAITING_COACH | CONFIRMED | DECLINED | WITHDRAWN | EXPIRED`.
*Replaced by ADR-031 decisions 2 and 6 (2026-10-13): the invited seat's `seatStatus` carries it.
`SENT` is `INVITED`; `AWAITING_COACH` is unchanged; `CONFIRMED` is `BOOKED`; a declined,
withdrawn or expired invitation moves to a `SEATEND#` line holding that outcome.* *Renamed by the
owner 2026-10-08: the first state was `PENDING`, which read too much like a student's `PENDING`.*
`SENT` means Family B hasn't answered yet.
`AWAITING_COACH` means Family B has confirmed and the skater is waiting for the coach's
acceptance. *Added 2026-10-07.*

*Phase 2 since ADR-033 (2026-10-20): there is no `AWAITING_COACH` seat in MVP.* **How an `AWAITING_COACH` invitation closes** (*decided by the owner, 2026-10-08*), so it never
waits forever:

- **The coach accepts and skater B joins:** `CONFIRMED`.
- **The coach declines skater B:** `DECLINED`. It now covers either family's "no" or the
  coach's; the email to Family A says which.
- **The lesson passes before the coach acts, or the coach accepts but the join fails** (the
  ~~booking was cancelled,~~ the lesson has started~~, or it's full~~): **`EXPIRED`**. Family B is told
  the lesson was no longer available. *Revised 2026-10-13 (ADR-031): never full: the place is held
  from booking. If the inviting family cancels first, the seat ends `WITHDRAWN` (option B).*

For a recurring series, these apply lesson by lesson; what the invitation's single status shows
when some lessons join and others don't is part of the open partial-series question (Open).
*Settled by ADR-031 decision 6 (2026-10-13): each date has its own seat and status, and a
series joins lesson by lesson.* ~~When an unanswered `SENT` invitation lapses is still Kim's P5.~~ *P5, 2026-10-13: it expires when the
lesson starts, with no earlier cutoff.*

**A recurring booking shares every lesson in the series.** One invitation covers them all, and one
confirmation joins skater B to each lesson in it.

*Phase 2 since ADR-033 (2026-10-20): a sibling must already be `ACTIVE` with the coach and is added `BOOKED`; one not yet accepted can't be picked.* **A sibling is added directly.** If the code belongs to a skater in Family A's own family, there is
no invitation and no confirmation: Family A's session joins the sibling itself, since it holds both
skaters (ADR-024). The coach-acceptance rule still applies: a sibling who isn't the coach's student
yet goes to the coach first ~~with `pendingJoins` on their pending item, Family A's booking carries
the sibling as `invitedStudentId`~~, and the coach's Accept joins them exactly as above. *Since
ADR-031 decision 5 (2026-10-13): the sibling's seat is created `BOOKED` directly, or
`AWAITING_COACH` if the sibling isn't approved yet.*

**Who writes the participant item.** *Since ADR-031 decision 5 (2026-10-13), Family A's booking
writes skater B's invited seat as a **reservation** — display name and status only — ~~the one
exception ADR-024 allows~~. Family B's session converts it on accept.* *Revised 2026-10-13
(ADR-031 revision): it isn't an exception. The invited seat is Family A's own record until Family
B accepts, so ADR-024 needs no shared-lesson exception.* Whenever Family B is signed in, it's Family B's own session,
so Family A never writes anything for a skater who isn't theirs (ADR-024). ~~**The automatic join
is the one exception:** no one from Family B is signed in when the coach accepts, so the coach's
own session writes it, inside the coach's own partition, only for lessons Family B confirmed
while signed in and that name skater B as invited.~~ *Revised 2026-10-13 (ADR-031): no exception:
the coach's Accept is the coach's own write (ADR-031 d5).*

### 5a. Before and after the lesson: the warning, the banner and the nightly sweep

*Phase 2 since ADR-033 (2026-10-20).* The warning, both families' banners and the late-confirmation rule exist only for a seat waiting on the coach. In MVP the sweep handles `EXPIRE` and `ANSWER` only, and an invitation unanswered at the lesson's start expires with the ordinary "no longer available" email (ADR-033 d5, d6).

*Decided by the owner, 2026-10-09.*

*Mechanism replaced by ADR-031 decision 12 (2026-10-13): the sweep is **`sched-deadline-sweep`,
every hour**. A ~~seat~~ record with a pending deadline carries `dueAt` and `dueKind` ~~(`WARN`, `EXPIRE`,
`ANSWER`)~~ and sits in the sparse index **GSI4** only while it has one. Each run queries what's
due, re-checks each ~~seat~~ record (an invited seat, or a lesson time for `ANSWER` or `INVITER_LEFT`), acts, and sets the next deadline. Urgent emails go at once; **the
warning still waits for the 9pm run before it's due**, so it's never late and never sent at
night. The warning, banner and email rules below all still hold.* *Revised 2026-10-13 (ADR-031):
the kinds are `WARN`, `EXPIRE`, ~~`INVITER_LEFT`~~ on the invited seat; `ANSWER` on the lesson time.*
*Revised 2026-10-13 (ADR-031 d5, d12): `WARN` and `EXPIRE` on the invited seat; `ANSWER` and
`INVITER_LEFT` on the lesson time.*

**The warning.** For each lesson whose invitation is still `AWAITING_COACH`, an email goes to
**Family A, Family B and the coach** no later than **24 hours plus the coach's
`requiredNoticeHours`** (as stamped on the booking; *on the lesson time since ADR-031*) before the lesson. Families who have opted in
to texts also get a text pointing to the email (ADR-007). The coach's email is MVP, *moved from
Phase 2 by the owner*.

- *To both families:* Coach Dana hasn't accepted Mia for the shared lesson on Tue 14 Oct at
  4:00. If she doesn't, the lesson goes ahead as a private lesson.
- *To the coach:* a shared lesson on Tue 14 Oct at 4:00 is waiting for you to accept Mia, with a
  link to the pending list.

The timing gives Family A at least a day before the notice period begins, so they can cancel
without a late fee if they don't want a private lesson.

**The banner.** From the warning time until the coach accepts or declines skater B, or the
lesson starts, **both families' home screens show a red banner**. The page works it out when it
loads, from the invitation's status and the lesson time, so nothing is stored for it.

- *Family A:* "Coach Dana hasn't confirmed Mia for your shared lesson on Tue 14 Oct at 4:00.
  Unless she does, it will go ahead as a private lesson, charged at the booking's own price."
- *Family B:* "Coach Dana hasn't accepted Mia yet. If she doesn't before the lesson, Mia won't
  join the Tue 14 Oct 4:00 lesson."

*Since ADR-031 (2026-10-13), the page works it out from the seat's `seatStatus` (or
`partnerStatus`) and the lesson time.*

"The booking's own price" is what Family A booked at, so the banner stays true whatever P2
decides about shared pricing. *2026-10-13: P2 is decided; until a second skater joins, the lesson
is private at the full price.*

~~**The nightly sweep.** `consumer-invite` also runs **once a night**, right after the 9 PM
end-of-day report. It reads upcoming bookings that carry an `invitedStudentId`, by date (GSI2),
and does two things.~~ *Replaced by ADR-031 decision 12 (2026-10-13): `sched-deadline-sweep`
runs hourly and reads due seats from GSI4. The two jobs below are its `WARN` and `EXPIRE`
deadlines.*

- **It sends early, never late.** Every warning that falls due **before the next run** is sent
  now, so a warning is never up to a day late. With the default 24-hour notice period, warnings
  arrive 48 to 72 hours before the lesson. The invitation records **`warnedAt`**, so each warning
  is sent once. *(Since ADR-031: once the warning is sent, the seat's `WARN` deadline is replaced
  by its next one, so it isn't sent twice.)* A missed run catches up the next night, and ADR-010's alarm for a scheduled job
  that stops running covers a job that doesn't run at all. *Amended 2026-10-09: the alarm
  watches the sweep's own `InviteSweepCompleted` metric, because `consumer-invite`'s event-driven
  runs would hide a missed sweep (ADR-010).*
- **It closes invitations whose lesson has started.** Any invitation still `SENT` or
  `AWAITING_COACH` becomes **`EXPIRED`**, and both families are told. *(Since ADR-031: the seat
  moves to `SEATEND#` as expired, `seatsTaken` drops, and the lesson stays private at the full
  price.)* Screens already show it as
  expired from the moment the lesson starts, so the sweep only adds the emails.

**Late confirmations.** If Family B confirms after the warning would have gone, or so close that
it falls due before the next run, ~~`consumer-invite`~~ sends the warning straight away. *Kept by
ADR-031 decision 12 (2026-10-13): if a seat becomes `AWAITING_COACH` when its warning is already
due, or due before the next 9pm run, the warning is sent at once.*

**Family B's email when the lesson expires and the coach never accepted skater B:**
*"This lesson has expired. Please reach out to Coach Dana to be accepted onto her roster for any
future shared lessons. Reply to this email to reach Coach Dana."* The coach's phone and email
are not printed, because skater B is still `PENDING` (ADR-016 decision 7a). The reply goes to
the coach's `businessEmail` (ADR-016 decision 8). If skater B was already the coach's student and
the join failed for another reason, Family B gets the existing "no longer available" email.

### 6. Coaches see every skater in the slot

The coach's week view, lesson list, payments and the rinkside page show every skater in a shared
slot, each with their own attendance and payment status. A coach cancelling a lesson, day or week
cancels every skater in it, and each family is told (ADR-009).

---

## Pending Kim

Each is a question in `Items to ask Kim About.md` §8. **None of them blocks private booking**,
which is unchanged. *Since 2026-10-07 P1 and P3 are answered by the owner, and P5 in part.* *Since 2026-10-13 P2, P4 and P5 are answered too.*

| # | Question | The owner's leaning |
|---|---|---|
| **P1** | ~~The **most skaters** a coach may allow in one lesson~~ | **Answered by the owner, 2026-10-07: 2**, as a setting that may be raised (decision 1) |
| **P2** | ~~**How a shared lesson is priced**~~ | **Answered by the owner, 2026-10-13:** the lesson's set price is split between the skaters; a skater leaving in time leaves the other family to choose full price or cancel; leaving late, the other keeps their share (amendment 2026-10-13) |
| **P3** | ~~Must an invited skater **already be approved** by this coach?~~ | **Answered by the owner, 2026-10-07:** no to be invited; yes before any lesson is booked for them (decision 5). Kim §6 can't remove this approval *Superseded for MVP 2026-10-20 by ADR-033: the skater must already be `ACTIVE` with the coach to be invited.* |
| **P4** | ~~If the **booking family cancels**, what happens to the invited skaters?~~ | **Answered by the owner, 2026-10-13:** the same as either skater leaving (amendment 2026-10-13) |
| **P5** | ~~If an invitation **isn't confirmed in time**~~ | **Partly answered by the owner, 2026-10-07:** if the coach hasn't accepted the skater, the lesson goes ahead private. **Answered by the owner, 2026-10-13:** an invitation the family hasn't accepted has no cutoff before the lesson; it expires when the lesson starts, and the lesson goes ahead private. ~~Leaning towards the coach's notice period (24 hours by default)~~ |

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

- ~~**Private booking is unchanged.** The slot lock, the booking item and every existing flow stay
  as they are. Sharing adds to them.~~ *Replaced by ADR-031 (2026-10-13): private and shared
  lessons share one path, a lesson time with one seat or two.*
- ~~**Fourteen functions.**~~ *Sixteen functions since ADR-031 (ADR-001's 2026-10-13 amendment).* *Since ADR-031 (2026-10-13), `consumer-invite` no longer keeps
  `INVITE#` copies in step, and its nightly run is replaced by `sched-deadline-sweep`; see ADR-001's
  2026-10-13 amendment for the count.* `consumer-invite` joins `consumers.jar`: it ~~reads and writes invitations
  in both families' partitions and~~ sends email and text, so it holds `ses:SendEmail` and
  `sns:Publish`. ~~*Settled 2026-10-07:* its permissions are unchanged by decision 5's rewrite.~~ ~~It
  also reacts to the `STUDENT#` item changing when the coach accepts or declines, to update
  invitations and tell families, which needs no database write outside the families'
  partitions.~~ *Revised 2026-10-13 (ADR-031): `consumer-invite` reacts to seat changes only;
  the coach's Accept or decline changes the seats themselves (ADR-031 d6).* *Revised 2026-10-13 (ADR-031): reads, plus `UpdateItem` limited to the copied
  fields; no Put or Delete (ADR-031 Consequences).*
- *Phase 2 since ADR-033 (2026-10-20): the coach's Accept no longer touches seats.* **No new database permission for the automatic join.** It runs in `api-coach` under
  `coach-tenant` (ADR-001 A8), which already writes and updates items in the coach's own
  partition. ~~The booking gains **`invitedStudentId`**; the pending `STUDENT#` item gains
  **`pendingJoins`**.~~ *Since ADR-031 (2026-10-13): neither exists; the Accept updates
  `AWAITING_COACH` seats.*
- **Four new item types:** ~~`PARTICIPANT#` (coach's partition), `INVITE#` (each family's
  partition)~~, `SKATERCODE#` (its own partition), and the `shareCode` on `SKATER#`. One new event,
  ~~`InviteChanged`~~. *Replaced by ADR-031 (2026-10-13): `LESSON#`, `SEAT#` and `SEATEND#` in the
  coach's partition, and GSI4. ~~The share-code record now also holds the skater's family
  `clientId`, never returned to the caller.~~* *Revised 2026-10-13 (ADR-031 revision): the
  share-code record doesn't need `clientId`. The invited seat has no `clientId` until Family B
  accepts, and accepting sets it from Family B's own session.*
- **`client-tenant` gains one read statement**, so the gate tests (runbook
  `database-gate-tests.md`) gain rows: a share-code lookup returns only the display name; any
  other attribute, no projection, or a `Query` is refused. *(Since 2026-10-20: `studentId` and the display name, ADR-022.)*
- **Everything that walks a lesson must include ~~participants~~ every seat (*ADR-031*):** the schedule-change consumer's
  cancel and re-price (ADR-020), the change notifier (one message per family), the drift check,
  the end-of-day report, the coach's cancellation, and erasure on request.
- **Lapsing invitations need a timer** if Kim agrees to P5. Nothing today fires at a per-booking
  time; EventBridge Scheduler's one-off schedules are the likely fit, to be decided with P5.
  *Amended 2026-10-09: the nightly sweep (decision 5a) covers the warning and the expiry. P5's
  lapse before the lesson may still need a precise timer.* *Replaced by ADR-031 (2026-10-13): P5,
  when decided, becomes one more `dueKind` for the hourly sweep. Nothing needs better than an
  hour.* *P5 decided 2026-10-13: no cutoff before the lesson, so no new `dueKind`; the existing
  `EXPIRE` at the lesson start is the only lapse.*
- **New screens:** the share code on a skater's profile; "add a skater to share" on booking;
  invitations to confirm or decline; both skaters on a shared booking; every skater in a slot on
  the coach's views. None is in the Harbor designs. *2026-10-13: designed in `design/harbor` (family and coach
  sites).*

**Tests** (ADR-013 decision 4):

- ~~Two invitations confirmed at once for the last place: one joins, one is refused.~~
  *Revised 2026-10-13 (ADR-031): can't happen; the invited seat holds the place.*
- A ~~participant~~ seat never appears in another family's availability query.
- Family 1's session can't write a ~~participant item~~ seat for Family 2's skater, except the
  `INVITED` reservation, which holds only display name and status (*ADR-031, 2026-10-13*).
  *Revised 2026-10-13 (ADR-031 revision): Family 1's session also can't change Family 2's seat
  once Family 2 has accepted it — not ~~the share,~~ the status or the partner fields.* *Revised
  2026-10-13 (ADR-031): no share is stored; it is worked out (ADR-031 d7).*
- A share-code lookup returns the display name and nothing else. *(Since 2026-10-20: the family sees only the display name; the server's read also returns `studentId`, ADR-022.)*
- A coach cancelling a shared lesson cancels every skater and notifies each family once.
- ~~A `pendingJoins` entry for a lesson whose `invitedStudentId` isn't that skater writes nothing.~~
  *Obsolete since ADR-031 (2026-10-13): there are no `pendingJoins`. The Accept changes only that
  skater's own `AWAITING_COACH` seats.*
- *Phase 2 since ADR-033 (2026-10-20): no Accept joins seats; see ADR-033 Consequences for MVP's tests.* A coach accepting after the lesson has started writes nothing, and Family B is told.

---

## Open (not for Kim)

- ~~**Recurring shared lessons.** Whether one invitation covers a whole recurring series —
  **yes**, decided by the owner 2026-10-07 (decision 5). Still open: what happens when skater B
  can't join some dates in the series (for example, a clash with another lesson). Can Family B
  accept the dates that work, or is it all or none?~~ **Settled 2026-10-13 by
  [ADR-031](ADR-031-lessons-and-seats.md) decision 6:** a series joins **lesson by lesson**. Each
  date succeeds or fails on its own, and Family B gets the dates that work.
- ~~**Gaps in how a shared lesson ends.**~~ **Closed 2026-10-13 by ADR-031 decisions 7–10:** how a
  participant leaves (either family, the same rules); what happens when the booking family leaves
  and the invited family stays (neither owns the lesson, so the staying family keeps it private or
  cancels); whether a freed place can take a new invite (yes, one lesson only, from My bookings);
  and how re-pricing applies to split shares (~~re-split after a re-price; paid and waived seats
  never change~~ *revised 2026-10-13, ADR-031 revision: a re-price changes only the lesson time's
  price; shares ~~not yet fixed~~ follow it~~, and a seat with a fixed `amountMinor` keeps it~~*; *Revised 2026-10-13: no amount is copied onto a seat; it's worked out from the lesson time (ADR-031 d7).*).
- ~~**A skater in two places at once.** Joining a shared lesson that clashes with the skater's other
  lesson gets ADR-025's warning; confirm that's enough here too.~~ **Settled 2026-10-07**
  (decision 5): the confirm page shows clashes and the family chooses; they aren't re-checked at
  join time.
- ~~**What lowering `maxSkaters` does** to lessons already booked with more skaters.~~ **Settled
  2026-10-12 by the owner:** a lesson already booked can't have its `maxSkaters` lowered. The
  stamp (decision 1) is the intended behaviour, so a schedule edit changes only lessons booked
  afterwards.

---

## Revisit if

- ~~Kim's answer removes coach approval (P3). ADR-024's `requireActive` changes with it.~~ **No
  longer applies** — the owner made coach acceptance a standing rule (P3, 2026-10-07).
- Families want to find each other to share, rather than arranging it outside the app. That's the
  "open spots" alternative, and it reopens the visibility question.
