# Spec: Family unpaid history (Phase 2)

**Status:** Draft — 2026-11-16
**Sources:** ADR-003 (amendments 2026-10-12, Open); ADR-025 decision 7 and amendment item m;
ADR-022; ADR-031 decision 7; ADR-MASTER §12, §16, §18, §24; `FeatureDecriptions/C_Client Payments.md`;
`FeatureDecriptions/ClientHomeView`; `docs/architecture.md` access pattern 12 and §10 Phase 2+;
`docs/glossary.md` (`paymentStatus`, `WAIVED`)
**Depends on:** Minimum Viable Product (MVP) seats with `paymentStatus`, the coach's mark as paid and mark as waived, and
the coach profile's payment instructions and payment-type switches
**Out of scope:** in-app payments (BladeBook never moves money); the manual *send payment reminder*
action and its rate limit; late-cancellation and no-show **charges** (the Phase 2 missed-lesson fee
spec); the coach's own payment dashboard (MVP)

## Summary
In MVP only the coach sees which lessons haven't been marked paid. In Phase 2 a family sees its
own: the Payments page lists every past lesson the coach hasn't marked paid, with the amount owed,
grouped by coach, and says how to pay each coach. Home gains a line with the count and total.
BladeBook takes no payments; the family pays the coach directly and the coach marks the lesson paid.

## Assumed in every example
- Coach Dana Lee charges in US Dollar (USD); her notice period (`requiredNoticeHours`) is 24 hours;
  her payment instructions read *"Pay me at the rink or by Venmo."*; her switches have Cash and
  Venmo on (Venmo handle `@dana-skates`) and Cash App and PayPal off.
- Coach Sam Ortiz charges in Canadian Dollar (CAD).
- The Rossi family (contact Laura Rossi, `clientRelationship = GUARDIAN`) has one skater, Mia Rossi
  (*"Mia R."*), `ACTIVE` with both coaches.
- The Chen family has one skater, Leo Chen (*"Leo C."*), `ACTIVE` with Coach Dana.
- Now is Monday 2027-01-11, 10:00 AM in the coaches' time zone.
- Mia's lessons with Coach Dana, each private, 30 minutes, $40.00:
  - Tuesday 2027-01-05, 4:00 PM — `seatStatus = CHECKED_IN`, `paymentStatus = UNPAID`
  - Thursday 2027-01-07, 4:00 PM — `seatStatus = NO_SHOW`, `paymentStatus = UNPAID`
  - Saturday 2027-01-09, 9:00 AM — `seatStatus = CHECKED_IN`, `paymentStatus = PAID`
  - Tuesday 2027-01-12, 4:00 PM — `seatStatus = BOOKED`, `paymentStatus = UNPAID` (upcoming)

## 1. What the family sees

**1.1 A past lesson not marked paid is listed**
- **Given** Mia's checked-in lesson of Tuesday 2027-01-05, still `UNPAID`
- **When** Laura opens Payments
- **Then** the *Not marked paid* table, in Coach Dana's section, has a row for it: Mia, Tuesday
  5 January 4:00 PM, attended, $40.00
