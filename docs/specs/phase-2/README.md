# Phase 2 specs

Drafted 2026-11-16 from the Phase 2 list in `docs/adr/ADR-MASTER.md` §24 and
`docs/architecture.md` §10. The shape and writing rules are in `docs/specs/README.md`.

Not covered yet: the platform items (erasure on request, coach-selectable themes, coach profile
photos, Skate Canada and Hockey Canada numbers, the scheduled canary), and in-app payments,
waitlists, packages and coach analytics, which are not designed.

**Readiness** says how much of a spec is decided:
- **Ready**: the behaviour is decided, and the open questions are details.
- **Blocked**: decided, but one named question must be answered before building.
- **Mostly open**: only a few rules are decided. The spec is mainly a list of questions.

## Money

| Spec | Scenarios | Open questions | Readiness |
|---|---|---|---|
| [missed-lesson-fee](missed-lesson-fee.md) | 34 | 12 | Blocked: what a no-show owes, and "may" or "will" with the amount |
| [notice-period-editing](notice-period-editing.md) | 13 | 5 | Blocked: the bounds on the notice period |
| [personal-prices](personal-prices.md) | 8 | 7 | Mostly open: the shape of a personal price |
| [manual-payment-reminder](manual-payment-reminder.md) | 7 | 8 | Ready, apart from the rate limit's value |
| [financial-page-phase-2](financial-page-phase-2.md) | 10 | 8 | Ready, except rink fees (the calculation is undecided) |
| [currency-change](currency-change.md) | 7 | 8 | Mostly open |

## Messages

| Spec | Scenarios | Open questions | Readiness |
|---|---|---|---|
| [family-sms](family-sms.md) | 18 | 13 | Ready, apart from template wording and who sends the opt-in confirmation |
| [approval-email](approval-email.md) | 5 | 6 | Ready |
| [just-booked-email](just-booked-email.md) | 6 | 7 | Blocked: how the notifier recognises a "just booked" seat |
| [cancellation-reasons](cancellation-reasons.md) | 2 | 10 | Mostly open |
| [end-of-day-report](end-of-day-report.md) | 9 | 9 | Ready, apart from the guard against a second email |
| [morning-email-switch](morning-email-switch.md) | 6 | 5 | Ready |
| [coach-cancel-ends-invitation](coach-cancel-ends-invitation.md) | 6 | 8 | Blocked: the `seatOutcome` value, and which function sends the email |
| [delivery-confirmation](delivery-confirmation.md) | 7 | 12 | Mostly open |

## Views

| Spec | Scenarios | Open questions | Readiness |
|---|---|---|---|
| [cancellation-history](cancellation-history.md) | 13 | 9 | Blocked: families have no read path to `CANCELLED#` lines |
| [family-unpaid-history](family-unpaid-history.md) | 15 | 7 | Ready |
| [also-coached-by](also-coached-by.md) | 14 | 7 | Blocked: whether it ships at all (Kim's list §10, question 5) |
| [removing-a-skater](removing-a-skater.md) | 6 | 11 | Mostly open (blocker #17, Open-Pending §8) |
| [rink-number-download](rink-number-download.md) | 6 | 10 | Mostly open |

## Scheduling

| Spec | Scenarios | Open questions | Readiness |
|---|---|---|---|
| [coach-books-for-family](coach-books-for-family.md) | 6 | 10 | Blocked: whether it's held to the 3-month window |
| [recurrence-extension](recurrence-extension.md) | 4 | 10 | Mostly open |
| [saved-schedule-templates](saved-schedule-templates.md) | 3 | 8 | Mostly open |
| [rink-selection](rink-selection.md) | 11 | 7 | Ready, apart from rinks with no ice-type list |
| [family-cancel-from-week-view](family-cancel-from-week-view.md) | 14 | 5 | Blocked: families no longer have a week view (see below) |
| [shared-lesson-roster-join](shared-lesson-roster-join.md) | 22 | 8 | Blocked: gap G16, a stranger reaching a family through a share code |

**Total:** 252 scenarios and 210 open questions across 25 specs.

## Where the sources disagree

These came up while the specs were being written. Each spec follows the newest ruling it could
find, and lists the disagreement under its open questions.

1. **What a no-show owes.** `ADR-018:66-67` and `architecture.md:955-958` say the missed-lesson
   fee. Elsewhere it's the skater's share of the price, with the fee "an extra charge"
   (`ADR-018:70`).
2. **Booked lessons after a notice-period change.** `cancelation.md:274` says they keep their
   notice period. `Re-pricing Booked Lessons.md:57` and `Open-Pending.md:433` say it's
   undecided.
3. **A definite fee in confirmations.** `ADR-MASTER.md:1751-1752` lists it as Phase 2 scope.
   `cancelation.md:289-290` says it's decided later.
4. **Day-of reminders.** `architecture.md:2559` says one per lesson. `ADR-MASTER.md:1152` and
   `ADR-002:250` say one per family per coach per day (G-37).
5. **The text opt-in confirmation.** `ADR-007:180` sends it on every change from off to on.
   `ADR-007:242` says once per family for the life of the account.
6. **"Just booked" wording.** `cancelation.md:196` and
   `design/harbor/coach/screens-money-profile.js:381` word the email differently.
7. **SES (Simple Email Service) event destinations.** `Open-Pending.md:671` lists them as an
   MVP task for the alarms. `ADR-MASTER.md:1789` and `architecture.md:2708` put them in Phase 2.
8. **`endedBy` = coach.** `glossary.md:334` ties it to the coach declining an invited skater.
   `ADR-MASTER.md:1754` ties it to the coach's cancel.
9. **The family's text box at sign-up.** It must start unticked (carriers reject pre-ticked
   consent), but the Harbor family sign-up demo starts ticked
   (`design/harbor/client/screens-account.js:11`).
10. **Unpaid history for families.** `Open-Pending.md:313` still asks whether families see it.
    `ADR-MASTER.md:1763` and `C_Client Payments.md:27` say yes, in Phase 2.
11. **A coach's view of cancellations.** `ADR-006:539` and `:688` describe one in MVP.
    `README.md:119` (G-29) and `ADR-MASTER.md:1762` say no page lists them until Phase 2.
12. **Learn to Skate USA numbers.** `Open-Pending.md:287` says digits only. `ADR-MASTER.md:409`
    says letters and digits, 1 to 20 characters.
13. **`consumer-student-link`'s permissions** (`ADR-MASTER.md:146`) don't include the read that
    "Also coached by" needs, though ADR-025 decision 4 says the function already has it.
14. **Share codes.** They "never change" (`ADR-026:91`, `:285`; `ClientProfileView:29-30`), but
    the suggested fix for G16 is rotatable share codes (`ADR-033:203`, `Open-Pending:202`).
15. **The family's week view.** `cancelation.md:107`, `architecture.md:2616` and `Bookings::46`
    give families a week view. Since 2026-11-11 they have only a day view with a week strip
    (`Bookings::50`).
16. **Shared-lesson invitation emails.** One email per invitation listing every date
    (`Schedule lesson split:59`, G-38), against a Phase 2 warning sent for each lesson in the
    same file.
17. **Citation.** `architecture.md:2666` and `ADR-031:191` cite ADR-009 for a coach booking for
    a family, but ADR-009 doesn't mention it. Only `cancelation.md:217` does.
