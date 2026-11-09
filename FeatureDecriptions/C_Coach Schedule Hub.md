Coach Schedule Hub
(Written 2026-10-12 from the Harbor design: design/harbor/coach/static/schedule-hub.html)

The landing page of the Schedule section ("Your schedule"). Reached from Schedule in the main navigation.
The editors it leads to are described in Schedule Creater.md and C_Coach Time Off.md.

Two ways in:
  Edit weekly schedule: the coach's normal week, which repeats until they change it. The card shows the
    days it runs, how many blocks it has and how many lessons a week. Opens the weekly editor.
  Add time off or a special schedule: for a set range of dates, e.g. vacation, a tournament, a camp or
    holiday hours. Opens the "What's different about these dates?" choice (see C_Coach Time Off.md).

No schedule yet:
  *Settled by the owner, 2026-08-30:* for the coach, an empty schedule is a task, not a status, so their own view
  prompts them to build a schedule. (Families see an all-grey calendar with a line saying the coach hasn't posted
  any times yet; see Bookings:.) *(from ADR-008 Open, moved 2026-11-08)*

Time off and special schedules:
  Every upcoming one, with its name, whether it's a special schedule or time off ("No lessons"), its dates,
  and an Edit button.

Booked lessons coming up:
  The upcoming booked lessons: skater, date and time, length and price.
  Note: changes are checked against these before anything is saved. A change that would cancel or
  re-price any of them is shown on the review page first (see Schedule Creater.md).
