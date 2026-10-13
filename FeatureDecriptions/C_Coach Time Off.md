Coach Time Off
(Written 2026-10-12 from the Harbor design: design/harbor/coach/static/schedule-add-dates.html,
 schedule-time-off.html, schedule-time-off-overlap.html and schedule-review-time-off.html)

Time off is a named range of dates with no lessons. Families can't book them.
Special schedules (different times, lengths or prices for a set of dates) use the dated version of the
schedule editor and are described in Schedule Creater.md.

Choosing time off or a special schedule:
  Reached from "Add time off or a special schedule" on the schedule hub (see C_Coach Schedule Hub.md) and
  from the Today dashboard.
  Asks "What's different about these dates?" with two choices:
    No lessons: vacation, a tournament, an absence known in advance. Just a name and dates.
    Special schedule: a camp or holiday hours.
  A "Sick today?" note points the coach to "Cancel this day" on the week view instead, which cancels
  lessons without changing the schedule (see cancelation.md).

Time off form:
  Name (optional), first day off, last day off.
  Before review, the form shows how many booked lessons the time off will cancel, and says nothing
  changes until the coach accepts.
  Buttons: Back, and Review changes.

Overlap:
  Time off can't overlap another time off or special schedule. If it does, the form says which one and
  which dates overlap, and tells the coach to edit that one or choose dates outside it.
  Review changes is not allowed until it's fixed.

Review:
  The same review page as a schedule change (see Schedule Creater.md), titled with the time off dates.
  Figures: lessons cancelled, lessons re-priced, families emailed.
  Lists every booked lesson that will be cancelled. Each family is emailed with a link to book another
  time. The cancelled times stop existing, so nobody can rebook them.
  Button: "Accept & email N families". Nothing changes until the coach accepts.
  After accepting, the save status page follows (see C_Coach Schedule Save Status.md).
