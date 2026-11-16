# Spec: Financial page — past years, per-lesson export and rink fees (Phase 2)

**Status:** Draft — 2026-11-16
**Sources:** ADR-030 (decisions 1, 2, 4, 6, 7, 8, amendments of 2026-11-12, 2026-11-13 and
2026-11-16, Consequences), ADR-012 (via ADR-MASTER §18), ADR-017 (via ADR-MASTER §20),
`FeatureDecriptions/Coach Financial Page.md`, `docs/Q_Rink-Fees.md`, `FeatureDecriptions/Schedule Creater.md`
((R) Rink, (IT) Ice Type), `docs/Open-Pending.md` §3, ADR-MASTER §3, §12, §18, §20, §24, §25,
`docs/architecture.md` §10.
**Depends on:** the Minimum Viable Product (MVP) financial page: year-to-date (YTD) gross, the five-column summary
download, closed years saved on `CLOSEDYEAR#<year>` and corrections on `PAYCORRECTION#` (ADR-MASTER
§12); ice type on every block (Schedule Creater.md).
**Out of scope:** late-cancellation fees joining gross (`missed-lesson-fee.md`, scenario 7.6);
amounts in more than one currency (`currency-change.md`); rink selection in the schedule builder
(`FeatureDecriptions/Schedule Creater.md`, its own Phase 2 item).

## Summary
The financial page gives a coach the figures they need for taxes. Phase 2 adds three things:
earlier years on screen, read from each closed year's saved figures; a detailed download with one
row per lesson and skater names, logged as a personal-data read; and rink fees, which BladeBook
calculates from each rink's terms. **How rink fees are calculated is undecided** (`docs/Q_Rink-Fees.md`),
so the rink-fee scenarios below cover only what is fixed around the calculation.

## Assumed in every example
- Coach Dana Park teaches in US dollars (USD) at Pelham Civic Center (PCC), time zone
  `America/Chicago`. She signed up in 2026.
- `CLOSEDYEAR#2026` and `CLOSEDYEAR#2027` are saved. Now is **Tuesday 2029-02-13 10:00**, so 2028
  is closed and `sched-year-close` has saved `CLOSEDYEAR#2028`.

## 1. Past years on screen

**1.1 The coach views an earlier year**
- **Given** `CLOSEDYEAR#2026` is saved for Dana
- **When** Dana chooses 2026 on the financial page
- **Then** the page shows 2026's twelve months and its year total from `CLOSEDYEAR#2026`, read with
  one `GetItem`
- **And** no `SEAT#`, `CANCELLED#` or `PAYCORRECTION#` item is read
*(source: ADR-030 d4 amendment 2026-11-16, Consequences ("Phase 2's past years on screen can read the saved years, as far back as they go"); ADR-MASTER §12)*

