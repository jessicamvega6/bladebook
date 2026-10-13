# Q — Rink Fees

**Started:** 2026-10-12
**Purpose:** Every open question about how BladeBook calculates what a coach pays the rink. Kept
apart from `Items to ask Kim About.md` and `Open-Pending.md` because it is complex enough to
need its own session. Part A is for Kim; Part B is for the owner. Record answers here first, then
carry the decisions into `FeatureDecriptions/Coach Financial Page.md` and Architecture
Decision Record (ADR) 030, `docs/adr/ADR-030-financial-page-gross-and-rink-fees.md`, as
amendments to its decision 8.

---

## What is already decided

- **BladeBook calculates rink fees**; the coach doesn't type in what they paid. *Owner,
  2026-10-12.*
- **Gross is money received:** lessons marked paid, plus missed-lesson fees actually collected.
  Waived and unpaid lessons are left out. The year is the calendar year. Past years on screen are
  Phase 2. A summary export (CSV, monthly gross and rink fees) is MVP. *Owner, 2026-10-12.*
- The financial page shows year-to-date (YTD) gross and YTD rink fees. Rink fees are tax
  deductible, so the figure has to be one a coach can rely on.

## What we know so far (from Kim, 2026-10-07)

At Pelham Civic Center (PCC):

- **Figure skating (FS):** either 15% of gross, due monthly, or $500 a month.
- **Hockey:** a flat $10 an hour.
- **The rate depends on the ice the lesson is on.** PCC's sessions are Birmingham Figure Skating
  Club (BFSC) freestyle ice, Stick and Puck (S&P) ice, and public ice, each possibly with its own
  price.

Source: `docs/Talking with Kim:.md.md`.

---

## Part A — Questions for Kim

### The figure-skating choice

1. "15% of gross **or** $500 a month": does the coach **choose** one, or does the rink charge
   **whichever is higher**?
2. Can a coach **switch** between the percentage and the flat fee from month to month? If so, do
   they have to tell the rink in advance? *(Kim's own question.)*

### What the percentage is taken from

3. Is the 15% taken on money the coach **received**, or on every lesson **given**, paid or not?
4. Do **missed-lesson fees** (no-shows, late cancellations) count toward it?
5. Does a lesson the coach **waived** count?
6. A lesson given in March but paid in April: which month's fee does it fall into?

### Hourly rates

7. Is hockey's $10 an hour charged per hour of **lessons taught**, or per hour **on the ice**
   whether or not anyone booked?
8. Is a part hour charged as a part hour, or rounded up?
9. A **shared lesson** with two skaters: one hour, or one per skater?

### Ice types

10. What does each kind of ice cost the coach: BFSC freestyle, S&P and public?
11. Does the ice type change the **percentage**, the **hourly rate**, or both?
12. Are there other kinds of ice at PCC that we haven't listed?

### Paying the rink

13. Does the rink **send the coach a bill**, or does the coach work out what they owe and pay it?
14. Has a coach's own figure ever **differed** from what the rink said they owed? What happens
    then?
15. How often do the rink's **rates change**: once a year, once a season, or whenever?
16. A coach who teaches **both** figure skating and hockey at PCC: do they pay both ways,
    separately?
17. Do other rinks you know charge in **other ways**, such as an annual fee, a fee per session, or
    buying ice time up front?

---

## Part B — Questions for the owner

18. **Who enters a rink's terms?** Phase 1 has one rink, PCC, so its terms could be built into
    BladeBook as configuration. Or each coach enters their rink's terms, which works once rink
    selection arrives in Phase 2. ~~*Working assumption: the coach enters them, per rink.*~~
    *Settled 2026-10-12 by the owner: the developer adds each rink's terms when BladeBook reaches a
    new rink; the coach can't edit them.*
19. **Can a coach override a month's calculated fee** with what they actually paid? Because the
    figure is used for a tax deduction, an override keeps it true when the calculation and the
    rink disagree (question 14). ~~*Working assumption: yes.*~~ *Settled 2026-10-12 by the owner: no. Rink terms are
    added by the developer, and the financial page shows the calculated fee only; the coach doesn't enter what they paid.*
20. **Does every lesson carry what the calculation needs?** It needs the rink, the ice type, the
    sport (figure skating or hockey) and the length. The schedule builder already has an ice type
    field (`FeatureDecriptions/Schedule Creater.md`). Is the sport set on the coach or on each
    block of time?
21. **When the rink's rates change**, do past months keep the old rate? They should, the same way
    a booking keeps its price.
22. **Currency:** a Canadian rink's fees are in Canadian dollars (CAD). Rink terms take the coach's
    currency.

---

## What the answers decide

- The rink-fee model: percentage, flat or hourly; how to choose between them; and the rates for
  each ice type and sport. (Questions 1–2, 7–12, 15–17)
- What the percentage is taken from, and which month a lesson's fee falls into. This may differ
  from the financial page's "gross," which is money received. (Questions 3–6)
- Whether the calculation is the final figure, or a starting point the coach can correct.
  (Questions 13–14, 19)
- What each booking must store for the calculation to work. (Question 20)