*(source: `FeatureDecriptions/C_Client Payments.md`, "Not marked paid table": "Every past lesson the
coach hasn't marked paid: skater, day and time, attendance, amount"; ADR-MASTER §24)*

**1.2 A no-show is listed at its share of the price**
- **Given** Mia's no-show of Thursday 2027-01-07, still `UNPAID`
- **When** Laura opens Payments
- **Then** the table has a row for it: Mia, Thursday 7 January 4:00 PM, no-show, $40.00
*(source: ADR-MASTER §12, "A no-show keeps its seat, `UNPAID` … owed at its share of the lesson price";
`FeatureDecriptions/C_Client Payments.md`, "Not marked paid table")*

**1.3 A lesson marked paid is not listed**
- **Given** Mia's lesson of Saturday 2027-01-09 is `PAID`
- **When** Laura opens Payments
- **Then** that lesson is not in the table
*(source: `FeatureDecriptions/C_Client Payments.md`: "This page only shows what the coach hasn't marked
paid yet")*

**1.4 A waived lesson is not listed**
- **Given** Coach Dana marked Mia's lesson of Monday 2027-01-04 at 4:00 PM as waived
  (`paymentStatus = WAIVED`)
- **When** Laura opens Payments
- **Then** that lesson is not in the table
*(source: `docs/glossary.md`, `WAIVED`: "the coach forgave the charge, so no money is expected";
ADR-MASTER §12)*

**1.5 An upcoming lesson is not listed**
- **Given** Mia's lesson of Tuesday 2027-01-12 is `BOOKED` and `UNPAID`, and hasn't happened yet
- **When** Laura opens Payments
- **Then** that lesson is not in the table
*(source: `FeatureDecriptions/C_Client Payments.md`, "Every past lesson the coach hasn't marked paid")*

**1.6 The figures for a coach**
- **Given** Mia's two past `UNPAID` lessons with Coach Dana, $40.00 each (1.1 and 1.2)
- **When** Laura opens Payments
- **Then** Coach Dana's section shows *Not marked paid*: $40.00 + $40.00 = $80.00, 2 lessons
- **And** it shows Coach Dana's notice period, 24 hours, with *"Late cancels may be charged"*
*(source: `FeatureDecriptions/C_Client Payments.md`, "Figures across the top" and the to-do to group
by coach: "each coach gets their own section (not marked paid, how to pay, notice period)")*

**1.7 A shared lesson shows only the family's share**
- **Given** Mia shared a 30-minute lesson with Leo C. on Wednesday 2027-01-06 at 5:00 PM, whose
  lesson time has `priceMinor = 5000` and `shareCount = 2`
- **And** Mia's seat is `CHECKED_IN` and `UNPAID`
- **When** Laura opens Payments
- **Then** the row for that lesson shows $25.00
*(source: ADR-MASTER §12, "Payment is per seat … The amount a seat owes is its share, worked out from
the lesson time"; ADR-031 decision 7)*

**1.8 Nothing owed to a coach**
- **Given** every past lesson Mia had with Coach Dana is `PAID` or `WAIVED`
- **When** Laura opens Payments
- **Then** Coach Dana's section shows *"All paid. Nothing is waiting to be marked paid."*
*(source: `FeatureDecriptions/C_Client Payments.md`, "Not marked paid table")*

**1.9 Each coach has a section, and there is no total across coaches**
- **Given** Mia owes Coach Dana $80.00 for 2 lessons
- **And** Mia owes Coach Sam CA$45.00 for 1 lesson on Friday 2027-01-08 at 6:00 PM
- **When** Laura opens Payments
- **Then** the page has one section for Coach Dana showing $80.00 and one for Coach Sam showing
  CA$45.00, each in its own currency
- **And** no figure adds the two together
*(source: ADR-025 amendment item m and decision 7; `FeatureDecriptions/C_Client Payments.md`, to-do
(owner, 2026-10-13); ADR-003 Open, "no sum may cross currencies")*

**1.10 How to pay each coach**
- **Given** Coach Dana's payment instructions and switches above
- **When** Laura opens Payments
- **Then** Coach Dana's section shows *"Pay me at the rink or by Venmo."*, Cash, and Venmo
  `@dana-skates`
- **And** it shows neither Cash App nor PayPal
*(source: `FeatureDecriptions/C_Client Payments.md`, "How to pay the coach"; ADR-016 decision 7)*

**1.11 Home gives the count and total**
- **Given** Mia's two past `UNPAID` lessons with Coach Dana, $80.00 in all, and nothing owed to
  Coach Sam
- **When** Laura opens Home
- **Then** a line under the buttons says 2 lessons, $80.00, aren't marked paid yet
*(source: `FeatureDecriptions/ClientHomeView`: "If past lessons aren't marked paid yet, a line under the
buttons gives how many and the total" — Phase 2)*

## 2. Isolation, logging and who changes what

**2.1 Only the family's own seats**
- **Given** Leo C.'s seat in the shared lesson of 2027-01-06 is `UNPAID`
- **When** Laura opens Payments
- **Then** Leo C.'s seat is not listed
- **And** the read goes through GSI1 under `CLIENT#<the Rossi family's clientId>`, which the database
  holds the Rossi family's session to
*(source: ADR-022 decision 4; ADR-MASTER §16, `client-tenant` GSI1 `LeadingKeys`; `docs/architecture.md`
access pattern 12, "Client: GSI1 (by client), filtered on `studentId` and `paymentStatus`")*

**2.2 The read is logged**
- **When** Laura opens Payments
- **Then** the access log records the read, with the seat identifiers returned, the names of the
  personal-data fields returned and `clientRelationship = GUARDIAN`
- **And** it records none of the values
*(source: ADR-012; ADR-MASTER §18, "Family reads are logged with `clientRelationship`")*

**2.3 A family can't mark its own lesson paid**
- **Given** Mia's lesson of Tuesday 2027-01-05 is `UNPAID`
- **When** Laura's browser sends a request to set that seat's `paymentStatus` to `PAID`
- **Then** it is refused, and the seat stays `UNPAID`
*(source: ADR-MASTER §12, "`paymentStatus` … Only the coach sets it"; ADR-003 decision 4)*

**2.4 The coach's mark as paid reaches the family's list**
- **Given** Mia's lesson of Tuesday 2027-01-05 is listed on Laura's Payments page
- **When** Coach Dana marks it paid
- **Then** the next time Laura opens Payments, that lesson is not listed and Coach Dana's
  *Not marked paid* figure is $40.00, 1 lesson
*(source: ADR-MASTER §12; `FeatureDecriptions/C_Client Payments.md`)*

## 3. Rules that must always hold

- **BladeBook never moves money.** The page shows what the coach hasn't marked paid; it takes no
  payment and holds no balance or credit. *(ADR-MASTER §12; `FeatureDecriptions/C_Client Payments.md`)*
- **Never a total across coaches or currencies.** Every amount carries its own currency.
  *(ADR-025 m and d7; ADR-003 Open)*
- **How the client paid (`paidVia`) is never shown on a family screen.** *(ADR-003 amendment
  2026-10-12, later: "No client screen shows `paidVia`")*
- **An unpaid seat is never deleted by expiry while it is unpaid**, so nothing owed drops off the
  list. *(ADR-MASTER §20, "Seat, `UNPAID` — Never while unpaid")*
- **A family reads only its own seats.** *(ADR-022; ADR-MASTER §16)*

## Open questions

1. **Does the payment reminder email mention earlier unpaid lessons?** Named as the decision that
   goes with this view. (`FeatureDecriptions/C_Client Payments.md`, "Unpaid history"; ADR-003)
2. **Which top figures are per coach.** The design shows *Not marked paid*, *Skaters* (approved
   skaters by first name) and *Notice period* once for the whole page; the to-do groups the page by
   coach but doesn't say where *Skaters* goes. (`FeatureDecriptions/C_Client Payments.md`;
   `docs/Open-Pending.md` §2 to-do, "group the Payments page by coach")
3. **Home's line with several coaches:** one line per coach, or a count only, since amounts can't
   be totalled across coaches? (`FeatureDecriptions/ClientHomeView`; ADR-025 m)
4. **Phase 2 late-cancellation fees on this page.** A charged late cancellation is a `CANCELLED#`
   line in the coach's partition, not a seat on GSI1, so the family can't read it today; and the
   wording for a fee that differs from the price is open. (ADR-MASTER §25, "What the Phase 2 fee is
   charged against"; `docs/Open-Pending.md`, missed-lesson fee wording "on the outstanding view")
5. **Attendance labels**, including a past lesson with nothing recorded (`seatStatus = BOOKED`).
6. **When a lesson counts as past:** at its start or its end.
7. **The open question is still listed as open.** `docs/Open-Pending.md` §3 (line 313) still asks "Is unpaid
   history shown to the client, or only the coach?", while ADR-MASTER §24 and
   `FeatureDecriptions/C_Client Payments.md` say the family sees it in Phase 2. This spec follows the
   latter; the owner should confirm.
