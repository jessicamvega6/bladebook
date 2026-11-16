# Batch 12: Financial page

**Built:** 2026-11-13 · merged by PR #37 · back to the [implementation plan](../implementation-plan.md)

This file is a finished record, kept as it was written at the time. What's still open lives in the root
`README.md` (gaps and shortcuts) and `AI/implementation-plan.md` (what's left to build). A section number such as §4
or §6 below means the plan as it was then: its conflicts (§4) and decisions (§6) are now in `AI/plan-history.md`,
and §7 meant these batch logs.

## The plan, as written before it was built

From the plan's batch table. Struck-out text is what was first planned; the text after it is what changed.

~~Financial page: gross and the summary CSV (gross only; rink fees are Phase 2, owner 2026-11-12). Turns on Payments' *Financial summary* (G-35)~~ **Done** (PR #37). G-36 (a closed year can still drop) is planned as Batch 26 (owner, 2026-11-13)

## Log

The full list, with what closes each one, is in the root `README.md`.

- **Rulings applied:** R10d (the page keeps *"Gross is money you’ve received."*; gross only, and the page says rink fee
  calculation is coming, ADR-030 as amended 2026-11-12).
- **Closed:** G-35's financial half (Payments' *Financial summary* opens the new page). *Send reminders* stays Phase 2.
- **Gaps:** G-36 a closed year's figures can still drop when one of its paid lessons is undone. *Owner, 2026-11-13:
  save each year's figures when it closes (option c), planned as Batch 26.* G-39 (added 2026-11-15) a lesson from before
  last year can still be marked paid, waived or undone, and then counts in no year; Batch 27 makes it view only.
- **Settled while building (owner may override):**
  - **A finished year closes at midnight starting January 1 in the coach's time zone.** ~~A lesson from it marked paid
    after that counts in no year, as ADR-MASTER §12 and the design's banner say.~~ *Owner, 2026-11-13: it counts in
    the year and month it was marked paid, labelled "Includes $30 for 2025 lessons" under the month and the year's
    total, and in the download's new column "Of which for lessons in earlier years". Only last year's lessons are
    read for it; one from further back marked paid now isn't counted (settled; *owner, 2026-11-15: such lessons
    become view only, Batch 27*). The design's
    banner was reworded to match.* ~~*`FeatureDecriptions/Coach Financial
    Page.md` also says "A December lesson paid in January counts in December's gross", which can't hold alongside a
    year that closes when it ends; this build follows ADR-MASTER. If December's late payments should count, the year
    needs a later closing date (for example the end of January).*~~ *Resolved by the same ruling: the closing date
    stays January 1, and that line in the feature note is struck.*
  - **The figures are worked out from the Payments page's rows**, so a lesson's amount is the same share Payments shows
    (a no-show marked paid at its share is the missed-lesson fee collected), and only lessons that have started count.
    Nothing is stored: each visit adds the year up again from the seats.
  - **"Still unpaid"** is this year's lessons that have happened and are still unpaid, as the design draws it; the
    month table shows *"$X still unpaid"* under a month's count.
  - **The page shows this year only**; the server answers this year or last (*"Pick this year or last year."*), so the
    download can take last year. The year is the coach's, from their time zone.
  - **The download is built on the server and saved by the browser** (`GET /api/coach/finances/download` returns the
    file name and the text, so it goes through the same sign-in as every call). File `bladebook-summary-<year>.csv`;
    columns *Month*, *Paid lessons*, *Gross received (USD)* and, since the 2026-11-13 ruling, *Of which for lessons in
    earlier years (USD)*; amounts as decimals (`75.01`); this month is labelled
    *"November 2026 (to Nov 13)"*; the last row is *"2025 total"* or *"2026 to date"*; lines end in CRLF. No names.
  - **Amounts stay per currency underneath; the page and the download show the coach's currency**, which can't change
    in MVP.
  - **Months before the first with any lesson** (paid, unpaid or waived) fold into one *"No lessons in BladeBook"* row,
    as designed.
  - **The route is `#/finances`**, under the Payments tab, with a *Payments* link back. *Past years* is shown disabled
    with its Phase 2 tag, as designed.
  - **`expiresAt` isn't filtered**: no item carries it until the TTL archiver (Batch 17).
- **Checked in the running app (table `bladebook-b12check`):** a coach and a family sign up, the skater is approved, and
  today's 2:15 PM lesson is booked → once it started, the page showed $50 still unpaid and no gross → marked paid with
  Cash: November 1 lesson, $50, *"2026 to date"* $50 → the 2026 download ends *"November 2026 (to Nov 13),1,50.00"* /
  *"2026 to date,1,50.00"* (before the 2026-11-13 ruling added the earlier-years column); the 2025 download has twelve empty months and *"2025 total"* → 2024 refused → Undo took it
  back out of gross. Headless Chrome: the page at 1280px and 390px (the month table scrolls sideways inside its card
  at phone width, from the design's 680px table minimum), and Payments' *Financial summary* is a working link. The
  browser's file save is checked in tests only.
