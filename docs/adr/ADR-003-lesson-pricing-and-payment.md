# ADR-003: Lesson Pricing and Payment Tracking

## Status

**Partially superseded by [ADR-004](ADR-004-schedule-patterns.md)** — 2026-07-29.
Decisions **1** (price on the coach profile), **3a** (lesson duration on the coach
profile) and **3b** (duration changes apply to slots created after the change) are
replaced: lesson length and price both belong to a **schedule pattern**, not to the
coach. Decision **2** (price stamped on the booking at creation) and decisions
**4–7** (payment tracking, sparse unpaid index, payment instructions, amount in the
email) stand unchanged, and decision 2 becomes load-bearing under ADR-004.

**Amended by [ADR-007](ADR-007-sms-message-constraints.md)** — 2026-08-17. Decision
**7** — the reminder states the amount "plus the coach's `paymentInstructions`" —
describes the **email**. An SMS is one 160-character GSM-7 segment and never carries
user-authored free text, so its form states the amount and points at the email.

**Amended — 2026-08-20.** Decision **2** stamps `priceMinor` onto the booking at creation
so that a later rate change cannot rewrite what a client already owes. `currency` was left
on the coach profile, which leaves the same hole open by a different route: switching a
coach from USD to CAD silently reinterprets every historical amount. **`currency` is now
stamped onto the booking alongside `priceMinor`.**

**Further superseded by [ADR-008](ADR-008-schedule-editor.md)** — 2026-08-23. Decision
**1** (the coach sets a default lesson price at signup) and decision **3a** (lesson
duration is any positive value, not a menu) are both replaced: price is a field on the
schedule form, and duration is a fixed menu of 30/45/60/90/120 minutes. `currency` is
still captured at signup and remains on the coach profile.

**[ADR-009](ADR-009-cancellation.md)** — 2026-08-23 — answers part of this ADR's open
question about what is owed: a **cancelled** lesson is never billed. Whether a **no-show**
is owed remains unresolved.

**Amended by [ADR-020](ADR-020-repricing-booked-lessons.md)** — 2026-09-30. Decision **2**'s
stamp now protects **past** lessons, and anything already marked paid or waived. An upcoming
lesson follows the coach's current price — increases only beyond the notice period, decreases
at once — and the family is told.

**Amended — 2026-10-09.** *Decided by the owner, 2026-10-07, from talking with Kim.* Decision
**4** records **how the client paid**. The coach chooses it on the payment dashboard; the
options are the payment handles on the coach's profile ([ADR-016](ADR-016-coach-signup.md)
decision 7), plus *Other*. No free text.

**Amended — 2026-10-12.** *Decided by the owner.* Decision **4**'s how-paid options gain
**Cash**, but only for a coach who turned cash on at sign-up or on their profile (ADR-016
decision 7, amended the same day). How-paid is **optional** when marking a lesson paid,
**editable** afterwards, and seen **only by the coach**. Unpaid history stays coach-only;
showing it to the client is **Phase 2** (Open).

**Amended — 2026-10-13.** *Decided by the owner.* **Personal prices move to Phase 2.** In MVP every
skater pays the schedule's price; `priceMinorOverride` (decision 2) isn't set or shown, and the
coach's Students list has no price column. The shape of a personal price or discount (Kim's list
§5) is decided with Phase 2.

**Amended — 2026-10-12, later.** *Decided by the owner.*
- **"Seen only by the coach" is a screen rule, not a data rule.** No client screen shows
  `paidVia`. A family's own booking may still carry it in the client API's response, since
  their bookings are read whole through GSI1 (ADR-022). That exposure is accepted: it is the
  family's own payment. *Note 2026-10-13: under ADR-031 it is the family's own **seat** that is
  read through GSI1 and carries `paidVia`; the rule is unchanged.*
- **The how-paid options are the payment types the coach has switched on, plus *Other*.** Each
  type has its own switch (ADR-016 decision 7, amended the same day), which settles whether
  *Show my payment handles* affects the list: that switch is replaced.

