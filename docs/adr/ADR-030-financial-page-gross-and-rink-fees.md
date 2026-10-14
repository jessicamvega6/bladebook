# ADR-030: The Financial Page — Gross Is Money Received, BladeBook Calculates Rink Fees

## Status

**Accepted in part** — 2026-10-12. *Decided by the owner.* Decisions 1–7 are settled. **How rink
fees are calculated is not:** every question about it is in `docs/Q_Rink-Fees.md` (Part A for
Kim, Part B for the owner), and this ADR is amended when they're answered.

**Defines** MVP feature 16 (`architecture.md` §10), which so far had no ADR.

**Relies on** [ADR-003](ADR-003-lesson-pricing-and-payment.md) (price stamped on the booking,
paid and waived), [ADR-015](ADR-015-late-cancellation-and-no-show-charges.md) decision 4 (a
no-show is collected by marking it paid) and [ADR-017](ADR-017-data-retention-ttl-and-archive.md)
(retention).

**Note — 2026-10-13.** [ADR-031](ADR-031-lessons-and-seats.md) replaces the booking with a
**lesson time** (the coach's, `LESSON#`) and a **seat** for each skater (`SEAT#`). For this page:
a paid lesson counts at its ~~**seat's `shareMinor`**~~ **seat's `amountMinor`** — the full price for a private lesson, the
skater's share for a shared one — and the year's figures are a range query on the coach's
`SEAT#<date>` items. Payment is per seat, so a shared lesson where one family has paid and the
other hasn't counts only the paid share. The ice type is stamped on the lesson time
(`iceType`). Decisions 1–7 are unchanged. *Revised 2026-10-13 (ADR-031 revision): a seat no longer stores `shareMinor`. Its share
is worked out from the lesson time until it is fixed as `amountMinor` — at check-in, at a
no-show, or when marked paid or waived. A paid seat always has `amountMinor`, so gross uses it.*

---

## Context

From talking with Kim on 2026-10-07 (`Talking with Kim:.md.md`): coaches pay the rink they coach
at, and rink fees are tax deductible. A coach needs one place to see their year's figures for
taxes: what they took in, and what they paid the rink.

Rinks charge in different ways. At Pelham Civic Center (PCC), figure skating (FS) is 15% of gross
due monthly or $500 a month, and hockey is $10 an hour. The rate can depend on the ice the lesson
is on: Birmingham Figure Skating Club (BFSC) freestyle, Stick and Puck (S&P) or public ice.

Two questions were open in `Open-Pending.md` §3: what counts as gross, and whether BladeBook
calculates rink fees or the coach types in what they paid. The owner settled both on 2026-10-12.

---

## Decision

### 1. The page shows year-to-date gross and rink fees

The coach's financial page shows **year-to-date (YTD) gross** and **YTD rink fees**, for the
**calendar year**, the tax year for individuals in both the US and Canada. Amounts are in the
coach's currency (ADR-016).

### 2. Gross is money received

*Decided by the owner, 2026-10-12.* Gross counts:

- lessons **marked paid** (`paymentStatus = PAID`), at the ~~booking's stamped `priceMinor`~~
  *seat's ~~`shareMinor`~~ `amountMinor` (ADR-031 decisions 2 and 7, 2026-10-13; revised the
  same day by the ADR-031 revision)*;
- **missed-lesson fees actually collected.** In MVP that is a no-show marked paid, at its full
  lesson price (ADR-015 decision 4). Charging a late cancellation is Phase 2 (ADR-015), and its
  collected fee joins gross then.

Gross leaves out **waived** and **unpaid** lessons. A lesson counts once it is marked paid; if a
coach undoes that, it drops out again.

**A paid lesson counts in the year, and month, of the lesson date**, not the date it was marked
paid. *Decided by the owner, 2026-10-12.* A December lesson paid in January counts in December's
gross.

### 3. BladeBook calculates rink fees

*Decided by the owner, 2026-10-12.* The coach doesn't type in what they paid; BladeBook works it
out from the rink's terms and the coach's lessons. **How is open** (decision 8).

### 4. A finished year is closed

*Decided by the owner, 2026-10-12, for now.* Once a calendar year ends, its figures are fixed.
A lesson from that year marked paid afterwards doesn't change them, and under decision 2 it
doesn't count in the new year either.

### 5. The page says what the figures are based on

*Decided by the owner, 2026-10-12.* Before the figures are shown, the page states that they are
**calculated from the lessons the coach has marked as paid**, so a lesson not yet marked paid
isn't in them.

