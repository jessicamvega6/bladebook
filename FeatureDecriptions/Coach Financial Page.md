Coach Financial Page (from talking with Kim, 2026-10-07)
*Design: coach/static/finances.html (added 2026-10-12; rink fees taken off 2026-11-12).*
*Decided 2026-11-12 by the owner: **rink fees are Phase 2.** Working them out needs answers from outside BladeBook
    (docs/Q_Rink-Fees.md) that aren't available yet. In MVP the page shows year-to-date gross only, the download
    holds monthly gross and paid-lesson counts, and the page says rink fee calculation is coming. Everything below about rink fees
    applies from Phase 2.*
*Decided 2026-10-12 by the owner:* each rink's terms are added by the developer when BladeBook reaches a new rink.
    The coach can't edit them, and can't enter what they actually paid; the page shows the calculated fee only.

Coaches need one place to see their figures for taxes. Fees paid to the rink are tax deductible.

The page shows:
  Year to date (YTD) total gross: the money the coach has received this calendar year: lessons marked paid plus missed-lesson fees collected.
  Year to date (YTD) rink fees: the rink fees for this calendar year, calculated by BladeBook (see Q_Rink-Fees.md).
  *Decided by the owner, 2026-10-12:* the page shows year-to-date gross and year-to-date rink fees for the calendar
    year, the tax year for individuals in both the US and Canada. Amounts are in the coach's currency (ADR-016).
    *(from ADR-030 §1, moved 2026-11-08)*

Background from Kim (see docs/Talking with Kim:.md.md):
  Coaches pay the rink they coach at, and each rink has its own options.
  Example rink: Pelham Civic Center (PCC).
  Rates differ for hockey and figure skating (FS), and depend on the ice the lesson is on.
  Each rink names its own ice sessions. At PCC: Birmingham Figure Skating Club (BFSC) freestyle
  ice (the figure skaters' session), Stick and Puck (S&P) ice, and public ice. This is why the
  schedule builder now has an ice type field (see Schedule Creater.md).

  Example, PCC:
    FS: either 15% of gross, due monthly, or $500 a month
    Hockey: $10 an hour flat rate



Decided 2026-10-12 by the owner:
  Gross is money received: lessons marked paid, plus missed-lesson fees actually collected.
    Waived and unpaid lessons are left out. The year is the calendar year.
    Past years on screen are Phase 2.
  A paid lesson counts in the year and month of the lesson date, not when it was marked paid.
  A finished year is closed for now: its figures don't change afterwards.
  Before the figures, the page says they are calculated from the lessons the coach has marked as paid.
  Summary export is MVP: a Download button saves a CSV for a chosen calendar year (this year or last),
    one row per month with gross received, rink fees and net, plus year totals. No skater names.
    *(Rink fees and net: Phase 2, 2026-11-12.)*
    A detailed per-lesson export with skater names is Phase 2 (privacy rules, PII access logging).
  BladeBook calculates rink fees; the coach doesn't enter them. How it calculates is open:
    every question is in docs/Q_Rink-Fees.md.

What counts as gross (decided by the owner, 2026-10-12):
  Gross counts lessons marked paid, at the skater's share of the lesson price (the full price for a private
    lesson), and missed-lesson fees actually collected. In MVP that is a no-show marked paid, at its full lesson
    price — the skater's share (the full price, unless the lesson is shared) (ADR-015 decision 4). Charging a
    late cancellation is Phase 2, and its collected fee joins gross then.
  Gross leaves out waived and unpaid lessons. A lesson counts once it is marked paid; if a coach undoes that, it
    drops out again.
  A paid lesson counts in the year, and month, of the lesson date, not the date it was marked paid. A December
    lesson paid in January counts in December's gross.
  A finished year is closed (for now): a lesson from that year marked paid afterwards doesn't change its figures,
    and doesn't count in the new year either.
  *(from ADR-030 §2 and §4, moved 2026-11-08)*

The note above the figures (decided by the owner, 2026-10-12):
  Before the figures are shown, the page states that they are calculated from the lessons the coach has marked
    as paid, so a lesson not yet marked paid isn't in them.
  *(from ADR-030 §5, moved 2026-11-08)*

Rink terms (decided by the owner, 2026-10-12):
  Each rink's terms are added by the developer when BladeBook reaches a new rink. The coach can't edit them,
    can't override a month's fee and can't enter what they paid (Q_Rink-Fees questions 18–19).
  *(from ADR-030 §6, moved 2026-11-08)*

Rink fees until the calculation is decided:
  How rink fees are worked out is still open (every question is in docs/Q_Rink-Fees.md). Until then, the Harbor
    design shows one reading, marked as such on the page: 15% or $500 a month by the coach's choice, and a
    lesson counted in the month it was taught.
  The figure is used for a tax deduction, so a wrong calculation costs the coach. Until the model is confirmed
    with Kim, the page says it is an estimate to check against what was paid.
  *2026-11-12: superseded for MVP. Rink fees are Phase 2, so MVP shows no reading and no estimate; the page
    says only that rink fee calculation is coming.*
  *(from ADR-030 §8 and Consequences, moved 2026-11-08)*

Export (decided by the owner, 2026-10-12):
  MVP: a summary export. A Download button saves a comma-separated values (CSV) file for a chosen calendar
    year, this year or last: one row per month with gross received ~~, rink fees and net~~ and the number of paid
    lessons (rink fees and net join it in Phase 2; owner, 2026-11-12), plus year totals. It has
    no skater names and no personal data. It covers what a tax preparer needs and lets the coach keep their own
    copy before records age out.
  Phase 2: past years on screen.
  Phase 2: a detailed export, one row per lesson with skater names, decided with the privacy rules.
  *(from ADR-030 §7, moved 2026-11-08)*

Options the owner rejected (2026-10-12):
  The coach enters what they paid. Simpler, and always matches the rink. Rejected by the owner: BladeBook already
    has the lessons, and working the fee out is the point of the page. An override for a single month was also
    rejected (question 19, settled 2026-10-12).
  Gross as every lesson given, paid or not. Rejected: a tax figure has to be money received, and unpaid lessons
    may never be paid.
  *(from ADR-030 Alternatives considered, moved 2026-11-08)*

Recorded in ADR-030 (accepted in part; the rink-fee calculation is open and is Phase 2 since 2026-11-12).
Other open questions are tracked in docs/Open-Pending.md §3.
