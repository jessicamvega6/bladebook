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

Today's lessons haven't loaded:
  If the app is opened with no signal before today's lessons were ever loaded, it says so and asks the coach
  to open it once with signal before leaving for the rink. A "Try again" button retries.

Couldn't be sent:
  When signal returns, saved check-ins are sent. The server can turn one down, e.g. the family cancelled
  while the phone had no signal (ADR-014 d4a).
  Today shows a banner "N check-ins couldn't be sent" linking to the Not sent page.
  The Not sent page lists each one: the skater, the lesson, what was recorded and when, and the reason.
  Each has a Dismiss button. They're kept so nothing is lost silently.
  With nothing on it: "Everything was sent", with a button back to today.

The family had cancelled:
  After the replay, a lesson the family cancelled stays on Today in its place, struck through and marked
  Cancelled, with when the family cancelled. Nothing more to do.

Logging out with check-ins still waiting:
  A warning says they're only on this phone and will be deleted. Choices: "Stay logged in" or
  "Log out and delete them".
