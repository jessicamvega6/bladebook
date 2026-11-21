Coach Email Templates (Phase 2)
(Written 2026-10-12 from the Harbor design: design/harbor/coach/static/email-templates.html)

Phase 2. Not in the first release. Until then every email is sent automatically.
Reached from the Today dashboard ("Email templates", tagged Phase 2). Sits under Profile in the navigation.
The list of emails BladeBook needs is in "Email templates Needed:".

The coach sees what each automatic email says and chooses which ones go out.

Emails families get:
  Booking confirmation: when a family books.
  Day-of reminder: the morning of each lesson day, one email per family listing that day's lessons (owner,
    2026-11-13).
  Payment reminder: after a lesson is checked in. Includes the coach's payment instructions, and their
    payment types they have switched on in their profile (one switch per type, ADR-016 d7).
  Lesson cancelled by you: when the coach cancels a lesson, day or week. Always sent.
  Schedule change: when a schedule save cancels or re-prices lessons. Always sent.
  Sign-up declined: when the coach declines a new skater. Always sent.

Emails the coach gets:
  Morning email: around 7 AM on days with lessons. The rinkside link first, then the day's lessons. Sent to your login email. (ADR-023, 2026-10-13; address 2026-10-15)
  ~~Daily report: every evening at 9 PM.~~ *Phase 2 (owner, 2026-11-11)*: the daily report isn't in MVP; on this page it carries a Phase 2 tag.
  A family cancelled late: when a family cancels inside your notice period. (ADR-009, settled 2026-10-08)
  Unpaid lessons: weekly, on Monday morning.

Each email has an on/off switch. Emails marked "Always sent" have no switch: emails about cancellations and
schedule changes always go out, so families are never left guessing.

Preview: clicking an email shows it as it will arrive: From ("<coach name> via BladeBook"), Reply-To (the
coach's business email on family emails), To, Subject and the body. A switched-off email says it won't be sent.