**Superseded in part — 2026-10-13.** *Decided by the owner.*
[ADR-031](ADR-031-lessons-and-seats.md) replaces the booking item with a **lesson time** (the
coach's) and a **seat** for each skater in it. The price stamps (`priceMinor`, `currency`,
`missedLessonFeeMinor`) now live on the lesson time, which is created from the schedule, so they
are stamped by existing (ADR-031 decision 1). Payment status, how-paid, paid and waived are now
**per seat** (decisions 2 and 14). A shared lesson's one price is split evenly among its booked
seats, with odd cents going one each to the earliest-joined seats (decision 7). Every behaviour
rule still holds unless ADR-031 says otherwise. *Revised 2026-10-13 (ADR-031 revision): the
total price is stored only on the lesson time (`priceMinor`). A share is worked out as
`priceMinor ÷ shareCount` (a lesson-time attribute), not stored on the seat. A seat gets a
fixed `amountMinor` only at check-in, at a no-show, or when marked paid or waived.*

**Accepted** — 2026-07-29. Closes the gap where MVP feature #6 (payment-reminder
email on check-in) had no amount to send: `BOOKING` carried only
`paymentReminderSent: bool`, and no price, rate or balance existed anywhere in the
model. Adds attributes and access patterns to §4, §5 and §10.

---

## Context

`architecture.md` describes BladeBook as a "payment-**reminder** platform" and §10
explicitly excludes in-app payments from MVP. So the system never moves money — it
tells a client what they owe and gives the coach a way to record that it arrived.

That still requires four things the model lacked: a price, a way to express what a
given lesson costs, a record of whether it has been paid, and instructions telling
the client how to pay.

---

## Decision

### 1. The coach sets a default lesson price at signup

`COACH#<coachId>/PROFILE` gains `defaultPriceMinor` and `currency`.

**Money is stored as an integer in minor units** (cents), never as a decimal or
float. `$50.00` is `5000`. This is not a stylistic preference: binary floating point
cannot represent `0.10` exactly, and money arithmetic in `double` produces amounts
that are wrong by a cent in ways that are extremely hard to explain to a client.
Format to a decimal string only at the edge, when rendering the email or the UI.

### 2. Price is stamped on the booking at creation

~~`BOOKING` gains `priceMinor`, resolved once when the booking is created:~~

```
booking.priceMinor  ←  student.priceMinorOverride   (if set)
                    ←  coach.defaultPriceMinor      (otherwise)
```

`STUDENT` gains an optional `priceMinorOverride`, which is how a coach gives one
student a standing rate different from everyone else. ~~A coach may also edit
`priceMinor` on an individual booking after the fact, for a one-off adjustment.~~ *Removed
2026-10-13 by the owner (ADR-031): no booking stores its own price any more; a one-off is
covered by marking the lesson waived.*

**Stamping is the load-bearing part.** Because the price is copied onto the booking
rather than looked up at send time, raising the default rate in March cannot
retroactively change what a client owes for a lesson booked in February. A design
that resolved price lazily would silently rewrite history every time a coach
adjusted their rate — and the client would have already received an email quoting
the old number.

*Replaced by ADR-031 decision 1 (2026-10-13): `priceMinor` and `currency` are stamped on the
**lesson time** (`LESSON#`), which exists before anyone books it, not on a booking. ~~Each skater's
**seat** carries `shareMinor`, its part of that price:~~ Each skater's share is the full price for
a private lesson, an even split for a shared one (decision 7). The stamping principle is
unchanged.* *Revised 2026-10-13 (ADR-031 revision): the share is worked out from the lesson
time (`priceMinor ÷ shareCount`), not stored. The seat's `amountMinor` is fixed only at check-in,
at a no-show, or when marked paid or waived. Once fixed, it never changes.*

### 3. Price is flat per lesson, independent of duration

One booking, one price. Two lessons cost twice as much whether they are back-to-back
or morning and afternoon — adjacency is not a concept in the model, just two
bookings.

Duration does **not** multiply the price. A coach sets a lesson length and a lesson
price as two independent settings; a 30-minute lesson and a 300-minute lesson both
cost whatever that coach's price is. If a coach wants a longer lesson to cost more,
they change both settings together.

