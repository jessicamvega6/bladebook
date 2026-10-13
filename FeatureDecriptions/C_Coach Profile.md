Coach Profile
(Written 2026-10-12 from the Harbor design: design/harbor/coach/static/profile-details.html,
 profile-email.html, profile-visibility.html, profile-payments.html and profile-account.html)

How families see and reach the coach, and how the coach signs in. Five tabs, each with its own Save
button (Account has Log out instead). Coach Dashboard on website.md has the original short description.

Details:
  First name and last name: shown on the booking page and in every email families get.
  Phone: families see it only if it's switched on under Visibility.
  Time zone: used for lesson times and the daily report.
  Profile photo (optional): JPG or PNG, up to 2 MB, with Upload, Change and Remove. Families see it after
    they enter the coach code. *Profile photo is Phase 2 (ADR-016 d5); MVP shows initials.*
  Currency: read-only (USD or CAD). Every lesson is priced in it. Changing currency comes in Phase 2.
  Coach code: shown with Copy and "Rotate code". Rotating asks for confirmation, then gives the coach a new
    code. The old code stops working for new sign-ups; families already signed up aren't affected.

Business email:
  The reply address on every automatic email. Families' replies go here.
  A list of the coach's addresses; the coach picks one. The login email is always on the list.
  "Use a new address": a new address gets a confirmation link and can't be picked until it's confirmed,
    so a typo can't send every family's replies to a stranger. Families keep seeing the current address
    until then.
  Any address except the current one and the login email can be removed.

Visibility & texts:
  What families can see, each with a switch: phone number, email address. Payment types are switched on
    one by one under Payments (ADR-016 d7, 2026-10-12).
  Only families the coach has approved see these, never someone who has only entered the coach code.
  Payment instructions always appear in payment reminder emails, and replies always reach the business
    email, whichever switches are on.
  "Text me when a family cancels late": an SMS to the coach's phone, with an example message. The coach gets an
    email when a family cancels inside the notice period (ADR-009 d9); the text is extra.

Payments:
  How families pay you: free text, always included in payment reminders. BladeBook doesn't take payments.
  Payment types, each with its own on/off switch: Cash, Cash App, Venmo and PayPal. All off by default.
    (ADR-016 d7, 2026-10-12)
    Cash App, Venmo and PayPal each need their handle filled in before they can be switched on.
    A type switched on is a "how the client paid" option on the Payments page
      (see Coach Payment Section on Dashboard.md) and is shown to approved families.
    Switching a type off keeps its handle. Switching Cash App, Venmo or PayPal back on shows the kept
      handle and asks the coach to verify it's still correct. Cash switches straight back on.
    Past lessons keep how they were paid.

Account:
  Login email: read-only, marked verified. The coach signs in with it and gets the daily report there.
  Password: "Change password" opens a form for the current and new password (handled by Cognito). The
    rinkside app stays signed in until its session runs out.
  Rinkside app: a note that it uses the same email and password and can only see today's lessons.
  Log out.
