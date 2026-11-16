# Batch 9: Repeating bookings

**Built:** 2026-11-12 · merged by PR #28 · back to the [implementation plan](../implementation-plan.md)

This file is a finished record, kept as it was written at the time. What's still open lives in the root
`README.md` (gaps and shortcuts) and `AI/implementation-plan.md` (what's left to build). A section number such as §4
or §6 below means the plan as it was then: its conflicts (§4) and decisions (§6) are now in `AI/plan-history.md`,
and §7 meant these batch logs.

## The plan, as written before it was built

From the plan's batch table. Struck-out text is what was first planned; the text after it is what changed.

~~Recurring bookings and recurrence changes~~ **Done** (PR #28). B4 (a shared series) moved to Batch 11; what's left of G-20 is Batch 24

## Log

The full list, with what closes each one, is in the root `README.md`.

- **Rulings applied:** B9 (the change page names each cancelled lesson inside the notice period and marks it
  *Cancelled · late*); B12 (*"repeats weekly"* or *"repeats every N weeks"* on Home, My bookings and the coach's day
  view). B4 (shared series) waits for sharing (Batch 11).
- **Closed:** G-20 mostly (the confirm pop-up's *Repeat these lessons*, *Repeats* and *Until*; series on My bookings
  with *Change*; the change page). Left in G-20: a reused key with a different request isn't refused, and a dropped
  slot isn't asked about.
- **Settled while building (owner may override):**
  - **Each repeating pick is its own series**, named by an ID derived from the request's key, weekday and time, so a retry
    names the same series. Picks on the same weekday and time in different weeks join one series.
  - **The picks must be in the booking window; a series' later dates may run past it**, up to 12 months after the first
    pick (*"A repeating booking can run up to 12 months."*). At most 300 dates in one request.
  - **Dates are booked one by one, not in parallel** (the ADR says in parallel); each is still its own transaction and a
    failure doesn't stop the rest.
  - **The header is written once, after the dates, if any booked**; a retry finds it there. A missing header is rebuilt
    when My bookings loads.
  - **A series change cancels its lessons as one batch** (`RECURRENCE`, `cancelledBy CLIENT`), each lesson in its own
    transaction with its line, the header `EXECUTED` last; then the series header is updated (end date, interval, or
    `ENDED`). *Less often* anchors on the first lesson after today and keeps every Nth week from it.
  - **Lessons show how often their series repeats now** (the family's header). The coach's day view shows the interval
    the seat was booked with (G-20).
- **Checked in the running app (APIs only; table `bladebook-b9check`):** a weekly series of six Sundays booked → My
  bookings lists it (6 left, to Dec 20) → *every 2 weeks* cancels 3 and keeps Nov 15, Nov 29 and Dec 13 → the coach's
  day view shows the series label.
