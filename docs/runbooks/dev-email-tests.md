# Dev email tests

Every email BladeBook sends, when it's sent, and what sends it, as a checklist for trying each one in dev. Written
2026-11-23 from `design/harbor/email/templates.mjs` (what each email is for), `infra/lib/consumers.ts` and
`infra/lib/jobs.ts` (what sends it), and the backend code that calls each template.

## Before you start

- Every email comes from `lessons@dev.bladebook.org`, except the Cognito code, which comes from Cognito's own sender.
- Dev is in the SES (Simple Email Service) sandbox, so SES delivers **only to the test mailbox's domain**. Use the
  seeded test accounts (`bladebook+dev-coach-…`, `bladebook+dev-client-…`); any other address is refused. See
  [`infra/README.md`](../../infra/README.md), "The owner's test mailbox".
- The sandbox allows 200 emails a day, 1 a second.
- The scheduled jobs run on Central time (`America/Chicago`, `LAUNCH_TZ` in `infra/lib/jobs.ts`).
- If an email doesn't arrive, look at the CloudWatch logs of the function in its "Sent by" column. A
  `MessageRejectedException` means SES refused it, which in the sandbox usually means the recipient wasn't on a
  verified domain. No log entry at all means the event never fired.

Mark the last column ✅ once the email arrives and reads right.

## To families

| Email | When it's sent | Sent by | Tested |
|---|---|---|---|
| Booking confirmation | A family books one or more lessons. One email per family per booking, listing every lesson booked. | `consumer-booking-confirmation`, when a seat becomes `BOOKED` | ☐ |
| Day-of reminder | About 7:00 AM on a lesson day. One email per family per coach, listing that day's lessons. | `sched-day-reminder`, daily at 7:00 | ☐ |
| Payment reminder | After a lesson is checked in. Not sent if the lesson is already paid or waived. | `consumer-payment-reminder`, when a seat becomes `CHECKED_IN` | ☐ |
| Lesson cancelled by the coach | The coach cancels one lesson. | `consumer-change-notifier` | ☐ |
| Schedule change | A coach's schedule save, time off, or "Cancel this day / rest of week" cancels or re-prices a family's lessons. One email per family per save. If everything in it is a cancellation, it's worded as a cancel. | `consumer-change-notifier` | ☐ |
| Sign-up declined | The coach declines a new skater. | `consumer-student-link` | ☐ |
| Skater approved ⚠️ | *Designed for:* the coach approves a skater. **Not sent: no code sends it yet** (see below). | (none) | n/a |
| Skater removed ⚠️ | *Designed for:* the coach removes a skater and upcoming lessons are cancelled. **Not sent: no code sends it yet** (see below). | (none) | n/a |

## Shared lessons (between families)

| Email | When it's sent | Sent by | Tested |
|---|---|---|---|
| Invitation to share a lesson | To the invited family, when another family enters their skater's share code or invites them onto a freed place. One email per invitation, listing every date. | `consumer-invite` | ☐ |
| Shared lesson joined | To both families when the invited skater joins, worded for each side. | `consumer-invite` | ☐ |
| Invitation declined | To the inviting family, when the invited family declines. | `consumer-invite` | ☐ |
| Invitation withdrawn | To the invited family, when the inviting family withdraws. | `consumer-invite` | ☐ |
| No longer available | To the invited family, when the invitation reaches the lesson's start unanswered, or when they try to accept and the lesson is gone or their skater is no longer the coach's student. | `consumer-invite` | ☐ |
| The other skater can't make it | To the family who stays, when the other skater leaves before the notice period. The lesson becomes private at full price, and the staying family keeps it or cancels with no charge. If they don't answer, they keep it. | `consumer-change-notifier` | ☐ |
| Shared lesson dates cancelled | To the family who stays, when they choose "Cancel all remaining dates". The coach isn't emailed. | `consumer-change-notifier` | ☐ |

## To coaches

| Email | When it's sent | Sent by | Tested |
|---|---|---|---|
| Morning email | About 7:00 AM on days the coach has lessons, listing them. | `sched-day-reminder`, daily at 7:00 | ☐ |
| A family cancelled late | A family cancels inside the coach's notice period. One email per cancellation, listing every late lesson. Cancellations outside the notice period send nothing. | `consumer-change-notifier` | ☐ |
| Unpaid lessons | Monday at 8:00 AM: every past lesson unpaid for more than 7 days. Repeats weekly until each lesson is marked paid or waived. | `sched-unpaid-reminder`, Mondays at 8:00 | ☐ |
| Lessons that passed before they could be cancelled | A stuck schedule change finishes after some of its lessons' times have already gone by. | `consumer-change-notifier` | ☐ |
| Confirm your business email | To the coach's new business email, at sign-up or when it's changed in Profile. From "BladeBook" with no reply-to. | `api-coach`, directly when the coach saves | ☐ |

## From Cognito (not SES)

| Email | When it's sent | Tested |
|---|---|---|
| Verification code | Sign-up (families and coaches), forgot password, and a family changing their email. One generic message for all three. | ☐ |

## Not sent yet

`skater-approved` and `skater-removed` have finished templates in `design/harbor/email/templates.mjs`, and both are
stored in SES. But no backend code sends either one, and neither is in the templates `consumer-student-link` may
send (it has only `signup-declined`, `infra/lib/consumers.ts`). Approving a skater updates the link and sends no
email. No ruling was found saying this is deliberate.
