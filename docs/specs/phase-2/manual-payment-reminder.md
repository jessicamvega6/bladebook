# Spec: Manual payment reminder (Phase 2)

**Status:** Draft — 2026-11-16
**Sources:** ADR-003 (decisions 4, 6, 7 and the 2026-08-30 amendment), ADR-007 (amendment of
ADR-003 d7), ADR-010 (decision 2, via ADR-003), ADR-018, ADR-031 (decisions 2, 7),
`FeatureDecriptions/Coach Payment Section on Dashboard.md`, `FeatureDecriptions/Email templates Needed:`
("Payment reminder"), `FeatureDecriptions/C_Coach Profile.md` ("Visibility & texts", "Payments"),
`FeatureDecriptions/SMS Messages.md`, `docs/Open-Pending.md` §3, ADR-MASTER §12, §24,
`docs/architecture.md` §5 (`SEAT`) and §6.3.
**Depends on:** the Minimum Viable Product (MVP) payment dashboard (ADR-MASTER §12) and the MVP automatic payment reminder
sent on check-in (`consumer-payment-reminder`, `CheckInRecorded`).
**Out of scope:** the missed-lesson fee reminder sent on a no-show or a late cancellation
(`missed-lesson-fee.md`); text messages (SMS) to families in general (`FeatureDecriptions/SMS Messages.md`);
the coach's weekly unpaid-lessons email (MVP, ADR-018).

## Summary
In MVP a family gets one payment reminder, automatically, when their skater is checked in, and
the Payments page's *Send reminders* button is disabled and tagged Phase 2. From Phase 2 the coach
can send a payment reminder by hand for an unpaid lesson. Each reminder sent is counted on the
seat, and a rate limit stops a coach sending the same family reminders over and over.

## Assumed in every example
- Coach Dana Park teaches in US dollars (USD). Her payment instructions read "Venmo or cash at the
  rink", and she has Venmo switched on with handle `@dana-skates`.
- Skater Mia R. (the Rossi family) was checked in to Dana's private lesson on Tuesday 2027-03-02
  16:00, priced $50.00 (`priceMinor = 5000`). The automatic reminder went out then, so the seat
  has `paymentReminderSent = true`, `paymentReminderCount = 1` and `lastPaymentReminderAt =
  2027-03-02T16:06`.
- The seat is still `UNPAID`. Now is **Tuesday 2027-03-09 10:00** in Dana's time zone.

## 1. Sending a reminder by hand

**1.1 The coach sends a reminder for an unpaid lesson**
- **Given** Mia's seat for 2027-03-02 is `UNPAID`
- **When** Dana sends a payment reminder for it from Payments
- **Then** the Rossi family is emailed a payment reminder for that lesson
- **And** the seat stores `paymentReminderCount = 2` and `lastPaymentReminderAt = 2027-03-09T10:00`
*(source: FeatureDecriptions/Coach Payment Section on Dashboard.md ("To send a payment reminder. phase 2"); ADR-003 d4 amendment 2026-08-30; architecture.md §5, `SEAT`)*

**1.2 The reminder states the amount owed, in the lesson's currency**
- **Given** Dana has sent a reminder for Mia's 2027-03-02 lesson
- **When** the Rossi family opens the email
- **Then** it states $50.00 owed for Mia's lesson on Tuesday 2 March, and Dana's payment
  instructions, "Venmo or cash at the rink", and her Venmo handle
*(source: ADR-003 d6, d7; FeatureDecriptions/Email templates Needed:, "Payment reminder"; FeatureDecriptions/C_Coach Profile.md, "Payments")*

**1.3 In a shared lesson the reminder states the skater's share**
- **Given** Mia shared the 2027-03-02 lesson with Leo T. (`shareCount = 2`), and Mia's seat is `UNPAID`
- **When** Dana sends a reminder for Mia's seat
- **Then** the Rossi family's email states $25.00, worked out from the lesson time, and no amount is
  written to the seat
- **And** nothing is sent to Leo's family
*(source: ADR-031 d7; FeatureDecriptions/Email templates Needed:, "Payment reminder")*

