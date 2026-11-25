# Spec: Changing a coach's currency (Phase 2)

**Status:** Draft — 2026-11-16
**Sources:** ADR-003 (amendment 2026-08-20, Open "Currency", Revisit if), ADR-031 (decisions 1, 7),
ADR-030 (decision 4 amendment 2026-11-16), ADR-025 (decision 7, amendment item m),
`FeatureDecriptions/C_Coach Profile.md` ("Details"), `FeatureDecriptions/Lesson Pricing.md` ("Currency"),
`FeatureDecriptions/Coach Payment Section on Dashboard.md` ("Currency"), `FeatureDecriptions/Coach Dashboard on website.md`,
`FeatureDecriptions/Schedule Creater.md` (LC, MF), ADR-MASTER §3, §4, §12, §24, `docs/architecture.md` §10.
**Depends on:** the MVP coach profile (ADR-MASTER §4), the MVP payment dashboard and weekly
unpaid reminder (§12), lesson times stamped with `currency` (§3).
**Out of scope:** the family's Payments page grouped by coach (`FeatureDecriptions/C_Client Payments.md`);
changing a coach's time zone (Phase 3); currencies other than US dollars (USD) and Canadian
dollars (CAD).

## Summary
A coach picks USD or CAD at sign-up, and in MVP can't change it. From Phase 2 the coach can change
it. Every lesson time carries its own currency, so lessons made before the change keep the old one:
a coach who moves from USD to CAD has lessons owed in both. Every screen shows each amount in its
own currency and never adds amounts in different currencies together. **Almost everything about how
the change is made and what it reaches is undecided.**

## Assumed in every example
- Coach Dana Park signed up with `currency = USD`. Her 30-minute lessons are 5000 minor units.
- Skater Mia R. (the Rossi family) is `ACTIVE` with Dana. Mia's lesson on Tuesday 2027-03-02 16:00
  was made, booked and checked in while Dana's currency was USD; its lesson time carries
  `currency = USD` and Mia's seat is `UNPAID`.
- Dana changes her currency to CAD on Monday 2027-03-08.

## 1. Changing the currency

**1.1 The coach changes her currency on her profile**
- **Given** Dana's profile has `currency = USD`
- **When** Dana changes her currency to CAD on her profile and saves
- **Then** her `COACH#<coachId>` / `PROFILE` item stores `currency = CAD`
*(source: FeatureDecriptions/C_Coach Profile.md, "Details" ("Changing currency comes in Phase 2"); FeatureDecriptions/Lesson Pricing.md, "Currency")*

**1.2 A lesson time made after the change carries the new currency**
- **Given** Dana's profile has `currency = CAD`
- **When** `sched-lesson-roller` makes a new lesson time for Dana
- **Then** the `LESSON#` item carries `currency = CAD`
*(source: ADR-031 d1; ADR-003 amendment 2026-08-20)*

**1.3 A lesson from before the change keeps its currency**
- **Given** Dana's profile now has `currency = CAD`
- **When** the change is saved
- **Then** Mia's 2027-03-02 lesson time still carries `currency = USD` and `priceMinor = 5000`
*(source: ADR-003 Open "Currency" ("bookings made before a switch keep their original currency"); architecture.md §10)*

## 2. Showing lessons in two currencies

**2.1 The payment dashboard shows each lesson in its own currency**
- **Given** Mia's 2027-03-02 lesson (USD 5000) and her 2028-07-04 lesson, made after the change
  (CAD 5000), are both `UNPAID` and past
- **When** Dana opens Payments for a range covering both
- **Then** the first is shown as US dollars and the second as Canadian dollars
- **And** no figure adds the two into one total
*(source: FeatureDecriptions/Coach Payment Section on Dashboard.md, "Currency"; ADR-003 Open; ADR-MASTER §12, "The coach's screens")*

**2.2 A payment reminder states the lesson's own currency**
- **Given** Dana's currency is now CAD and Mia's 2027-03-02 lesson carries `currency = USD`
- **When** a payment reminder for that lesson is sent to the Rossi family
- **Then** it states 50.00 US dollars
*(source: FeatureDecriptions/Email templates Needed:, "Payment reminder" ("in the lesson's currency"); ADR-003 d7)*

**2.3 The weekly unpaid reminder lists each lesson in its own currency**
- **Given** Mia's USD lesson and her CAD lesson are both past, `UNPAID` and older than 7 days
- **When** `sched-unpaid-reminder` sends Dana's Monday email
- **Then** each is listed with its amount in its own currency, and the email gives no total across them
*(source: ADR-MASTER §3 ("Amounts in different currencies are never summed"); ADR-018 d1)*

**2.4 A closed year's saved figures keep each currency apart**
- **Given** Dana has paid lessons in both USD and CAD in 2028
- **When** `sched-year-close` saves `CLOSEDYEAR#2028` in January 2029
- **Then** each month's amounts are saved per currency
*(source: ADR-030 d4 amendment 2026-11-16; ADR-MASTER §3, "Closed year's figures")*

## 3. Rules that must always hold
- **Every lesson time carries its own currency**, stamped when it is made; a change to the
  coach's currency never rewrites what a family already owes. *(ADR-003 amendment 2026-08-20; ADR-031 d1)*
- **No sum crosses currencies**, on any screen, email, download or saved figure. *(ADR-003 Open;
  ADR-MASTER §3, §12)*
- **The currency is `USD` or `CAD`.** *(ADR-MASTER §3)*
- **Money is an integer in minor units**, formatted only at the edge. *(ADR-003 d1; ADR-MASTER §3)*

## Open questions
1. **Do lesson times already made follow the change?** Lesson times are made about 15 months ahead.
   Whether open (and booked but unpaid) lesson times are re-stamped with the new currency, or keep
   the old one until the roller reaches dates past them, is undecided; the sources say only that
   "earlier lessons" or "bookings made before a switch" keep theirs. *(ADR-003 Open; architecture.md §10)*
2. **What happens to the numbers:** whether prices and fees on the schedule are kept as typed
   (5000 USD becoming 5000 CAD) or must be re-entered, and whether families are told.
3. **Where and how the change is made:** the profile control, its confirmation, and any limits
   (how often, or only with no unpaid lessons). Today the profile shows currency read-only.
4. **How amounts in two currencies are labelled** on screen and in emails (for example "US$50.00"
   against "$50.00 USD"), when today's screens just say "$".
5. **Payments' figures (unpaid total, paid total) with a mixed list:** one figure per currency, or
   none.
6. **The financial page and its downloads with two currencies in one year:** per-currency columns
   or rows. The page today says amounts are in the coach's currency.
7. **Booking with one coach across the change:** if open lesson times keep the old currency, a
   family's picks with one coach could mix currencies, and *Your picks* totals per coach.
   *(ADR-025 a)*
8. **Rink fees** take the coach's currency (Q_Rink-Fees.md question 22); what a change does to them.