### 3a. Lesson duration is coach-configured and unconstrained

`COACH#<coachId>/PROFILE` carries `defaultDurationMinutes` — any positive value the
coach chooses, not a selection from a fixed menu. This **supersedes** the
`slotDurationOptions "e.g. [30,60,90]"` field in `architecture.md` §4, which implied
a preset list.

### 3b. Both duration and price are changeable, and changes apply going forward

A coach can change their lesson length and their price at any time. Neither change
touches a lesson that is already booked. The two settings reach that outcome by
different routes, and the difference matters:

**Price needs no special handling.** Decision #2 already stamps `priceMinor` onto the
booking at creation, so a booked lesson holds its own price permanently and a rate
change simply applies to whatever gets booked next. An open slot carries no price at
all — it acquires one when someone books it. This falls out of the stamping design
for free.

**Duration needs a rule, because changing it retroactively can corrupt a schedule.**
A change to `defaultDurationMinutes` applies to **availability slots created after
the change**. Existing slots — including open, unbooked ones — keep the duration
they were created with.

The reason is collision: if a coach with 30-minute slots at 9:00, 9:30 and 10:00
switches to 300 minutes, rewriting the open 9:00 slot would make it swallow the
other two. There is no correct automatic answer to that, so the system does not
guess. A coach who wants existing open slots at the new length deletes them and
publishes new ones — an explicit, visible action rather than a silent rewrite of
their calendar.

### 4. Payment is tracked per booking, with no ledger

~~`BOOKING` gains `paymentStatus` (`UNPAID` | `PAID`), `paidAt`, and `markedPaidBy`.~~
Every booking is independently owed, and there is no running balance, no account
credit, and no partial payment.

*Replaced by ADR-031 decisions 2 and 14 (2026-10-13): payment is tracked **per seat**. Each
skater's seat carries `paymentStatus`, `paidAt`, `markedPaidBy`, `paidVia`, `waivedAt`,
`waivedBy` and `paymentReminderSent`, and is owed its own ~~`shareMinor`~~ share. In a shared
lesson each family's seat is marked paid or waived on its own. No ledger, as before.* *Revised
2026-10-13 (ADR-031 revision): the share is worked out from the lesson time until it is fixed
on the seat as `amountMinor` — at check-in, at a no-show, or when marked paid or waived.*

The coach website gets a **mark as paid** action. This is the only way a booking becomes
`PAID` — nothing else in the system can set it, because nothing else observes money
changing hands.

`paymentReminderSent` stays as it is, and remains distinct from `paymentStatus`:
one records that we asked, the other records that they paid.

> **Amended 2026-08-30 — `WAIVED`, and the coach payment dashboard.**
>
> **`paymentStatus` becomes `UNPAID | PAID | WAIVED`.** A coach can forgive a charge —
> illness, a family emergency, a rink closure — and the dashboard gets a **mark as waived**
> action alongside mark as paid. `waivedAt` and `waivedBy` are recorded for the same reason
> `paidAt` and `markedPaidBy` are: this is a decision about money and should say who made it.
>
> **This does not introduce a ledger and does not need one.** Waiving decides that money was
> never owed — a terminal state on one booking. It is not a transaction, carries no amount,
> and moves no balance. A *refund* would be a transaction and would break this model; a waive
> does not. The distinction is what makes this amendment cheap.
>
> **Decision 5's sparse index needs no change.** `GSI3PK`/`GSI3SK` are written only while a
> booking is `UNPAID`, so `WAIVED` drops the item out of the unpaid index exactly as `PAID`
> does. The waived lesson stops being outstanding, which is the intent.
>
> **A manual *send a payment reminder* action is Phase 2, and it changes what the
> reminder fields have to record.** `paymentReminderSent` is a boolean, which says only that
> we asked once; a coach who can press send repeatedly needs a history.
>
> `paymentReminderSent` is **kept unchanged** — ADR-010 uses it as the idempotency guard on
> the automatic payment-reminder consumer, and a redelivered event must still not double-send.
> `paymentReminderCount` and `lastPaymentReminderAt` arrive **with the Phase-2 manual action**
> and record the full history. Two fields for two jobs: one guards a consumer, the other is an
> audit trail — and the only available brake on a coach sending the same family a reminder
> every hour, and on the SMS cost of doing so (ADR-007). Nothing rate-limits it today, which
> is a gap to close when the button ships rather than after.
>
> Source: `FeatureDecriptions/Coach Payment Section on Dashboard.md`.

