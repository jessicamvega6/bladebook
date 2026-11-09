Client My Bookings
(Written 2026-10-12 from the Harbor design: design/harbor/client/static/bookings.html)

The page where a family sees and manages their lessons with the coach.
Cancelling and changing repeating lessons are described in cancelation.md; this describes the page itself.

Only for families with at least one approved skater. A family still waiting for approval doesn't get
this page (ADR-022 d6).

Header: "My bookings", the coach's name, and a "Book a lesson" button.

Skater filter: shown when the family has more than one approved skater. "Everyone" plus one choice per
skater. Filters every section below.

*Coach filter (owner, 2026-10-13; ADR-025 o; bookings-coach-filter.html):* a "Coach" dropdown beside the skater
filter, "All coaches" by default. It lists only coaches with upcoming lessons and is shown once two or more coaches
have them. It combines with the skater filter (e.g. Mia with Coach Ben) and filters every section below.
With more than one coach, the header says "Lessons with all your coaches" and each lesson names its coach.
When the filters leave nothing: "Nothing booked for <skater> with Coach <name>" and a "Show everything" button.
*(from ADR-025, amendment 2026-10-13, item o, and decision 7, moved 2026-11-08)*

Upcoming:
  Every lesson that hasn't started yet, soonest first. Shows the first 10, with "Show all" to see the rest.
  Each row: the date, day and time, the skater's first name, the lesson length and price.
  A lesson today is marked "Today".
  A lesson that is part of a repeating series is marked "Repeats weekly" or "Every N weeks".
  Each row has a Cancel button (see cancelation.md, Client cancelation).
  Note under the heading: cancelling one lesson doesn't change the rest of its series.
  Nothing booked: a message with a "Book a lesson" button.
  *Shared lessons (added 2026-10-13, ADR-031 decisions 6, 9 and 10; bookings-shared.html):*
    A shared lesson shows the other skater's name (e.g. "Mia R.") and whether they've joined or are still invited,
      and the family's own share of the price.
    An invitation to share a lesson shows here for the invited family.
      *Restored 2026-10-13: consumer-invite makes it visible (ADR-031 decision 6). It shows before they accept.*
    When the other skater leaves in time, the staying family's card (keep at full price or cancel) shows here and
      on Home. With several dates in one series there is one card for the series (see cancelation.md).
    A lesson the family kept at the full price has an "Invite a skater" button. It invites a skater to that one
      lesson only. It isn't shown on any other lesson.

Repeating lessons (only shown when the family has one):
  One row per series that still has lessons to come: skater, day of the week, time, how often, the
  last date, and how many lessons are left.
  Each row has a Change button that opens Change a repeating lesson (see cancelation.md, Client
  recurrence management).
  Note: shorten a series, make it less frequent, or stop it. To add lessons, book again.
  *Added 2026-10-13 (ADR-031 decision 9): while a series is shared, Change offers only cancelling one lesson or the
  whole series (see cancelation.md, Shared series).*

Recent:
  The last 4 lessons that have already happened, newest first, greyed.
  Each shows the attendance the coach recorded (present or no-show). A lesson with nothing recorded
  shows no badge.

Older lessons:
  Lessons settled long ago are archived. The rule for what history screens say about them is in Coach lesson list,
  "When older lessons are archived"; ADR-017 says "history screens", so it applies to this page's Recent section too.
