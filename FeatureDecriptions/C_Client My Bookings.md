Client My Bookings
(Written 2026-10-12 from the Harbor design: design/harbor/client/static/bookings.html)

The page where a family sees and manages their lessons with the coach.
Cancelling and changing repeating lessons are described in cancelation.md; this describes the page itself.

Only for families with at least one approved skater. A family still waiting for approval doesn't get
this page (ADR-022 d6).

Header: "My bookings", the coach's name, and a "Book a lesson" button.

Skater filter: shown when the family has more than one approved skater. "Everyone" plus one choice per
skater. Filters every section below.

Upcoming:
  Every lesson that hasn't started yet, soonest first. Shows the first 10, with "Show all" to see the rest.
  Each row: the date, day and time, the skater's first name, the lesson length and price.
  A lesson today is marked "Today".
  A lesson that is part of a repeating series is marked "Repeats weekly" or "Every N weeks".
  Each row has a Cancel button (see cancelation.md, Client cancelation).
  Note under the heading: cancelling one lesson doesn't change the rest of its series.
  Nothing booked: a message with a "Book a lesson" button.

Repeating lessons (only shown when the family has one):
  One row per series that still has lessons to come: skater, day of the week, time, how often, the
  last date, and how many lessons are left.
  Each row has a Change button that opens Change a repeating lesson (see cancelation.md, Client
  recurrence management).
  Note: shorten a series, make it less frequent, or stop it. To add lessons, book again.

Recent:
  The last 4 lessons that have already happened, newest first, greyed.
  Each shows the attendance the coach recorded (present or no-show). A lesson with nothing recorded
  shows no badge.