> **Amended 2026-10-09 — how the client paid.** *Decided by the owner, 2026-10-07.* The coach
> records how each lesson was paid, as `paidVia` on the booking, alongside `paidAt` and
> `markedPaidBy` — and on a paid `CANCELLED#` record in Phase 2 (ADR-015). The coach enters it; nothing else observes money changing hands.
>
> - **The options are the handles the coach has filled in on their profile, plus *Other*.**
>   A coach with only a Cashapp handle sees Cashapp and Other; a coach with no handles sees
>   only Other.
> - **There is no free text.** A payment that matches no handle is *Other*.
>
> ~~Still open (`Open-Pending.md` §3): whether *Show my payment handles*
> (`displayPaymentTypesToClients`) affects the list.~~ **Settled 2026-10-12:** the switch is
> replaced by one switch per payment type (ADR-016 decision 7); the list is the types switched
> on, plus *Other*. ~~Whether cash should be a fixed option
> (needs Kim).~~
>
> **Amended 2026-10-12 — cash, and the details.** *Decided by the owner.*
>
> - **Cash is not a fixed option.** It's a payment type the coach turns on at sign-up or on
>   their profile (`acceptsCash`, ADR-016 decision 7). It appears in the list only when it's
>   on. No other types are added; cheques and Interac e-transfer are *Other*.
> - **`paidVia`** is one of `CASH`, `CASHAPP`, `VENMO`, `PAYPAL`, `OTHER`, stored on the
>   booking, so removing a payment type from the profile later doesn't change past records.
> - It is **optional** when marking a lesson paid, **editable** afterwards, and **seen only by
>   the coach**. A waived lesson has none.
>
> Source: `FeatureDecriptions/Coach Payment Section on Dashboard.md`.

### 5. Unpaid lessons are visible via a sparse index

The coach needs to see that a student has an unpaid lesson from a previous session.
This is served by a **sparse GSI**: `GSI3PK` / `GSI3SK` are written **only while a
booking is `UNPAID`** and removed when it is marked paid, so the item drops out of
the index entirely.

`GSI3PK = COACH#<coachId>`, `GSI3SK = UNPAID#<date>#<studentId>`

*Note — 2026-10-13: under ADR-031 decision 2 these keys are written on the **seat** while it is
`UNPAID`, one entry per skater.* *Revised 2026-10-13 (ADR-031 revision): the unpaid list shows
each seat's `amountMinor`.*

That gives "every outstanding lesson for this coach, oldest first" as a single
query over an index containing *only* unpaid bookings — which stays small
permanently, because paid bookings leave it. Filtering the main table instead would
mean scanning an ever-growing history to find a shrinking set of debts.

*Cheaper alternative if a third index is unwanted: query GSI1 per student and filter
on `paymentStatus`. That serves the per-student view but not the coach's
"who owes me anything" view, which would degrade as history accumulates.*

### 6. Payment instructions are free text on the coach

`COACH#<coachId>/PROFILE` gains `paymentInstructions` — a free-text field captured
at signup and editable on the coach website, interpolated verbatim into the payment
reminder email. Coaches take e-transfer, Venmo, cash at the rink, or something we
have not thought of; the system does not need to model any of it.

Two handling requirements, since this is user-authored content that lands in an
outbound email:

- **HTML-escape it** when rendering the email body. A coach pasting an ampersand or
  an angle bracket must not be able to break or inject into the message.
- Treat it as **PII-adjacent** — it will in practice contain phone numbers, email
  addresses and payment handles. It inherits §7's encryption and access-logging
  posture like any other contact data.

