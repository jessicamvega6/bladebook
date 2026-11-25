# Spec: Personal prices and discounts (Phase 2)

**Status:** Draft — 2026-11-16
**Sources:** ADR-003 (decision 2, amendment 2026-10-13), ADR-004 (decision 4), ADR-020 (decision 1),
ADR-021 (decision 6), ADR-022 (decision 6), ADR-025 (decision 4), ADR-031 (decision 7),
`FeatureDecriptions/Lesson Pricing.md` ("Personal prices (Phase 2)", "What is owed"),
`FeatureDecriptions/Coach Dashboard on website.md` (Students list, design `students-price.html`),
`FeatureDecriptions/Re-pricing Booked Lessons.md`, `FeatureDecriptions/Schedule lesson split` ("Price"),
`docs/Items to ask Kim About.md` §5, `docs/Open-Pending.md` §4, ADR-MASTER §3 (Events), §12, §24,
`docs/architecture.md` §5 (`STUDENT`, `CLIENT_STUDENT_LINK`, `StudentChanged`) and §10.
**Depends on:** the Minimum Viable Product (MVP) Students list (`FeatureDecriptions/Coach Dashboard on website.md`);
`consumer-student-link` and `StudentChanged` (ADR-MASTER §3); price shares (ADR-031 d7);
re-pricing (ADR-MASTER §9).
**Out of scope:** a one-off price for a single lesson, which isn't offered (the coach marks the
lesson waived instead); packages and prepaid blocks (Phase 2, undesigned); the missed-lesson fee
(`missed-lesson-fee.md`).

