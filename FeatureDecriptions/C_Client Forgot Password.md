Client Forgot Password
(Written 2026-10-12 from the Harbor design: design/harbor/client/static/forgot-password.html
 and forgot-password-code.html)

Two steps on one page. Cognito sends the code and sets the new password.
*Decided by the owner 2026-11-09 (ADR-023 d11):* this is BladeBook's own page, not Cognito's hosted
sign-in page. The browser sends what is typed straight to Cognito; BladeBook's servers never see a password or a
code. "Email me a code" answers the same whether or not the email has an account.

Step 1, email a code:
  Email field: the email the family logs in with.
  "Email me a code" button: Cognito emails a 6-digit code to that address.
  Link back to log in.

Step 2, code and new password:
  Says which address the code was sent to, and that the code expires in an hour.
  Code: six boxes, one digit each.
  New password, with the password rules listed under it (at least 8 characters).
  "Set new password" button: sets the password and returns to log in with the message
    "Password changed. Log in with your new password."
  "Send a new code" link, and a link back to log in.

Help note beside the form: check spam for a message from BladeBook; the code goes to the email you log in with.