### 7. The reminder email states the amount

Per §6.3, the payment reminder fires on `CheckInRecorded` and now contains the
specific amount owed for that lesson — formatted from ~~`priceMinor`~~ and `currency` —
plus the coach's `paymentInstructions`. Not "payment is due"; a number.

*Replaced by ADR-031 decisions 2 and 7 (2026-10-13): the amount is the seat's ~~`shareMinor`~~
share — the full price for a private lesson, the skater's even share for a shared one.* *Revised
2026-10-13 (ADR-031 revision): the amount is the seat's `amountMinor`, fixed at check-in.*

Consistent with ADR-002 §7, this is **one email per lesson**. A client with two
children checked in on the same day receives two reminders, each with its own
amount.

---

## Access patterns added to §5

| # | Query | Served by |
|---|---|---|
| 11 | List a coach's unpaid bookings, oldest first | **GSI3** (sparse), `GSI3PK = COACH#<coachId>` |
| 12 | List a student's unpaid bookings | GSI1 by student, filtered on `paymentStatus` |

---

## Consequences

**Easier.** No payment processor, no PCI scope, no webhooks, no refunds, no
reconciliation — the system is a notifier and a checklist. Price stamping means the
payment reminder Lambda needs no pricing logic at all: it reads a number off the
booking it was handed.

**Harder.** The coach website grows a payments surface that §10 did not budget for: a
mark-as-paid action and an outstanding-lessons view. That belongs to feature #6 and
should be added to the MVP scope list.

**Accepted risk.** Payment state is entirely self-reported by the coach. If they
forget to mark a lesson paid, the client keeps appearing as in arrears. There is no
reconciliation against anything, by design — a payment processor is the Phase-2
answer and this ADR should be revisited wholesale when it lands.

---

## Open

- ~~Currency.~~ **Settled 2026-08-30: two values, `USD` and `CAD`, defaulting to `USD`.**
  The coach picks at signup; it lives on the coach profile and is stamped onto every booking
  at creation, per this ADR's 2026-08-20 amendment. **Changing it later is Phase 2.**
  
  One consequence of stamping, which only bites once Phase 2 allows the change: bookings made
  before a switch keep their original currency, so a coach who moves from `USD` to `CAD` has
  outstanding lessons in both. That is the intended behaviour — the whole point of stamping is
  that a change cannot rewrite what a client already owes — but the payment dashboard must
  render each lesson in its own currency and **must not sum a mixed list into a single total**.
- ~~Does a coach have one lesson length at a time, or a menu of them?~~ **Settled by
  [ADR-008](ADR-008-schedule-editor.md) decision 2a: a menu, carried by blocks.** A block is
  `{ seq, blockName?, startTime, endTime, lessonMinutes, priceMinor, missedLessonFeeMinor }` and a day holds
  several, so 30-minute lessons at 6am and 60-minute lessons at 8am coexist with their own
  prices and require no setting change between them. The answer did not take the shape this
  item predicted — not named lesson types on the coach profile, but duration and price moved
  onto the block, which is why decision 3a reads as superseded rather than extended.
- ~~**Is unpaid history shown to the client, or only to the coach?**~~ **Moved to Phase 2
  by the owner, 2026-10-12:** coach-only in MVP. If clients should see their own arrears,
  that is a client-app view plus a decision about whether the reminder email mentions prior
  debts.
- ~~Is a no-show owed? `BOOKING.bookingStatus` has `NO_SHOW`, and the payment reminder~~ **Settled 2026-08-30 by [ADR-015](ADR-015-late-cancellation-and-no-show-charges.md): yes** — charged under the same rule as a late cancellation.

---

## Revisit if

- A payment processor is introduced (§10 Phase 2) — decisions #4, #5 and #6 are all
  superseded by that, and `paymentStatus` stops being self-reported.
- Coaches start offering packages, prepaid blocks, or recurring lessons — all three
  break "every booking is independently owed" and require a real ledger.
- A coach needs to bill in more than one currency, or coaches in different countries
  share a deployment.
