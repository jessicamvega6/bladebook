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
    *Decided by the owner 2026-10-05:* where a photo would appear, including the family's code-entry screen, MVP shows
    the coach's initials in a circle. *(from ADR-016, amendment 2026-10-05 and decision 5, moved 2026-11-08)*
  Currency: read-only (USD or CAD). Every lesson is priced in it. Changing currency comes in Phase 2.
  Coach code: shown with Copy and "Rotate code". Rotating asks for confirmation, then gives the coach a new
    code (8 random characters, e.g. 7K2Q-M9XT; it never expires on its own, ADR-002). The old code stops working for new sign-ups; families already signed up aren't affected.
    The code is displayed on the coach website for the coach to hand out. *(from ADR-002 decision 2a, moved 2026-11-08)*

Business email:
  The reply address on every automatic email. Families' replies go here.
  A list of the coach's addresses; the coach picks one. The login email is always on the list.
  "Use a new address": a new address gets a confirmation link and can't be picked until it's confirmed,
    so a typo can't send every family's replies to a stranger. Families keep seeing the current address
    until then.
  Any address except the current one and the login email can be removed.
  *Decided by the owner 2026-10-13 (Harbor design):* on the profile, the coach keeps a list of addresses and picks one.
    "Use a new address" sends a link, and the address can't be picked until it's confirmed. Any address except the
    current one and the login email can be removed. *(from ADR-016, amendment 2026-10-13, moved 2026-11-08)*
  *2026-11-06 (owner):* changing the address on the profile is unchanged by the sign-up rule in Coach Sign Up: the
    current confirmed address stays in use until the new one is confirmed. *(from ADR-016, amendment 2026-11-06)*

Visibility & texts:
  What families can see, each with a switch: phone number, email address. Payment types are switched on
    one by one under Payments (ADR-016 d7, 2026-10-12).
  Only families the coach has approved see these, never someone who has only entered the coach code.
  Where, when switched on: a coach card on the client website's home page and at the top of the booking page, and
    the footer of client emails. Never in a text, and not on the rinkside app, which is the coach's own.
    *(from ADR-016 decision 7a, decided by the owner 2026-09-30, moved 2026-11-08)*
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
  *Decided by the owner 2026-10-12:* Cash is a fourth payment type, a yes/no the coach sets at sign-up or on the
    profile. Cash has no handle, so it's a switch rather than a field. *(from ADR-016, amendment 2026-10-12)*
  *Decided by the owner 2026-10-12, later:* one switch per payment type. Cash, Cash App, Venmo and PayPal each have
    their own on/off switch, set at sign-up and changed any time on the profile, all off by default. A type that has a
    handle needs it filled in before it can be switched on. A type switched on is a how-paid option and is shown to
    the coach's confirmed families wherever payment details are shown. Switching a type off removes it from both.
    This replaces "Show my payment handles". Example: a coach who signs up with Cash and Venmo, then adds PayPal and
    drops Venmo, switches PayPal on and Venmo off on the profile. Switching a type off keeps its handle, so switching
    it back on needs no retyping. Switching Cash App, Venmo or PayPal back on asks the coach to verify that the kept
    handle is still correct before it takes effect. Cash has no handle, so it switches straight back on.
    *(from ADR-016, amendment 2026-10-12, later, moved 2026-11-08)*

Account:
  Login email: read-only, marked verified. The coach signs in with it and gets the daily report and the morning email there.
  Password: "Change password" opens a form for the current and new password (handled by Cognito). The
    rinkside app stays signed in until its session runs out.
  Rinkside page: a note that it uses the same email and password ~~and can only see today's lessons~~ *and shows today's lessons,
    attendance and cancelling (owner, 2026-11-09, R9)*.
  Log out.
