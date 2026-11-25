# Spec: Real delivery confirmation (Phase 2)

**Status:** Draft — 2026-11-16
**Sources:** ADR-006 decision 5 (notification state) and Open; ADR-007 decision 9 and Open; ADR-010
decision 4 (alerts); ADR-MASTER §3 (Cancellation line, Re-price line, enumerations), §13 ("Notification
state"), §19 ("Alarms"), §24; `docs/architecture.md` §9 and §10 Phase 2+; `docs/Open-Pending.md` §7
("Real delivery confirmation") and §9 ("What happens to a hard-bounced address?", SES event destinations,
SNS delivery status logging); `docs/monitoring-questions.md` §3; `docs/glossary.md`
(`CANCELLED_LESSON.notificationStatus`)
**Depends on:** Minimum Viable Product (MVP) notification state on `CANCELLED#` and `REPRICED#` lines; MVP verified email sign-up and
email change; SES account-level suppression list (MVP)
**Out of scope:** the alarms on bounce and complaint rate (MVP, ADR-010); texts to families (see
`family-sms.md`); the coach's and family's cancellation history pages (Phase 2, separate spec)

## Summary
In MVP, `notificationStatus = SENT` on a cancellation or re-price line means only that Simple Email Service
(SES), or Simple Notification Service (SNS) for a text, accepted the message: not that it was delivered or
read. Phase 2 adds real delivery confirmation from SES event destinations (bounces, complaints, deliveries).
The one product rule decided so far is a bounce flag on the family's profile: the family is asked to update
the address at login and the coach sees an "email not working" marker on the roster. Most of the rest is
open.

## Assumed in every example
- Coach Dana Whitfield.
- The Chen family: contact Grace Chen, email grace.chen@example.com, skater Mia Chen, `ACTIVE` with
  Coach Dana.
- Now is Monday 2027-01-11, 10:00 AM in the coach's time zone.

## 1. What "sent" means

**1.1 SENT means accepted, not delivered**
- **Given** Coach Dana cancels Mia's Wednesday 2027-01-13 4:00 PM lesson
- **When** SES accepts the Chen family's cancellation email
- **Then** the family's `CANCELLED#` line records `notificationStatus = SENT`, `notifiedAt` and
  `channels = [EMAIL]`
- **And** `SENT` says nothing about whether the email reached Grace's inbox
*(source: ADR-006 d5; `docs/glossary.md`, `CANCELLED_LESSON.notificationStatus`; architecture.md §9)*

**1.2 FAILED and SUPPRESSED stay distinct**
- **Given** the notifier tried a text to a number that has texted STOP
- **When** the opt-out check finds the number opted out
- **Then** the line records `SUPPRESSED`, not `FAILED`: "we were not permitted to try", not "we tried and
  could not reach them"
*(source: ADR-006 d5; ADR-007 d9)*

## 2. A bounced family email

**2.1 A bounce marks the family's email as not working**
- **Given** grace.chen@example.com has stopped accepting mail
- **When** SES reports a bounce for an email sent to it
- **Then** a bounce flag is set on the Chen family's profile
*(source: Open-Pending §9, "What happens to a hard-bounced address?" — settled by the owner 2026-10-12,
"Phase 2: a bounce flag on the family's profile, set from the SES bounce event")*

**2.2 The family is asked to update the address at login**
- **Given** the Chen family's profile carries the bounce flag
- **When** Grace logs in
- **Then** she sees "We couldn't deliver email to grace.chen@example.com. Please update it"
*(source: Open-Pending §9, settled 2026-10-12)*

**2.3 The coach sees a marker on the roster**
- **Given** the Chen family's profile carries the bounce flag
- **When** Coach Dana opens her Students roster
- **Then** Mia's row shows an "email not working" marker
*(source: Open-Pending §9, settled 2026-10-12)*

**2.4 Changing the email clears the flag**
- **Given** the Chen family's profile carries the bounce flag
- **When** Grace's change to grace.chen@newmail.example is verified with its code
- **Then** the bounce flag is cleared and the login message and roster marker are gone
*(source: Open-Pending §9, settled 2026-10-12 — "It clears when the email changes"; `FeatureDecriptions/
ClientProfileView`, change-email code)*

**2.5 A dead address is not mailed again**
- **Given** grace.chen@example.com has hard-bounced
- **When** the next reminder to the Chen family is sent
- **Then** SES's account-level suppression list stops the send, protecting the account's bounce rate
*(source: Open-Pending §9, settled 2026-10-12 — "MVP: rely on SES's account-level suppression list"; this
stays in place under the Phase 2 flag)*

## 3. Rules that must always hold
- Every family always gets email; texts only point to it. *(ADR-007 d3)*
- `notificationStatus` is recorded per line even though the message is one per family per batch, because
  the coach's question is "was this family told about this lesson?" *(ADR-006 d6; glossary)*
- Alerts about SES (bounce rate near 5%, complaint rate near 0.1%) go to the owner's phone by SNS, never
  by email. *(ADR-010 d4; ADR-MASTER §19)*

## Open questions
1. **New values for `notificationStatus`.** Does a delivery event move a line from `SENT` to a new
   value (e.g. delivered), and does a bounce turn `SENT` into `FAILED` with a `failureReason`? Open-Pending §7
   ("Pending decision: Real delivery confirmation"); ADR-006 Open.
2. **Which events to subscribe to** (bounce, complaint, delivery, and possibly open or click) and **which
   function** receives them: a new function, with its own role, changes the function count.
3. **Complaints.** What happens when a family marks a BladeBook email as spam: flag, stop sending, tell the
   coach? Only bounces have a decided rule.
4. **Soft versus hard bounces.** Does a temporary bounce (a full mailbox) set the flag too?
5. **Which family emails count.** Only messages with a line to stamp (cancellations, re-prices) have a
   `notificationStatus`; how does a bounce on a day-of or payment reminder reach the flag and any record?
6. **Several coaches.** The flag lives on the family's profile; is it copied to every coach's `STUDENT#`
   record (as `consumer-family-sync` copies contact details) so each roster shows the marker?
7. **Exact field name** for the flag, and the exact wording and placement of the login message and
   roster marker (Harbor has no design for them).
8. **The coach's own address.** A bounce on the coach's login email (morning email, unpaid reminder) or
   business email: no rule.
9. **Texts.** SNS SMS delivery status logging is a to-do (Open-Pending §9); does a failed text delivery
   change the line's status or the family's `smsOptIn`?
10. **A family with texts on whose email bounces** gets only pointers to an unreadable email. ADR-007 Open;
    Open-Pending §7.
11. **When the event destinations are configured.** Open-Pending §9 lists "Configure SES event destinations
    for bounce, complaint and delivery" as a to-do for the bounce and complaint alarms, while ADR-MASTER §24
    and architecture.md §10 put "SES event destinations" under Phase 2. Is the plumbing MVP with only the
    product behaviour in Phase 2?
12. **Where the coach sees delivery state**: on the Phase 2 cancellation history (gap G-29), or elsewhere?
