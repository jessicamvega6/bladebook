Client Log In
(Written 2026-10-12 from the Harbor design: design/harbor/client/static/login.html)

The page a family uses to sign in to the client website. Sign-in is handled by Cognito.
*Decided by the owner 2026-11-09:* opening the family website's plain address (no page named after it) always
shows this page, signed out, even if a family was signed in in that browser tab. It links to sign-up. A link to a
page inside the site, or a refresh, keeps the sign-in.

Fields:
  Email: the email the family logs in with.
  Password

Links and buttons:
  Log in: signs the family in and takes them to Home (see ClientHomeView).
  Forgot your password?: goes to the forgot password page (see C_Client Forgot Password.md).
  "First time here?" note beside the form: a family needs a code from their coach to sign up,
  with a link to sign up with a coach code (see Client Sign Up).

After a password reset, the page shows a success message: "Password changed. Log in with your new password."

A family whose skaters are still waiting for the coach's approval can log in, but only sees Home
and Profile (ADR-022 d6). See ClientHomeView.
