Coach Forgot Password
(Written 2026-10-12 from the Harbor design: design/harbor/coach/static/forgot-password.html
 and forgot-password-code.html)

Two steps on one page. Cognito sends the code and sets the new password (ADR-016 d3).
*Decided by the owner 2026-11-09 (ADR-023 d11):* this is BladeBook's own page, not Cognito's hosted
sign-in page. The browser sends what is typed straight to Cognito; BladeBook's servers never see a password or a
code. "Email me a code" answers the same whether or not the email has an account.

Step 1, email a code:
  Login email field.
  "Email me a code" button: Cognito emails a 6-digit code to the login email.
  Link back to log in.

Step 2, code and new password:
  Says which address the code was sent to, and that the code expires in an hour.
  Code: six boxes, one digit each.
  New password, with the password rules listed under it (at least 8 characters).
  "Set new password" button: sets the password and returns to log in with the message
    "Password changed. Log in with your new password."
  "Send a new code" link, and a link back to log in.

Help note beside the form: check spam for a message from BladeBook. The code goes to the login email,
not the business email.
