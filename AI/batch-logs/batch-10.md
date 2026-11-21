# Batch 10: Rinkside page offline

**Built:** 2026-11-12 · merged by PR #29 · back to the [implementation plan](../implementation-plan.md)

This file is a finished record, kept as it was written at the time. What's still open lives in the root
`README.md` (gaps and shortcuts) and `AI/implementation-plan.md` (what's left to build). A section number such as §4
or §6 below means the plan as it was then: its conflicts (§4) and decisions (§6) are now in `AI/plan-history.md`,
and §7 meant these batch logs.

## The plan, as written before it was built

From the plan's batch table. Struck-out text is what was first planned; the text after it is what changed.

~~Rinkside offline queue and service worker~~ **Done** (PR #29). What's left of G-32 is Batch 25

## Log

The full list, with what closes each one, is in the root `README.md`.

- **Rulings applied:** R2 (logging out keeps waiting check-ins; they send only after the coach who recorded them logs
  in again; the log-in page says how many are waiting); R3 (*Not sent* with *Record on the website* and *Done*,
  removed after 7 days, marked *"Will be removed tomorrow."* the day before); R4 (a family's cancel is cleared, not
  listed, and the lesson shows struck through as *Cancelled*); ADR-014 §5a (*"Today’s lessons haven’t loaded"* rather
  than an empty day).
- **Closed:** G-32 mostly. Left in it: no notice that Safari cleared the offline copy, and no check on a real iPhone.
- **Settled while building (owner may override):**
  - **What's kept on the phone** (`localStorage`): today's lessons per coach (names and times, no contact details),
    the queue, and *Not sent*. The copy of today follows every tap, so a reload with no signal shows what was recorded.
    A copy from another day is never shown.
  - **No signal** is the browser's *offline* signal or any request that can't reach BladeBook. Contact details and
    cancelling are turned off with *"Needs a connection"*.
  - **Sending:** when signal returns, this coach's queue is sent in order, one at a time; a second tap on the same
    skater and lesson replaces the first in the queue. The row then shows what BladeBook recorded.
  - **The server says when the family cancelled:** a check-in on a lesson the family cancelled is answered *"This
    lesson was cancelled by the family at 7:20 AM, before your check-in reached BladeBook."* (the wording the feature note and the design
    card both use). A lesson the coach cancelled keeps the old message.
  - **The service worker** (`web/public/coach/rinkside/sw.js`, scope `/coach/rinkside/`) is network first and keeps a
    copy of the page's own files, never `/api/`. It's registered in the built site only.
- **Checked:** headless Chrome on the built site: the worker took control, and with the network cut a reload opened the
  page from its copy (*"Today’s lessons haven’t loaded"*, since the sandbox kept the preview server from reaching the
  API). The rest is in tests.