**1.2 An earlier year's figures never change**
- **Given** `CLOSEDYEAR#2026` is saved
- **When** Dana views 2026 again in 2029, after 2026's paid seats have expired
- **Then** the figures are the same as when 2026 was saved
*(source: ADR-030 d4; ADR-MASTER §12, §20 (`CLOSEDYEAR#` is kept for the account's lifetime))*

**1.3 An earlier year's late payments and undos are labelled as on the MVP page**
- **Given** `CLOSEDYEAR#2027` records, for January 2027, $30.00 paid for 2026 lessons
- **When** Dana views 2027
- **Then** January and the year total say *"Includes $30 for 2026 lessons"*
*(source: FeatureDecriptions/Coach Financial Page.md, "What counts as gross" (2026-11-13))*

## 2. The detailed per-lesson download

**2.1 The coach downloads one row per lesson, with names**
- **Given** Dana has paid lessons in 2028
- **When** she downloads the detailed export for a year
- **Then** she gets a comma-separated values (CSV) file with one row per lesson, naming the skater
*(source: ADR-030 d7; FeatureDecriptions/Coach Financial Page.md, "Export"; ADR-MASTER §24)*

**2.2 Every detailed download is a logged personal-data read**
- **Given** Dana is signed in to the coach website
- **When** she downloads the detailed export
- **Then** the personal-data access log records her as the actor and her role, the record
  identifiers returned, the names of the personal-data fields returned, the operation, the time,
  the request identifier (ID) and the source address
- **And** it records none of the values
*(source: ADR-030 d7 ("every such export would be a logged PII read"); ADR-012; ADR-MASTER §18)*

**2.3 The summary download stays unlogged**
- **Given** Dana is signed in to the coach website
- **When** she downloads the summary export
- **Then** it has no names and no personal data, and nothing is written to the personal-data access log
*(source: ADR-030 d7; ADR-MASTER §18 ("Not logged: the financial page's summary export"))*

## 3. Rink fees

**3.1 The page shows year-to-date rink fees beside gross**
- **Given** Dana teaches at PCC, whose terms the developer has added
- **When** Dana opens the financial page in 2029
- **Then** the page shows year-to-date gross and year-to-date rink fees for the calendar year 2029,
  in her currency
- **And** it no longer says that rink fee calculation is coming
*(source: ADR-030 d1 and amendment 2026-11-12; FeatureDecriptions/Coach Financial Page.md, "The page shows")*

**3.2 The coach can't change the rink fee**
- **Given** the page shows a calculated rink fee for January 2029
- **When** Dana looks for a way to change it
- **Then** there is no field to edit the rink's terms, override a month's fee or enter what she paid
*(source: ADR-030 d6; FeatureDecriptions/Coach Financial Page.md, "Rink terms"; Q_Rink-Fees.md questions 18–19)*

**3.3 The summary download gains rink fees and net**
- **Given** Dana has paid lessons in 2029
- **When** she downloads the summary export for 2029
- **Then** each month's row also has the month's rink fees and net, and the totals row has the
  year's
*(source: FeatureDecriptions/Coach Financial Page.md, "Decided 2026-10-12" and "Export" ("rink fees and net join it in Phase 2"); Q_Rink-Fees.md, "What is already decided")*

**3.4 Rink terms are added by the developer**
- **Given** BladeBook reaches a rink with no terms yet
- **When** the developer adds that rink's terms as configuration
- **Then** coaches at that rink get rink fees calculated from those terms, and no coach can edit them
*(source: ADR-030 d6; FeatureDecriptions/Coach Financial Page.md (2026-10-12))*

## 4. Rules that must always hold
- **Gross is money received,** counted by lesson date (except a closed year's lesson paid late,
  which counts when paid, flagged as for an earlier year). *(ADR-030 d2, d4; ADR-MASTER §12)*
- **A closed year never changes.** It is read from `CLOSEDYEAR#<year>`, written once.
  *(ADR-030 d4 amendment 2026-11-16)*
- **The rink fee is calculated, never entered.** No coach-writable rink terms, override or
  amount-paid data exists. *(ADR-030 d6)*
- **Anything that returns names is a logged personal-data read; the summary export never holds
  names.** *(ADR-012; ADR-030 d7)*
- **The year is the calendar year**, the tax year for individuals in the US and Canada.
  *(ADR-030 d1)*

## Open questions
1. **How rink fees are calculated:** percentage, flat fee or hourly; whether the coach chooses or the
   rink charges whichever is higher; rates by ice type and sport; what the percentage is taken from;
   which month a lesson's fee falls into; how rate changes treat past months. Every question is in
   `docs/Q_Rink-Fees.md` (Parts A and B). *(ADR-030 d8; ADR-MASTER §25; Open-Pending §3)*
2. **What each lesson time must stamp for the calculation:** the rink and the sport, besides
   `iceType`. *(Q_Rink-Fees.md question 20; ADR-030 Consequences)*
3. **Whether the rink fee is labelled an estimate** in Phase 2, as the MVP-era plan said until the
   model was confirmed with Kim. *(FeatureDecriptions/Coach Financial Page.md, "Rink fees until the calculation is decided")*
4. **Rink fees for closed years:** whether `CLOSEDYEAR#` gains rink fees and net, and what earlier
   years saved without them show.
5. **The detailed export's columns, years covered and limits**, "decided with the privacy rules";
   whether it needs a recent sign-in; and how far back it can go once seats have expired (the
   archive, or not at all). *(ADR-030 d7, Consequences; ADR-MASTER §20)*
6. **Which earlier years are offered on screen**, and what the page shows for a year before the
   coach signed up or before `CLOSEDYEAR#` saving began (Batch 26).
7. **The definition of "net"** (presumably gross less rink fees) isn't written down.
8. **A coach at more than one rink:** fees per rink (Open-Pending §3) once rink selection arrives.
