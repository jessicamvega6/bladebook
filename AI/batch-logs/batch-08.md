# Batch 8: Payments

**Built:** 2026-11-12 · merged by PR #27 · back to the [implementation plan](../implementation-plan.md)

This file is a finished record, kept as it was written at the time. What's still open lives in the root
`README.md` (gaps and shortcuts) and `AI/implementation-plan.md` (what's left to build). A section number such as §4
or §6 below means the plan as it was then: its conflicts (§4) and decisions (§6) are now in `AI/plan-history.md`,
and §7 meant these batch logs.

## The plan, as written before it was built

- **Core (TDD):**
  - Money arithmetic in minor units, with odd cents going to the earliest skater.
  - Paid and waived transitions.
  - No totals across currencies.
- **Slice:** Payments, with a date range, the Unpaid/All switch, mark paid with how they paid, waive, and undo paid.
- **Ruling (2026-11-09):** R7: waived is final, with a confirmation before waiving. Undo is for paid lessons only.

## Log

The full list, with what closes each one, is in the root `README.md`.

- **Rulings applied:** R7 (waived is final; *Waive* always confirms; Undo is for paid lessons only).
- **Closed:** G-6 in part (Payments; Today's lessons and stats stay open); G-25 in part (`paymentStatus` on seats).
- **Gaps:** G-35 *Financial summary* (Batch 12) and *Send reminders* (Phase 2) shown disabled.
- **Settled while building (owner may override):**
  - **Only lessons that have started can be paid, waived or undone**, as only they're listed (*"Upcoming lessons
    aren’t listed until they’ve happened"*).
  - **A seat booked before Batch 8 has no `paymentStatus` and counts as unpaid**; the first payment write sets it.
  - **Each write is conditional on the status the coach saw**, so two windows can't, say, pay a lesson the other just
    waived: *"This lesson changed in another window. Reload the page and try again."*
  - **How they paid** is one of the coach's payment types or Other, or nothing; a stored type switched off since stays
    a choice when editing. Paying again on a paid lesson changes only how, keeping `paidAt`.
  - **Totals are per currency**; the page shows the coach's own currency.
  - **The figures are worked out by the server**, so the page never adds amounts itself.
  - **GSI3 isn't added yet**: the page reads seats by date range; the unpaid index belongs to the weekly reminder
    (Batch 13).
- **Checked in the running app (table `bladebook-b7check`):** the Payments list for today (Ava, attended, $50,
  unpaid; choices *Other*) → mark paid with Other → the page in headless Chrome: Paid $50, *Other · Change*, Undo.
