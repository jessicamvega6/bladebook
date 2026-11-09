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
  *Decided by the owner, 2026-09-30 (from ADR-008 §6b, moved 2026-11-08):* time off (vacation, illness known in
  advance, a tournament) is the most common kind of dated schedule a coach makes, far more common than a camp. So
  "Add time off or a special schedule" opens with a choice:
    No lessons (time off): the coach gives a name (optional, e.g. "Vacation"), a start date and an end date, and
      nothing else. The time, lesson length, cost and fee fields and the calendar of times are hidden.
    Special schedule: the full form with blocks (see Schedule Creater.md), for a camp or holiday hours.
  Planned versus unplanned: time off changes the schedule, so the times disappear from the booking page. That's
  right for time off known in advance. For a same-day absence (illness that morning, a family emergency) the coach
  uses *cancel this day* or *cancel this week* with **hold**, which cancels the lessons without changing the
  schedule. *(from ADR-008 §6b, moved 2026-11-08)*
  *Settled by the owner, 2026-09-30:* an unplanned day off during a special schedule is a cancellation, not a
  schedule change: *cancel this day*, holding the freed times so families can't rebook them, with the special
  schedule left as it is. A **planned** change inside a special schedule, such as shortening a camp, is an edit of
  that special schedule (see Schedule Creater.md). *(from ADR-004 Open, moved 2026-11-08)*
Time off form:
  Name (optional), first day off, last day off.
  Before review, the form shows how many booked lessons the time off will cancel, and says nothing
  changes until the coach accepts.
  Buttons: Back, and Review changes.

Overlap:
  Time off can't overlap another time off or special schedule. If it does, the form says which one and
  which dates overlap, and tells the coach to edit that one or choose dates outside it.
  Review changes is not allowed until it's fixed.
  Time off inside a camp is done by editing the camp, or, for a single day, by *cancel this day*.
  *(from ADR-008 §6b, moved 2026-11-08; the overlap message wording is in Schedule Creater.md, "Checks before review")*

Review:
  The same review page as a schedule change (see Schedule Creater.md), titled with the time off dates.
  Figures: lessons cancelled, lessons re-priced, families emailed.
  Lists every booked lesson that will be cancelled. Each family is emailed with a link to book another
  time. The cancelled times stop existing, so nobody can rebook them.
  The review lists every booking on those dates, which will be cancelled, and the families emailed. There is no
  release-or-hold question: the times no longer exist, so nothing can be rebooked into them.
  *(from ADR-008 §6b, moved 2026-11-08)*
  Button: "Accept & email N families". Nothing changes until the coach accepts.
  After accepting, the save status page follows (see C_Coach Schedule Save Status.md).
