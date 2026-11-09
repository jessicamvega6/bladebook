Coach Log In
(Written 2026-10-12 from the Harbor design: design/harbor/coach/static/login.html)

The page a coach uses to sign in to the coach website. Sign-in is handled by Cognito.
*Decided by the owner 2026-11-09:* opening the coach website's plain address (no page named after it) always shows
this page, signed out, even if a coach was signed in in that browser tab. It links to sign-up ("Create a coach
account"). A link to a page inside the site, or a refresh, keeps the sign-in. The family website does the same
(C_Client Log In.md).

Fields:
  Login email: the coach logs in with their login email, not their business email.
  Password

Links and buttons:
  Log in: signs the coach in and takes them to the Today dashboard (see Coach Dashboard on website.md).
  Forgot your password?: goes to the forgot password page (see C_Coach Forgot Password.md).
  "Create a coach account" link in the top bar: goes to coach sign-up (see Coach Sign Up).

Note under the button: after five wrong passwords, wait a few minutes before trying again.

"Checking in at the rink?" note beside the form: use the rinkside page on your phone — the link is at the top of your Today page and in your morning email. It signs in with
the same email and password ~~but can only see today's lessons~~ *and shows today's lessons, attendance and cancelling (owner, 2026-11-09, R9)* (see Coach App).

Messages shown above the fields:
  Success after a password reset: "Password changed. Log in with your new password."
  An error message when sign-in fails.