### 6. Rink terms are set by the developer; the page shows the calculated fee only

*Decided by the owner, 2026-10-12.* Each rink's terms are added by the developer when BladeBook
reaches a new rink. The coach can't edit them, can't override a month's fee and can't enter what
they paid (Q_Rink-Fees questions 18–19).

### 7. A summary export in MVP; past years on screen and a detailed export in Phase 2

*Decided by the owner, 2026-10-12.*

- **MVP: a summary export.** A **Download** button saves a comma-separated values (CSV) file for
  a chosen calendar year, this year or last: one row per month with gross received, rink fees
  and net, plus year totals. It has **no skater names and no personal data**, so it isn't a
  personally identifiable information (PII) read under
  [ADR-012](ADR-012-pii-access-logging.md). It reads live data only, filtered on `expiresAt`
  ([ADR-017](ADR-017-data-retention-ttl-and-archive.md) decision 1). It covers what a tax
  preparer needs and lets the coach keep their own copy before records age out.
- **Phase 2: past years on screen.**
- **Phase 2: a detailed export**, one row per lesson with skater names. It is mostly children's
  data leaving BladeBook in a file, so it is decided with the privacy rules; every such export
  would be a logged PII read (ADR-012).

### 8. Open: the rink-fee calculation

Not decided. The answers in `Q_Rink-Fees.md` decide:

- the model: a percentage, a flat fee or an hourly rate; whether the coach chooses or the rink
  charges whichever is higher; and the rates by ice type and sport (questions 1–2, 7–12, 15–17);
- what the percentage is taken from, and which month a lesson's fee falls into. This may differ
  from gross in decision 2 (questions 3–6);
- whether the rink bills the coach, and what happens when the figures differ (questions 13–14);
- how rate changes apply to past months, and what each booking must store (questions 20–22).

Until then, the Harbor design shows **one reading**, marked as such on the page: 15% or $500 a
month by the coach's choice, and a lesson counted in the month it was taught.

---

## Alternatives considered

- **The coach enters what they paid.** Simpler, and always matches the rink. Rejected by the
  owner: BladeBook already has the lessons, and working the fee out is the point of the page.
  An override for a single month was also rejected (question 19, settled 2026-10-12).
- **Gross as every lesson given, paid or not.** Rejected: a tax figure has to be money received,
  and unpaid lessons may never be paid.

---

## Consequences

- **The page reads the coach's bookings by lesson date.** A year's figures are a query on the
  coach's ~~`BOOKING#<date>`~~ range for that year, keeping those marked paid. No new index is needed.
  *Replaced by ADR-031 decision 2 (2026-10-13): the range is the coach's `SEAT#<date>` items,
  one per skater. Phase 2's collected late-cancellation fees are on `CANCELLED#` lines.*
- **A lesson paid after its year has closed is in no year's gross** (decision 4). A December
  lesson marked paid in January is the usual case. Decision 5's statement is what tells the coach
  to mark lessons paid before the year ends. Last year's summary export (decision 7) shows the
  closed figures; revisit this when past years come on screen (Phase 2).
- **Retention keeps a year's paid lessons.** *Settled 2026-10-12:* every ADR-017 window holding
  lesson or payment records is at least **16 months**, so a calendar year's records stay live
  until the US and most Canadian filing deadlines (`Open-Pending.md` §8). Phase 2's past years
  on screen need longer, or a read from the archive.
- **Bookings will need what the calculation needs.** *Since ADR-031 (2026-10-13), these stamps
  belong on the lesson time, which already carries `iceType`.* The schedule builder already stamps an ice
  type per tab (`FeatureDecriptions/Schedule Creater.md`); the rink and the sport may need
  stamping too (Q_Rink-Fees question 20). Stamped, like the price, so a rate or schedule change
  doesn't rewrite past months.
- **The figure is used for a tax deduction,** so a wrong calculation costs the coach. Until the
  model is confirmed with Kim, the page says it is an estimate to check against what was paid.

---

## Open

- **Everything in `Q_Rink-Fees.md`**, Parts A and B.
- ~~**Which date puts a paid lesson in a year:** the lesson date, or the date it was marked
  paid.~~ **Settled 2026-10-12 by the owner:** the lesson date (decision 2). This matches the
  Harbor design.

---

## Revisit if

- Kim's answers or the owner's Part B answers land: amend decision 8 and the Consequences.
- Rink selection arrives (Phase 2), bringing rinks with other terms.
