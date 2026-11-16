# Batch 26: Saving a closed year's figures

**Built:** 2026-11-16 · merged by PR #52 · back to the [implementation plan](../implementation-plan.md)

This file is a finished record, kept as it was written at the time. What's still open lives in the root
`README.md` (gaps and shortcuts) and `AI/implementation-plan.md` (what's left to build). A section number such as §4
or §6 below means the plan as it was then: its conflicts (§4) and decisions (§6) are now in `AI/plan-history.md`,
and §7 meant these batch logs.

## The plan, as written before it was built

From the plan's batch table. Struck-out text is what was first planned; the text after it is what changed.

**Done** (branch `feature/batch-26-closed-years`, 2026-11-16; §7). **Added 2026-11-13: saving a closed year's figures** (G-36; owner, 2026-11-13, option c). When a year closes, its month-by-month figures (paid lessons, gross, and the part for earlier years' lessons, per currency) are saved once on the coach's partition, written only if not there already. A scheduled job saves them for every coach in the first days of January, and the first read of a closed year saves them if the job hasn't. From then on the financial page and the summary download read the saved figures, so neither *Undo* on Payments nor old records being deleted can change a closed year. A correction to a closed year's lesson counts in the year it's made, as a late payment does. Item name and shape settled when built; ADR-030 decision 4 and ADR-MASTER §12 amended then

**Held back by:** Batch 13's scheduled jobs. Before Batch 17, which turns on the deletion of old records (ADR-MASTER §20: a paid lesson goes about 16 months after it's paid)

## Log

The full list, with what closes each one, is in the root `README.md`.

- **Rulings applied:** G-36 option c (owner, 2026-11-13): save each year's figures when it closes; the ADR-030
  amendment of 2026-11-13 (a late payment for a closed year's lesson counts in the month it's paid, flagged as for an
  earlier year), extended to corrections: a correction to a closed year counts in the year it's made.
- **Built:** `core`: `FinancialSummary` takes corrections (`Correction`: an undone payment, counted in the month it was
  undone) and reads a saved year (`saved`), with `countedIn` (the year a payment counted in) and `closesAt`; months and
  years carry `undoneLessons` and `undoneGross`. `FinancialRepository` saves `CLOSEDYEAR#<year>` once (conditional put)
  and reads it, and reads `PAYCORRECTION#` items. `PaymentRepository.undo` can write the seat and its correction in one
  transaction. `PaymentService.undo` works out the year the payment counted in; if that year has closed, it saves the year
  first (through `FinancialService`), then undoes with a correction. `FinancialService` reads a closed year from its saved
  figures, saving them on the first read; `saveClosedYear` is the job's step. `ClosedYearJob` (`sched-year-close`) saves
  the year before its date's for every coach whose year has closed. `api-coach`: the job on the local timer (8:00 AM
  Central, January 1–7) and `POST /api/coach/local/jobs/year-close?date=`; the finances responses carry the undone
  figures. `web`: the financial page shows *"Less $50 for 2025 lessons marked unpaid"* under the month and the year's
  total, lists a month whose only entry is such an undo, and shows gross below zero as *"−$50"*.
- **Docs:** ADR-030 (amendment of 2026-11-16, decision 4, decision 7's download, Consequences), ADR-MASTER §2, §3 (two new
  items), §12, §14 (`sched-year-close`) and §20 (their retention), `FeatureDecriptions/Coach Financial Page.md`.