**1.4 Replies reach the coach's business email**
- **Given** Dana has sent a reminder for Mia's lesson
- **When** the Rossi family replies to it
- **Then** the reply goes to Dana's business email
*(source: FeatureDecriptions/C_Coach Profile.md, "Visibility & texts" ("replies always reach the business email"))*

## 2. Counting and limiting

**2.1 A manual send doesn't touch the automatic reminder's guard**
- **Given** Mia's seat has `paymentReminderSent = true`
- **When** Dana sends a reminder for it by hand
- **Then** `paymentReminderSent` stays `true`, and only `paymentReminderCount` and
  `lastPaymentReminderAt` change
*(source: ADR-003 d4 amendment 2026-08-30 ("`paymentReminderSent` is kept unchanged"))*

**2.2 A redelivered check-in event still sends nothing twice**
- **Given** Mia's seat has `paymentReminderSent = true`
- **When** `CheckInRecorded` for that seat is delivered again
- **Then** no payment reminder is sent and `paymentReminderCount` is unchanged
*(source: ADR-003 d4 amendment 2026-08-30; ADR-010 d2 via ADR-MASTER §19)*

**2.3 A send inside the rate limit is refused**
- **Given** Dana sent a reminder for Mia's seat at 10:00, and the rate limit's window has not passed
- **When** Dana sends another reminder for the same seat
- **Then** it is refused and nothing is sent
- **And** `paymentReminderCount` and `lastPaymentReminderAt` are unchanged
*(source: ADR-003 d4 amendment 2026-08-30 ("a gap to close when the button ships"); Open-Pending §3, "Rate-limit the manual payment reminder")*

## 3. Rules that must always hold
- **The rate limit exists before the button ships.** Its value is configuration. *(ADR-003 d4
  amendment 2026-08-30; Open-Pending §3)*
- **`paymentReminderSent` records that the automatic reminder went; `paymentReminderCount` and
  `lastPaymentReminderAt` record every reminder.** Neither is payment status. *(ADR-003 d4;
  architecture.md §5: "includes manual re-sends")*
- **One email per lesson**, each with its own amount. *(ADR-003 d7)*
- **The coach's payment instructions are HyperText Markup Language (HTML)-escaped** in the email and treated as personal
  data. *(ADR-003 d6)*
- **No amount is copied onto the seat**; the amount is worked out from the lesson time.
  *(ADR-031 d7)*
- **BladeBook never moves money.** A reminder changes no `paymentStatus`. *(ADR-003 d4; ADR-MASTER §12)*

## Open questions
1. **The rate limit's value and scope:** per seat, per family or per coach, and over what window.
   *(Open-Pending §3; ADR-003 d4 amendment 2026-08-30)*
2. **One lesson or many per send.** The design's page-level button reads *Send reminders*; whether
   it sends for every unpaid lesson listed, for chosen rows, or per row isn't stated, nor whether a
   family with several unpaid lessons gets one email or one per lesson.
3. **The screens:** the button's place, its confirmation, what the coach sees after sending, and
   whether Payments shows when a lesson was last reminded or how many times.
4. **Whether the manual reminder's wording differs** from the automatic one (for example, naming
   that the lesson is now overdue).
5. **Text messages:** whether a manual send also texts a family that has opted in, which the rate
   limit's SMS-cost reason suggests. *(ADR-003 d4 amendment 2026-08-30; FeatureDecriptions/SMS Messages.md)*
6. **Which items can be reminded:** a no-show's seat, and a chargeable late-cancellation line
   (`missed-lesson-fee.md`), which has no reminder fields listed in the data model.
7. **Lessons from over a year back**, which are view only on Payments from Batch 27: whether a
   reminder can still be sent for them. *(FeatureDecriptions/Coach Payment Section on Dashboard.md, 2026-11-15)*
8. **The Phase 2 email-templates switch:** whether turning off the *Payment reminder* email also
   turns off the manual send. *(FeatureDecriptions/C_Coach Email Templates.md)*
