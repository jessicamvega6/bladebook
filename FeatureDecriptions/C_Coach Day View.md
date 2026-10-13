Coach Day View
(Written 2026-10-12 from the Harbor design: design/harbor/coach/static/calendar-day.html)

One day of the coach's calendar as a list of every lesson time. Reached by clicking a day on the month
view, a day heading on the week view, or "Day view" on the Today dashboard.
The month and week views are described in Coach Dashboard on website.md and cancelation.md.

Header:
  The full date, and a summary: how many lessons are booked and how many times are still open.
  On today it also shows the current time.
  Month / Week / Day switch, previous and next day arrows, and a Today button.
  A link back to the week this day is in.

Every time on this day, earliest first. Each row shows the time and what's in it:
  Open: families can book this time.
  Held: the coach cancelled a lesson and kept the time closed (see cancelation.md).
  Booked: the skater's name, their family, and "repeats weekly" if it's part of a series.
  Every row shows the lesson length and price.
  A lesson that has started or finished shows its attendance (present, no-show or not recorded).
  A booked lesson that hasn't started has a Cancel button, which opens the cancel preview for that one lesson.
  Times that have already passed are greyed.

"Cancel this day" button: shown when the day has booked lessons that haven't started. Opens the cancel
preview for all of them (see cancelation.md, Coach cancelation). Lessons that have started can't be cancelled.

Special schedule: when the day falls in a special schedule, a banner names it, gives its dates, and says
these times replace the weekly schedule.

Days with no times:
  Time off: "Time off: <name>", its dates, and "Families can't book these days."
  Nothing on the weekly schedule for this weekday: says so, with a link to edit the weekly schedule.
