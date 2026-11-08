Coach Who Is Also a Parent
(Started 2026-10-22. Requirements are still being gathered. Decided so far: one account, 2026-10-23.)

The case: a coach also has a skater of their own, or skates themselves, and books lessons through BladeBook as a
family. Settled by the owner on 2026-10-22: this is a real case and it will be built. This page collects what is
already known, the questions that need answers, and the ways it could be built.

What the design says today:
  One email, one account. The login email is the username in Cognito, the sign-in service (ADR-016). Signing up
    as a family with an email that already has a coach account fails today.
  Two groups. A coach's account is in the Coach group and a family's account is in the Client group. Since
    2026-10-21 every coach page and route refuses an account without Coach, and every family page and route
    refuses one without Client, with a 403 (forbidden) error (ADR-023 d7).
  Separate data. A coach's records sit under COACH#<id> and a family's under CLIENT#<id> (ADR-021, ADR-022), so
    one person could hold both without the records mixing.
  Two websites. The coach website and the family website are separate sites with separate sign-ins, built from
    one source tree (ADR-001 A3).
  Two app clients (ADR-023 d9, 2026-10-22). Each website has its own Cognito app client, and each API refuses a
    token from the other website's. So even with one account in both groups, the coach signs in on each website
    separately, and each sign-in works only on its own side.
  MFA (multi-factor authentication, a code as well as the password) is offered to coaches, not required
    (owner, 2026-10-23). Families don't have it.
  Sessions: 60 minutes on both websites, 4 hours on the rinkside page (ADR-023 d6).

Questions for the owner:
  1. ~~One account or two? Should the coach use one email and password for both websites, or is a second account
     with a different email acceptable?~~
     *Decided by the owner, 2026-10-23: one account, way B below.* Coaches and families are older, so the route
     with fewer barriers wins: one email, one password. A second email and a second password are barriers.
  2. How does the coach move between the two sides? A "Switch to family" link, two separate
     sign-ins, or a choice after signing in?
  3. Which side is the default after sign-in?
  4. Can a coach book lessons with themselves for their own skater, or only with other coaches?
     If with themselves: does their skater go through the usual approval (ADR-022 d6), or is it approved
     automatically? Is the lesson priced and reminded like any other?
  5. ~~Can a family account later become a coach (a parent who starts coaching), as well as the other way round?~~
     *Decided by the owner, 2026-11-08: yes, same account.* The family signs in on the coach website (coach
     sign-up always offers this), POST /coach/add-coaching adds the Coach group to their own account, and the
     ordinary sign-up steps follow (ADR-016 d12).
  6. MFA: if the coach turned MFA on, does it also apply when they use the family side? (With one account, it
     would.)
  7. Emails: the coach gets the morning email and daily report at their login email; the family side sends
     confirmations and reminders to the same address. Is one inbox for both fine, or should the family emails
     go elsewhere?
  8. Deleting: if the coach closes their coach account, does the family side stay, and the other way round?
  9. Should other families or coaches ever see that a family is also a coach? (Assumed no.)

Questions for Kim (Kim list §13):
  How common is it for a coach to have a child who skates, or to take lessons themselves?
  Does their child usually take lessons with them, or with another coach?

Ways it could be built (B chosen 2026-10-23):
  A. ~~Two accounts, two emails. Nothing to build except a clear message when the email is already taken:
     "This email has a coach account. Use a different email for your family account." The coach keeps two
     logins.~~ *Not chosen: a second email and password are barriers for older users.*
  B. **Chosen.** One account in both groups. Family sign-up with an existing coach email asks the person to prove they own
     the account (sign in with the coach password and MFA) before adding the Client group. The account then has
     both a coach record and a family record. Needs: the "email already exists" handling done without revealing
     to strangers which emails have accounts; a way to switch sides; and a decision on question 6.
  C. ~~One person, two linked accounts. Separate Cognito accounts behind the scenes, joined so one sign-in can
     reach both. Most work; listed for completeness.~~ *Not chosen.*

What one account costs (to design before building):
  Proof of ownership at family sign-up: an existing coach email must sign in (password, and MFA if on) before
    the Client group is added. The code that adds a group is powerful and must be tested so it can never add a
    group to an account the person doesn't own.
  One password for both sides: a password stolen through family use also opens the coach side. MFA is the guard
    (question 6).
  Closing one side keeps the other: removing the coach side drops the Coach group and coach data but keeps the
    account and family data, and the reverse (question 8; docs/deletion needs these cases).
  A new email or password changes both sides at once; the screens that change them should say so.
  Every check is tested with a token that has both groups.
  Two sign-ins: with two app clients (ADR-023 d9) the coach signs in on each website, with the same email and
    password. That is still a barrier; see question 2.

Things to check:
  The "email already exists" message must not let someone test which emails belong to coaches.
  Group checks (ADR-023 d7) stay the gate: a token reaches the family routes only with the Client group, and the
    coach routes only with the Coach group.
  A coach's own skater must not appear differently to the coach from any other family's skater, unless the
    owner decides otherwise (question 4).
  Erasing one side's data (docs/deletion) must not touch the other side's.

Related: ADR-016 (coach sign-up, login email), ADR-022 (family isolation and approval), ADR-023 d7 (group checks),
ADR-025 (many coaches per skater), Client Sign Up, Coach Sign Up.
