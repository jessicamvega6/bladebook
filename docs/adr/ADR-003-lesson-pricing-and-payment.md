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

`BOOKING` gains `priceMinor`, resolved once when the booking is created:

```
booking.priceMinor  ←  student.priceMinorOverride   (if set)
                    ←  coach.defaultPriceMinor      (otherwise)
```

`STUDENT` gains an optional `priceMinorOverride`, which is how a coach gives one
student a standing rate different from everyone else. A coach may also edit
`priceMinor` on an individual booking after the fact, for a one-off adjustment.

**Stamping is the load-bearing part.** Because the price is copied onto the booking
rather than looked up at send time, raising the default rate in March cannot
retroactively change what a client owes for a lesson booked in February. A design
that resolved price lazily would silently rewrite history every time a coach
adjusted their rate — and the client would have already received an email quoting
the old number.

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

`BOOKING` gains `paymentStatus` (`UNPAID` | `PAID`), `paidAt`, and `markedPaidBy`.
Every booking is independently owed, and there is no running balance, no account
credit, and no partial payment.

The coach app gets a **mark as paid** action. This is the only way a booking becomes
`PAID` — nothing else in the system can set it, because nothing else observes money
changing hands.

`paymentReminderSent` stays as it is, and remains distinct from `paymentStatus`:
one records that we asked, the other records that they paid.

### 5. Unpaid lessons are visible via a sparse index

The coach needs to see that a student has an unpaid lesson from a previous session.
This is served by a **sparse GSI**: `GSI3PK` / `GSI3SK` are written **only while a
booking is `UNPAID`** and removed when it is marked paid, so the item drops out of
the index entirely.

`GSI3PK = COACH#<coachId>`, `GSI3SK = UNPAID#<date>#<studentId>`

That gives "every outstanding lesson for this coach, oldest first" as a single
query over an index containing *only* unpaid bookings — which stays small
permanently, because paid bookings leave it. Filtering the main table instead would
mean scanning an ever-growing history to find a shrinking set of debts.

*Cheaper alternative if a third index is unwanted: query GSI1 per student and filter
on `paymentStatus`. That serves the per-student view but not the coach's
"who owes me anything" view, which would degrade as history accumulates.*

### 6. Payment instructions are free text on the coach

`COACH#<coachId>/PROFILE` gains `paymentInstructions` — a free-text field captured
at signup and editable in the coach app, interpolated verbatim into the payment
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
specific amount owed for that lesson — formatted from `priceMinor` and `currency` —
plus the coach's `paymentInstructions`. Not "payment is due"; a number.

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

**Harder.** The coach app grows a payments surface that §10 did not budget for: a
mark-as-paid action and an outstanding-lessons view. That belongs to feature #6 and
should be added to the MVP scope list.

**Accepted risk.** Payment state is entirely self-reported by the coach. If they
forget to mark a lesson paid, the client keeps appearing as in arrears. There is no
reconciliation against anything, by design — a payment processor is the Phase-2
answer and this ADR should be revisited wholesale when it lands.

---

## Open

- **Currency.** `currency` exists as a field but no value is chosen, and nothing in
  the docs establishes whether coaches are US or Canadian. Multi-currency is not
  supported: the field is per-coach, so one coach cannot bill in two currencies.
- **Does a coach have one lesson length at a time, or a menu of them?** Decision 3a
  reads the clarification as *one current length*, changeable — so a coach offering
  both 30- and 60-minute lessons in the same week would have to change the setting
  between publishing the two sets of slots. If coaches need a genuine menu, 3a
  becomes a list of named lesson types (each with its own duration and price), which
  is a larger change and is much cheaper before feature #2 is built than after.
- **Is unpaid history shown to the client, or only to the coach?** Read as
  coach-facing only. If clients should see their own arrears, that is a client-app
  view plus a decision about whether the reminder email mentions prior debts.
- **Is a no-show owed?** `BOOKING.status` has `NO_SHOW`, and the payment reminder
  fires on check-in — so as specified, a no-show is never billed. This overlaps
  Gap 3 (cancellation) and should be settled there.

---

## Revisit if

- A payment processor is introduced (§10 Phase 2) — decisions #4, #5 and #6 are all
  superseded by that, and `paymentStatus` stops being self-reported.
- Coaches start offering packages, prepaid blocks, or recurring lessons — all three
  break "every booking is independently owed" and require a real ledger.
- A coach needs to bill in more than one currency, or coaches in different countries
  share a deployment.
