Rinkside Cancel Several Lessons
(Written 2026-10-12 from the Harbor design: design/harbor/rinkside/static/week.html and week-confirm.html.
Redrawn 2026-11-16: week.html, week-lesson.html, week-day.html; week-confirm.html is gone.)

The Week tab of the rinkside app. Lets the coach cancel lessons from their phone, from today to the end of this
week. ~~part of a day, a whole day, or part of the week (ADR-009 d5a).~~
*Owner, 2026-11-16:* only three ways, as on the website: **one lesson, a whole day, or the rest of the week.**
Nothing in between: to cancel a lesson on Monday and another on Friday, the coach cancels each one on its own
(ADR-009, amended 2026-11-16).
Cancelling a single lesson from Today is described in Coach App.

The page lists each day from today to the end of the week, with the lessons that can still be cancelled:
  ~~Each lesson has a checkbox, its time, the skater's name and the lesson length.
  "Select whole day" picks every lesson that day ("Clear day" undoes it).
  Each picked lesson asks whether the time can be booked again: Release, or Hold closed (see cancelation.md).~~
  *Owner, 2026-11-16:* each lesson shows its time, the skater's name, the lesson length and a "Cancel" button.
    Cancel opens the same confirmation as cancelling from Today: it names the lesson and the family who will be
    emailed, and asks "Release for rebooking" or "Hold it closed".
  A day with two or more lessons has "Cancel whole day". Its confirmation lists every lesson left that day and asks
    Release or Hold closed for each one (see cancelation.md). Buttons: "Cancel N lessons" and "Keep them".
  *Changed 2026-11-08 (owner; ADR-009):* cancelling the whole week (everything left from now to Saturday) doesn't ask:
    every booked lesson and every open time is held closed, as with "Cancel rest of week" on the website.
    ~~The Harbor design hasn't been redrawn for this yet.~~ *Drawn 2026-11-08: a "Cancel the rest of the week"
    card at the top of the tab, stating how many lessons and open times it holds, and its confirmation listing
    each one as Hold (design week-all-confirm).*
  Lessons that have started aren't listed. A day says how many have already started, or "No lessons".

~~Button at the bottom: "Cancel N lessons", disabled until at least one is picked.~~ *(Removed 2026-11-16: nothing
is picked across the week.)*

~~Confirmation: one confirmation lists every picked lesson and whether it's held or released, names the
families who will be emailed, and says held times stay closed and this can't be undone.
Buttons: "Cancel N lessons" and "Keep them".~~
Afterwards a message says how many were cancelled, how many held, and how many families will be emailed.

~~No signal: the coach can look but not cancel. A banner says cancelling needs a connection and the
checkboxes are disabled.~~
No signal: the Week tab shows no lessons. It says "The week needs a connection. Cancelling needs signal
too. Today's lessons are on the Today tab." with a "Go to Today" button. *Owner, 2026-11-09 (R5).*
Why: the phone saves only today's lessons (one device, one day of names, ADR-014), and cancelling needs
signal anyway, so there is nothing to show or do for the rest of the week.

*Built 2026-11-16 (Batch 23).* As above, with these details settled while building (the owner may change them):
  ~~The picked lessons are cancelled together, so each family gets one email even when their lessons are on
    different days (ADR-009, amended 2026-11-16).~~ *Owner, 2026-11-16: no picking across days. One lesson is
    cancelled as one lesson and a whole day as one day, so a family whose lessons are cancelled one by one gets
    an email for each.*
  A lesson already marked Present or No-show isn't listed either; it counts with the ones that have started.
  If a lesson started or was cancelled meanwhile, it's left alone and the message afterwards says so:
    "1 lesson had already started or gone, so it was left alone." (the website's wording).
  The message afterwards leaves out "N families will be emailed" when no family is.
  *Owner, 2026-11-16:* times are written "1:00 PM" everywhere, so a lesson's time here reads "3:00 PM" or
    "10:30 AM" (on Today as well), not "3pm" or the design's "3:00". The design was changed to match.