## Summary
A coach can give one skater a standing price different from the schedule's, for example for a
family going through a hard time. In MVP every skater pays the schedule's price and no personal
price is set or shown. **The shape of a personal price is undecided** (a fixed price, a percentage
off, or an amount off; Kim's list §5), so this spec holds only what is decided about where it lives,
how it travels and what it never touches.

## Assumed in every example
- Coach Dana Park teaches in US dollars (USD). Her schedule's 30-minute lessons are $50.00.
- Skater Mia R. (the Rossi family) is `ACTIVE` with Dana and with Coach Sam Ortiz.
- The scenarios use `priceMinorOverride` as the data model names it today: an optional value on
  the coach's `STUDENT#` record for the skater. What the value means depends on the open question
  about its shape.

## 1. Setting and clearing a personal price

**1.1 The coach sets a personal price from the Students list**
- **Given** Mia pays the schedule's price
- **When** Dana chooses *Set price* on Mia's row in the Students list and saves a personal price
- **Then** Dana's `COACH#<coachId>` / `STUDENT#<Mia's studentId>` record stores `priceMinorOverride`
*(source: FeatureDecriptions/Coach Dashboard on website.md, Students list; ADR-003 d2)*

**1.2 Saving a personal price is mirrored to the family's link item**
- **Given** Dana has just saved `priceMinorOverride` on Mia's `STUDENT#` record
- **When** the change stream raises `StudentChanged`
- **Then** `consumer-student-link` copies `priceMinorOverride` onto the Rossi family's link item,
  `CLIENT#<clientId>` / `STUDENT#<Dana's coachId>#<Mia's studentId>`
*(source: ADR-021 d6; ADR-022 d6; architecture.md §5, `StudentChanged`)*

**1.3 The coach puts the skater back on the schedule's price**
- **Given** Mia's `STUDENT#` record has `priceMinorOverride`
- **When** Dana chooses *Change* on Mia's row and picks the schedule's price
- **Then** Mia's `STUDENT#` record no longer has a personal price, and `StudentChanged` mirrors
  that to the link item
*(source: FeatureDecriptions/Coach Dashboard on website.md ("chooses the schedule's price or one personal price"); ADR-003 d2 ("if set"))*

## 2. Where a personal price is read

**2.1 The family's booking path reads the personal price from its own link item**
- **Given** Mia's link item with Dana carries `priceMinorOverride`
- **When** the Rossi family books one of Dana's times for Mia
- **Then** the booking path reads the personal price from the link item, never from Dana's
  `STUDENT#` record
*(source: ADR-022 d6)*

**2.2 A personal price is applied when the share is worked out, never stored on a lesson**
- **Given** Mia has a personal price with Dana and is booked into Dana's lesson on Tuesday
  2027-03-02 16:00
- **When** the booking is written
- **Then** the lesson time's `priceMinor` stays the schedule's price, and no amount is written to
  Mia's seat
*(source: FeatureDecriptions/Re-pricing Booked Lessons.md ("applied per skater when the share is worked out"); ADR-031 d7)*

## 3. What a personal price never touches

**3.1 A schedule price change leaves the personal price alone**
- **Given** Mia's `STUDENT#` record with Dana has `priceMinorOverride`
- **When** Dana raises the 30-minute block's price to $55.00 and saves
- **Then** Mia's `priceMinorOverride` is unchanged
*(source: ADR-020 d1 ("`priceMinorOverride` is never touched by a re-price"); FeatureDecriptions/Re-pricing Booked Lessons.md)*

**3.2 One coach's personal price is never seen by another coach**
- **Given** Dana has given Mia a personal price
- **When** Sam opens Mia's record on his Students list
- **Then** he sees nothing of Dana's price for Mia, and Mia's price with Sam is unchanged
*(source: ADR-025 d4: "Nothing else crosses: not the other coach's schedule, prices …"; FeatureDecriptions/Coach Dashboard on website.md)*

**3.3 A one-off is a waive, not a price edit**
- **Given** Dana wants Mia's lesson on Tuesday 2027-03-02 to cost nothing
- **When** she opens that lesson on Payments
- **Then** no per-lesson price edit is offered; she can mark it waived
*(source: ADR-003 d2 (2026-10-13); FeatureDecriptions/Lesson Pricing.md, "What is owed"; Open-Pending §4)*

## 4. Rules that must always hold
- **`priceMinorOverride` lives on the coach's `STUDENT#` record**, one per coach per skater; the
  family's link item holds a copy written only by `consumer-student-link`. *(ADR-003 d2; ADR-021 d6; ADR-022 d6)*
- **The lesson time's `priceMinor` is the only stored price**; no amount is copied onto a seat.
  *(ADR-031 d7)*
- **No re-price ever changes a personal price.** *(ADR-020 d1)*
- **Money is an integer in minor units.** *(ADR-MASTER §3)*

## Open questions
1. **The shape:** a fixed price ("Mia pays $40"), a percentage off ("20% off") or an amount off
   ("$10 off"). A percentage or amount off would follow the coach's price changes; a fixed price
   would not. *(Lesson Pricing.md; Kim's list §5 questions 2 and 4; Open-Pending §4; ADR-MASTER §24)*
2. **Lessons of different lengths:** the design reads it as "one personal price per lesson for every
   lesson length"; Kim's list §5 question 3 asks whether and how a discount applies to both a $50
   30-minute lesson and an $80 60-minute lesson.
3. **Lessons already booked:** whether setting or changing a personal price reaches the skater's
   upcoming lessons, and under ADR-020's increase/decrease rules. *(Re-pricing Booked Lessons.md;
   Kim's list §5; Coach Dashboard on website.md)*
4. **What "no personal price" looks like**, and whether `0` can mean free lessons for a stretch.
   *(Kim's list §5, question 6 and "What the answers decide")*
5. **Shared lessons:** how the price is split when one skater has a personal price (MVP always splits
   the schedule's price). *(FeatureDecriptions/Schedule lesson split, "Price")*
6. **What families are shown:** whether the booking page, pop-ups and My bookings show the personal
   price, and whether the family is told when it is set or changed.
7. **Naming:** whether the screens say "personal price" or "discount". The sources use both.
