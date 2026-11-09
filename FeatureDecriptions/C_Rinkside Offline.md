Rinkside Offline (no signal)
(Written 2026-10-12 from the Harbor design: design/harbor/rinkside/static/offline.html, not-loaded.html,
 unsent.html and family-cancelled.html)

How the rinkside app behaves when the coach's phone has no signal at the rink (ADR-014).
The rest of the rinkside app is described in Coach App.

Recording with no signal:
  A banner on Today says "No signal since <time>" and how many check-ins are saved on the phone.
  The coach keeps tapping Present or No-show as normal. Each one shows "Saved on phone" with the time it
  was recorded on the phone, and is sent when signal comes back.
  Contact details and cancelling need a connection. Tapping a name says "Contact details need a connection."
  They aren't stored on the phone (ADR-014 d9b).
  The app tells the coach plainly that check-ins are not reaching the server right now, that what they record is
  saved on the phone, and that it will be sent automatically once signal returns. The banner can't be dismissed
  while anything is waiting to send: a coach who doesn't know their check-ins are queued will assume the payment
  reminders went out.
  *(from ADR-014 §1, decided by the owner 2026-08-30; moved 2026-11-08)*

Today's lessons haven't loaded:
  If the app is opened with no signal before today's lessons were ever loaded, it says so and asks the coach
  to open it once with signal before leaving for the rink. A "Try again" button retries.
  It shows this message rather than an empty list, which would look like a day with no lessons:
  "Today's lessons haven't loaded. Open the app with signal before you leave for the rink."
  *(from ADR-014 §5a, decided by the owner 2026-09-30; moved 2026-11-08)*

The offline copy was cleared:
  Safari may remove the page's stored data (its offline copy, the saved check-ins and today's lessons) after
  7 days of Safari use without a visit. If the page opens with signal and finds its offline copy gone, it says so
  plainly and reloads the copy, so it works without signal again. A cleared page can't open with no signal at all;
  the advice above, to open the page with signal before leaving for the rink, covers this.
  *(from ADR-014's amendment of 2026-10-13, decided by the owner; moved 2026-11-08)*

Couldn't be sent:
  When signal returns, saved check-ins are sent. The server turns one down outright only when its time doesn't fit
  its lesson (the phone's clock was wrong). A family's cancellation is not listed here: it's cleared, and the lesson
  shows as cancelled on Today (see "The family had cancelled"). *Ruled by the owner 2026-11-09.*
  Today shows a banner "N check-ins couldn't be sent" linking to the Not sent page.
  The Not sent page lists each one: the skater, the lesson, what was recorded and when, and the reason.
  ~~Each has a Dismiss button.~~ Each has "Record on the website" and "Done" (below). They're kept so nothing is lost
  silently.
  With nothing on it: "Everything was sent", with a button back to today.

  *From ADR-014 §4a (added 2026-09-30; moved 2026-11-08):*
  *Ruled by the owner 2026-11-09.* ADR-014's version below is the rule; the design was updated to match.
  The banner reads "2 check-ins couldn't be sent. Tap to see them." Each entry shows:
    Student: e.g. Mia R.
    Lesson: e.g. Tue 14 Oct, 4:00pm
    What was recorded: Checked in, or No-show
    When it was tapped, by the phone's clock: e.g. 4:12pm
    Why it wasn't sent: e.g. "The phone's time didn't match the lesson"
  Two actions: "Record on the website", which opens the coach website's lesson list at that date (see Coach lesson
  list), and "Done", which removes the entry once recorded.
  The list holds student names on a phone used at public rinks, so an entry leaves the phone when the coach taps
  Done, or after 7 days, whichever comes first (decided by the owner, 2026-09-30). A day before removal it is marked
  "Will be removed tomorrow."

The family had cancelled:
  After the replay, a lesson the family cancelled stays on Today in its place, struck through and marked
  Cancelled, with when the family cancelled. Nothing more to do.
  Why: the likely case is a parent who cancels at 3:50pm for a 4:00pm lesson while the coach is inside the rink with
  no signal; nobody appears, so at 4:15 the coach marks absent. The coach did the right thing with what they knew, so
  this isn't shown as a failure, which would blame them for a notification they couldn't have received. It is
  reported as what it is: "This lesson was cancelled by the family at 3:50pm, after you recorded it." The entry is
  then cleared rather than left for the coach to sort out.
  *(from ADR-014 §4; moved 2026-11-08)*

Logging out with check-ins still waiting:
  A warning says they're only on this phone and will be deleted. Choices: "Stay logged in" or
  "Log out and delete them".
