Coach Schedule Save Status
(Written 2026-10-12 from the Harbor design: design/harbor/coach/static/schedule-status.html
 and schedule-status-done.html)

Shown after the coach accepts a schedule change, time off or special schedule on the review page
(see Schedule Creater.md and C_Coach Time Off.md).

Three steps, each ticked off as it finishes:
  Applying changes: how many lessons are being updated.
  Emailing families: how many families.
  Done: the schedule is live.

While saving: "Saving your changes. You can leave this page; saving carries on in the background."
When done: "Saved", how many families were emailed, and a "Back to your schedule" button.

If saving takes more than an hour, the page says: "We're having trouble applying this change. We've been
alerted, and your families haven't been notified yet."

States, from ADR-010 5l:
  *Decided by the owner, 2026-09-30 — in MVP.* After Accept the coach website says "saved", but the cancellations,
  re-prices and messages happen in the background. If that stalls, the coach would believe families had been told
  when they had not. So the schedule page shows the latest change's state:

  | Header state | The coach sees |
  |---|---|
  | Not `EXECUTED`, under an hour old | *"Saving your changes"* — "You can leave this page — saving carries on in the background." Step in progress: "Applying changes · Updating 14 lessons" |
  | `EXECUTED`, families not all told yet | *"Saving your changes"* — step in progress: "Emailing families · 6 families" |
  | `EXECUTED`, every line notified | *"Saved"* — "6 families emailed." (or "No families needed telling.") |
  | Not `EXECUTED`, **over an hour old** — the same threshold the drift check pages on | *"We're having trouble applying this change. We've been alerted, and your families haven't been notified yet."* |
  | Any line `SKIPPED` as `LESSON_PASSED` | The lessons listed, with a prompt to waive them and contact the families — the same information the coach is emailed (5i) |

  *Wording settled 2026-11-09 (owner asked Claude to pick):* the design's wording, with the ADR's states and counts
  shown as the design's steps. The over-an-hour message is the same in both.
  The page refreshes the state while a change is applying. The rinkside app may show a one-line status for its own
  cancellations, but need not: a single cancellation finishes in seconds.
  *(from ADR-010 §5l, moved 2026-11-08)*