- **Closed:** G-36.
- **Shortcuts:** SC-27 `sched-year-close` runs on a local timer, with a local route to run it for any date.
- **Gaps:** ~~G-48 the Harbor design doesn't draw a closed year's payment undone this year (built as *"Less $50 for 2025
  lessons marked unpaid"*; the banner and the card's note are as drawn; Payments doesn't warn before such an undo).~~
  Closed by the owner's ruling of 2026-11-16 (below).
- **Settled while building (owner may override):**
  - **The items:** `CLOSEDYEAR#<year>` (the twelve months: `month`, `hasLessons`, `paidLessons`, `gross`, `earlierLessons`,
    `earlierGross`, `undoneLessons`, `undoneGross`, amounts per currency; `savedAt`; `savedBy` `JOB`, `READ` or `UNDO`)
    and `PAYCORRECTION#<undoneAt>#<seatKey>` (`undoneAt`, `lessonDate`, `startTime`, `studentId`, `amountMinor`,
    `currency`, `forYear`, `undoneBy`). No names. *"Still unpaid"* isn't saved: it's this year's figure only.
  - ~~**An undo of a closed year's payment lowers this year's gross, not its count of paid lessons.**~~ *Overruled
    2026-11-16 (below).* It's shown on its own line and counted in `undoneLessons`. Marking the lesson paid again later
    counts as a late payment, so the two cancel out.
  - ~~**The download keeps its four columns.**~~ *Overruled 2026-11-16 (below).*
  - **Only an undo is a correction.** Changing how a lesson was paid moves no money, and waiving applies only to unpaid
    lessons. Undoing a late payment (a December lesson paid in January) is an ordinary undo of the year it was paid in;
    undoing a payment that counted in no year (G-39) changes nothing.
  - **The closed year is saved before its first undo**, so a year the job hasn't reached yet can't lose the payment and
    then have the correction take it off again. Saving and the undo aren't one transaction; the saved year is read from
    the seats before the undo commits, so the order holds.
  - **The job saves the year before its date's** for every coach, and reads the clock only to check each coach's year has
    closed (skipping those it hasn't: `notClosedYet`). It is safe to run twice; one coach's failure doesn't stop the rest.
    On AWS it is a second Scheduler rule on `sched-lesson-roller`'s function (January 1–7, 8:00 AM launch time, after
    midnight everywhere a coach can be), so the count of functions stays sixteen (kept by the owner, 2026-11-16).
  - **The first read of a closed year** is the download of last year (the page shows this year only).
  - **`PaymentService` learns of `FinancialService` through a hook** that `FinancialService` sets when it's made (it reads
    Payments' rows to add a year up, so neither can take the other in its constructor). Without it an undo of a closed
    year's payment is refused rather than written without saving the year first.
- **Owner rulings (2026-11-16), applied on the same branch (PR #52):**
  1. **G-48, the undo's wording: kept as built** (*"Less $50 for 2025 lessons marked unpaid"*); G-48 is closed (its row is
     gone from the root `README.md`). **New: Payments asks before *Undo* on a payment that counted in a closed year.**
     `core`: `PaymentService.Row` gains `closedYear` (the closed year a paid lesson's payment counted in, else null),
     worked out with `FinancialSummary.countedIn` in the coach's time zone, the same test `undo` uses to decide on a
     correction; `View` gains `thisYear`. `api-coach`: both on the Payments DTOs. `web`: *Undo* on such a row opens
     *"Undo a payment from 2025?"* — *"2025 is closed, so its figures won't change. Undoing this takes $50 off 2026's
     figures, in this month."* — *Cancel* / *Undo payment*, in the Waive dialog's Harbor style (icon, the lesson's
     line, fine print, actions); other rows' *Undo* is unchanged. The page doesn't work out year closing itself.
  2. **An undo lowers the count of paid lessons too, but a month's count never goes below zero.** `FinancialSummary`: a
     month's `paidLessons` is the lessons marked paid less `undoneLessons`, and `Month` clamps it at 0, so it holds for
     a live year, a saved `CLOSEDYEAR#` year as read back, the page and the download; the year's count is the sum of
     the months'. The saved item now holds the lowered count.
  3. **The download has five columns:** *Month*, *Paid lessons*, *Gross received (CUR)* (net of undos), *Of which for
     lessons in earlier years (CUR)* (late payments only, never net of undos, never negative) and *Taken off for earlier
     years' lessons marked unpaid (CUR)* (positive); the totals row likewise. ADR-030 decision 7 (amended 2026-11-16)
     and the 2026-11-16 amendment's text, ADR-MASTER §12, and the feature notes say so.
  4. **The January job stays a second Scheduler rule on `sched-lesson-roller`'s function** (sixteen functions), as
     built; ADR-MASTER §14's row no longer says the owner may change it.
  - **Tests:** `FinancialSummaryTest` (an undo lowering the count; a month with undos and nothing paid showing 0, not
    −2; the year's total as the months' sum; a saved year's months read back never below zero; the five columns),
    `FinancialServiceTest` (which Payments rows carry `closedYear`, either side of midnight in Chicago, and not after a
    late re-payment), `FinancialApiTest` (the header), `AttendanceApiTest` (`thisYear`, no `closedYear` this year),
    `Payments.test.tsx` (the dialog asks, *Cancel* sends nothing, *Undo payment* undoes; another paid row undoes at once).
  - **Settled while applying (owner may override):** the row carries the closed year (a number) rather than a
    boolean, and the view carries this year, so the dialog can name both without the page working out either. The
    header's apostrophe is a plain `'` (spreadsheet apps can garble a curly one in a CSV); the page's text keeps
    curly ones. The dialog's button is the primary style, not the danger one Waive uses, as an undo can be redone. A
    `CLOSEDYEAR#` item saved by the earlier build of this branch (only the local `bladebook-b26check` table) holds a
    count not lowered by undos; nothing on AWS has one. No gap is opened for the dialog: the Harbor design has no
    such dialog, but it reuses the Waive dialog's parts, so it's recorded as settled rather than for drawing.
  - **Checked in the running app** (api-coach on :8104, Vite on :5192, table `bladebook-b26check`): Ava's Dec 8, 2025
    lesson put back as paid on Dec 9, 2025 → Payments lists it with `closedYear` 2025 and `thisYear` 2026 → *Undo* opens
    the dialog (headless Chrome at 1280px, and at 390px inside a 390px-wide frame: no sideways scroll) → undone: the
    2025 download unchanged (*"2025 total,1,50.00,0.00,0.00"*); 2026's November, with this undo and the earlier run's,
    reads *"0,-100.00,0.00,100.00"* (count 0, not −2).
- **Checked in the running app (APIs on :8104 and :8105, Vite on :5192; table `bladebook-b26check`):** a coach signs up
  and saves a schedule, a family signs up and is approved and books a lesson → the lesson time and seat were moved to Dec
  8, 2025 in DynamoDB Local and marked paid Dec 9, 2025 → nothing saved yet → the 2025 download (*"2025 total,1,50.00,0.00"*)
  saved the year (`savedBy` `READ`) → a second coach (Los Angeles) signs up → the job for 2026-01-02: `{"coaches":2,"saved":1,
  "alreadySaved":1,"notClosedYet":0}`; again for 2026-01-03: `saved 0, alreadySaved 2`, Dana's year unchanged → *Undo* on
  the Dec 8 lesson: 2025 still closed at $50; 2026 gross −$50 in November (`undoneLessons 1`), download *"2026 to
  date,0,-50.00,-50.00"*, one `PAYCORRECTION#` for 2025 → the seat deleted (as the TTL will): 2025 still $50, December
  still *has lessons*. Headless Chrome at 1280px and 390px: the financial page with *"−$50"* and *"Less $50 for 2025
  lessons marked unpaid"* under November and the year's total; no sideways page scroll (the month table scrolls inside its
  card, as in Batch 12). **Not checked in the app:** the job waiting for midnight in a coach's time zone (the real clock
  is in November; checked in `FinancialServiceTest`), and the local timer firing on January 1.
