Coach Financial Page (from talking with Kim, 2026-10-07)
*Design: coach/static/finances.html (added 2026-10-12). The fee calculation shown is one reading of docs/Q_Rink-Fees.md.*
*Decided 2026-10-12 by the owner:* each rink's terms are added by the developer when BladeBook reaches a new rink.
    The coach can't edit them, and can't enter what they actually paid; the page shows the calculated fee only.

Coaches need one place to see their figures for taxes. Fees paid to the rink are tax deductible.

The page shows:
  Year to date (YTD) total gross: the money the coach has received this calendar year: lessons marked paid plus missed-lesson fees collected.
  Year to date (YTD) rink fees: the rink fees for this calendar year, calculated by BladeBook (see Q_Rink-Fees.md).

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
    A detailed per-lesson export with skater names is Phase 2 (privacy rules, PII access logging).
  BladeBook calculates rink fees; the coach doesn't enter them. How it calculates is open:
    every question is in docs/Q_Rink-Fees.md.

Recorded in ADR-030 (accepted in part; the rink-fee calculation is open).
Other open questions are tracked in docs/Open-Pending.md §3.
