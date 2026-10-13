Rinkside Cancel Several Lessons
(Written 2026-10-12 from the Harbor design: design/harbor/rinkside/static/week.html and week-confirm.html)

The Week tab of the rinkside app. Lets the coach cancel several lessons at once from their phone, from today
to the end of this week: part of a day, a whole day, or part of the week (ADR-009 d5a).
Cancelling a single lesson from Today is described in Coach App.

The page lists each day from today to the end of the week, with the lessons that can still be cancelled:
  Each lesson has a checkbox, its time, the skater's name and the lesson length.
  "Select whole day" picks every lesson that day ("Clear day" undoes it).
  Each picked lesson asks whether the time can be booked again: Release, or Hold closed (see cancelation.md).
  Lessons that have started can't be picked. A day says how many have already started, or "No lessons".

Button at the bottom: "Cancel N lessons", disabled until at least one is picked.

Confirmation: one confirmation lists every picked lesson and whether it's held or released, names the
families who will be emailed, and says held times stay closed and this can't be undone.
Buttons: "Cancel N lessons" and "Keep them".
Afterwards a message says how many were cancelled, how many held, and how many families will be emailed.

No signal: the coach can look but not cancel. A banner says cancelling needs a connection and the
checkboxes are disabled.
