# Spec: Text messages to families (Phase 2)

**Status:** Draft — 2026-11-16
**Sources:** ADR-007 (decisions 1–9, amendments 2026-09-30 and 2026-10-12, Open); ADR-006 decision 5
(notification state) and decision 6; ADR-009 decision 9 and Note 2026-10-12; ADR-020 decision 6 and
Note 2026-10-12; ADR-026 decision 5 and Note 2026-10-12; ADR-002 decision 4; ADR-MASTER §3, §13, §24;
`docs/architecture.md` §9 ("SMS is one segment") and §10 Phase 2+;
`FeatureDecriptions/SMS Messages.md`; `FeatureDecriptions/Client Sign Up` (step 2, "Text me reminders
too"); `FeatureDecriptions/ClientProfileView`; `FeatureDecriptions/cancelation.md` ("The cancellation
email"); `FeatureDecriptions/Re-pricing Booked Lessons.md` ("What the family is told");
`FeatureDecriptions/Email templates Needed:`; `docs/Open-Pending.md` §7
**Depends on:** Minimum Viable Product (MVP) emails to families (day-of reminder, payment reminder, cancellation and
re-price email, shared-lesson invitation); the MVP coach late-cancellation text, which already
builds the 160-character check, the GSM-7 (Global System for Mobile Communications 7-bit alphabet)
rules, the opt-out check and the opt-in confirmation path; 10-digit long code (10DLC) registration
of the sending number
**Out of scope:** the coach's own late-cancellation text (MVP, `smsCancellationAlerts`); alert texts to
the owner (ADR-010); the consent-link roster join's warning text (Phase 2, `FeatureDecriptions/Schedule
lesson split`); real delivery confirmation (see `delivery-confirmation.md`)

## Summary
In MVP every family gets email only. In Phase 2 a family can turn texts on for its phone number, and
then also gets a short text (SMS, short message service) beside the day-of reminder, the payment
reminder, the cancellation email, the shared-lesson invitation and the price-change email. Each text
is one 160-character message that says what happened and points to the email; the email stays the
full record and is always sent. Turning texts on sends one opt-in confirmation carrying the legal
wording.

## Assumed in every example
- Coach Dana Whitfield (first name "Dana", last name "Whitfield"), time zone America/New_York,
  currency US Dollar (USD), notice period (`requiredNoticeHours`) 24 hours, business email
  lessons@danawhitfieldskating.com.
- The Chen family: contact Grace Chen, `clientPhone` (205) 555-0196, one `CLIENT#<sub>/PROFILE`.
  Skaters Mia Chen and Leo Chen, both `ACTIVE` with Coach Dana.
- The Okafor family: contact Tom Okafor, skater Zoe Okafor, `ACTIVE` with Coach Dana, texts on.
- Now is Monday 2027-01-11, 10:00 AM in the coach's time zone.
- Texts are sent through Simple Notification Service (SNS); emails through Simple Email Service (SES).
- Every family text opens with the prefix `Dana Whitfield via BladeBook:`.

## 1. Turning texts on

**1.1 Ticking the box at sign-up turns texts on for the phone number**
- **Given** Grace is on sign-up step 2 with mobile phone (205) 555-0196
- **And** the "Text me reminders too" checkbox shows the SMS terms under it
- **When** Grace ticks "Text me reminders too" and selects "Create account"
- **Then** `smsOptIn = true` is stored on `CLIENT#<sub>/PROFILE`, beside `clientPhone`
- **And** the flag is copied to each of the family's `STUDENT#` records with every coach
*(source: ADR-007 d8a; ADR-002 d4; `FeatureDecriptions/Client Sign Up`, step 2; architecture.md §5 data model)*

**1.2 Turning texts on sends one opt-in confirmation to the phone**
- **Given** the Chen family's `smsOptIn` is false
- **When** `smsOptIn` changes from false to true
- **Then** one opt-in confirmation is sent to (205) 555-0196, opening
  `Dana Whitfield via BladeBook: You are subscribed to lesson alerts. Msg frequency varies...`
- **And** it states who is sending, how often, that message and data rates may apply, and to reply
  HELP for help or STOP to cancel, with the terms and privacy links
- **And** it may run to two segments, at most 306 GSM-7 characters
*(source: ADR-007 d8; `FeatureDecriptions/SMS Messages.md`, "Opt-in confirmation")*

**1.3 A family with two skaters gets one confirmation, not two**
- **Given** the Chen family has two skaters, Mia and Leo
- **When** Grace turns texts on
- **Then** exactly one opt-in confirmation is sent to (205) 555-0196
- **And** nothing is chosen per skater: texts about both Mia and Leo go to that phone
*(source: ADR-007 d8, d8a)*

**1.4 Turning texts on from the profile**
- **Given** Grace signed up without ticking the box, so `smsOptIn` is false
- **When** Grace turns on the "Text me reminders" switch on her profile and saves
- **Then** `smsOptIn = true` is stored on `CLIENT#<sub>/PROFILE` and copied to every coach's `STUDENT#`
  records for her skaters
- **And** the opt-in confirmation of 1.2 is sent
*(source: `FeatureDecriptions/ClientProfileView`; ADR-007 d8, d8a; ADR-MASTER §5, "Skaters and coaches")*

## 2. Which texts are sent

**2.1 Day-of reminder text**
- **Given** the Chen family has texts on
- **And** Mia has a 30-minute lesson with Coach Dana today, Monday 2027-01-11, at 4:00 PM
- **When** the ~7:00 AM day-of reminder job runs for 2027-01-11
- **Then** the family's day-of reminder email is sent
- **And** a text is sent to (205) 555-0196 following the template
  `<coach> via BladeBook: <student> has a lesson today at <time>.` with coach "Dana Whitfield",
  student "Mia" and the lesson's 4:00 PM start
*(source: `FeatureDecriptions/SMS Messages.md`, "Texts to families"; ADR-007 d6; architecture.md §6.2)*

**2.2 Payment reminder text states the amount and points to the email**
- **Given** the Chen family has texts on
- **And** Mia's private lesson on Monday 2027-01-11 costs $50.00
- **When** the coach records Mia as checked in (`CheckInRecorded`)
- **Then** the payment reminder email is sent with the amount and the coach's `paymentInstructions`
- **And** a text is sent following `<coach> via BladeBook: $<amount> due for <student>'s lesson on
  <date>. See email to pay.` with amount 50, student "Mia" and the lesson date
- **And** the text does not contain the coach's `paymentInstructions`
*(source: ADR-007 Status, d4, d6; `FeatureDecriptions/SMS Messages.md`, "Texts to families")*

**2.3 Payment reminder text for a shared lesson states the skater's share**
- **Given** Mia and Zoe share a $50.00 lesson, `shareCount = 2`
- **And** the Chen family has texts on
- **When** the coach records Mia as checked in
- **Then** the Chen family's payment text states $25 (Mia's share), not $50
*(source: `FeatureDecriptions/Email templates Needed:`, "Payment reminder" — "For a shared lesson the
amount is the skater's share"; ADR-MASTER §8, "Price shares")*

**2.4 Cancellation digest: one text per family per batch, with a count and date range**
- **Given** the Chen family has texts on
- **And** Mia has lessons with Coach Dana on Wednesday 2027-01-13, Thursday 2027-01-14 and Saturday
  2027-01-16
- **When** Coach Dana accepts "Cancel rest of week" for the week of 2027-01-10 to 2027-01-16
- **Then** the Chen family gets one email listing the three cancelled lessons with a link to book
  another time
- **And** one text following `<coach> via BladeBook: <n> of your lessons <from>-<to> were cancelled
  by your coach. See email.` with n = 3, from = Wednesday 2027-01-13 and to = Saturday 2027-01-16
- **And** the text lists no lessons
*(source: ADR-006 d6; `FeatureDecriptions/cancelation.md`, "The cancellation email"; `FeatureDecriptions/SMS
Messages.md`, "Texts to families"; ADR-MASTER §13, "Routing by actor")*

**2.5 A schedule change that cancels lessons sends the digest too**
- **Given** the Chen family has texts on
- **When** a schedule save by Coach Dana cancels two of Mia's lessons (`cancelledBy = SCHEDULE_CHANGE`)
- **Then** the family gets one schedule-change email and one text pointing to it
*(source: ADR-009 Note 2026-10-12 — "The SMS forms of the client-directed rows (`COACH`,
`SCHEDULE_CHANGE`) wait for Phase 2"; ADR-006 d6)*

**2.6 A price change sends a text pointing to the email**
- **Given** the Okafor family has texts on
- **When** a schedule save re-prices Zoe's three upcoming lessons from $60 to $50
- **Then** the family gets one email framed as good news and one text that points to it
- **And** the text holds no lesson list and no free text
*(source: `FeatureDecriptions/Re-pricing Booked Lessons.md`, "What the family is told"; ADR-020 d6;
`FeatureDecriptions/SMS Messages.md`, "Price changes". The wording is open.)*

**2.7 A shared-lesson invitation sends a text pointing to the email**
- **Given** the Okafor family has texts on
- **And** Grace has entered Zoe's share code while booking Mia's lesson on Wednesday 2027-01-13 at 4:00 PM
- **When** Grace's booking is saved with Zoe's invited seat (`INVITED`)
- **Then** `consumer-invite` emails the Okafor family the invitation
- **And** sends a text to their phone pointing to that email
*(source: ADR-026 d5 step 2 and Note 2026-10-12; ADR-MASTER §24. The wording is open.)*

**2.8 A family with texts off gets email only**
- **Given** the Chen family's `smsOptIn` is false
- **When** any of the events in 2.1–2.7 happens for Mia
- **Then** the email is sent and no text is sent
- **And** the notification lines record `channels = [EMAIL]`
*(source: ADR-007 d3; ADR-006 d5; architecture.md §9)*

## 3. What every text must be

**3.1 Over-length text is refused, not sent**
- **Given** a text whose filled-in template would be 161 GSM-7 characters after transliteration
- **When** the sender checks it before `sns:Publish`
- **Then** the text is not published
- **And** the email for the same event is still sent
*(source: ADR-007 d1, d2, d3)*

**3.2 Characters outside GSM-7 are transliterated before counting**
- **Given** a skater whose display name is "Zoë" and a template typed with a typographic apostrophe `’`
- **When** the text is built
- **Then** it is sent as "Zoe" and `'`, so the message stays in GSM-7 with a 160-character limit
- **And** each of `[ ] { } \ ~ ^ |` and `€` counts as two characters
*(source: ADR-007 d2)*

**3.3 A long coach name is shortened**
- **Given** a coach whose first and last name together are 26 characters
- **When** any family text is built
- **Then** the name in the prefix is cut to its 20-character budget, ending with a single `.`
*(source: ADR-007 d5, d5a)*

**3.4 A long skater name never pushes a text into a second segment**
- **Given** a skater named "Christopher-Alexander"
- **When** a payment reminder text with a three-figure amount is built
- **Then** the text is at most 160 characters (worst case 115 with a 20-character coach name)
*(source: ADR-007 d5, d6)*

**3.5 A number that texted STOP is not sent to**
- **Given** the Chen family has `smsOptIn = true`
- **And** Grace has replied STOP, so (205) 555-0196 is on the SNS opt-out list
- **When** Coach Dana cancels Mia's Wednesday 2027-01-13 lesson
- **Then** `CheckIfPhoneNumberIsOptedOut` is called before publishing and no text is published
- **And** the email is sent
- **And** the family's `CANCELLED#` line records `notificationStatus = SUPPRESSED`, not `FAILED`
- **And** `smsOptIn` is set to false on `CLIENT#<sub>/PROFILE` and copied to the family's `STUDENT#`
  records
*(source: ADR-007 d9; ADR-006 d5)*

**3.6 Both channels are recorded on the notification line**
- **Given** the Chen family has texts on and the number is not opted out
- **When** the notifier sends a cancellation email and text that SES and SNS both accept
- **Then** the family's `CANCELLED#` lines record `notificationStatus = SENT`, `notifiedAt` and
  `channels = [EMAIL, SMS]`
*(source: ADR-006 d5; ADR-MASTER §13, "Notification state")*

## 4. Rules that must always hold
- Every family always gets the email; a text is never the only place information exists. *(ADR-007 d3)*
- Every text except the opt-in confirmation is exactly one segment of at most 160 GSM-7 characters,
  checked in code before `sns:Publish`. *(ADR-007 d1, d2)*
- No user-authored free text appears in a text, `paymentInstructions` above all. Names are budgeted
  fields. *(ADR-007 d4, d5)*
- Every family text opens with `<Coach name> via BladeBook:`, the coach's first and last name, at most
  20 characters, transliterated to GSM-7. *(ADR-007 d5a)*
- Consent belongs to the phone number: `smsOptIn` lives on the family profile and is copied to each
  coach's `STUDENT#` records; nothing is chosen per skater. *(ADR-007 d8a)*
- One cancellation text per family per batch, never one per lesson. *(ADR-006 d6)*
- One length-and-encoding unit test per template at worst-case field values. *(ADR-007 d7)*
- The opt-out list is checked before every publish; a suppressed send is `SUPPRESSED`, distinct from
  `FAILED`. *(ADR-007 d9)*

## Open questions
1. **Wording of the price-change texts** (increase, decrease, and a batch mixing re-pricing with
   cancellations) and of the shared-lesson invitation text. Tracked: ADR-007 Open;
   `FeatureDecriptions/Re-pricing Booked Lessons.md`, "Open questions"; Open-Pending §7.
2. **Which other shared-lesson emails get a text** (joined, declined, withdrawn, "no longer
   available", "the other skater can't make it — keep or cancel", cancelled with no answer). Only the
   invitation is named (ADR-026 d5). The digest's wording "were cancelled by your coach" doesn't fit a
   `NO_ANSWER` batch.
3. **Day-of text after G-37.** The day-of email is now one per family per coach per day
   (ADR-MASTER §13), but the text template names one skater and one time. Is a family with Mia at
   4:00 PM and Leo at 5:00 PM sent one text or two, and what does a combined text say? (The day-of
   template also predates G-37: `docs/architecture.md` §9 still says "Reminders are per lesson".)
4. **Date and time format inside a text** (`<date>`, `<from>-<to>`, `<time>`), and each field's
   character budget. ADR-007 d5 requires budgets; none is written for these fields.
5. **Who sends the opt-in confirmation**: no function is named. Open-Pending §1 ("Who sends the SMS
   opt-in confirmation?"); ADR-MASTER §25.
6. **Re-opt-in and a changed phone number.** ADR-007 d8 sends the confirmation on every false → true
   change, while its Consequences call it "sent once per client for the life of the account". Does
   turning texts off and on again, or changing `clientPhone` while texts are on, send a new
   confirmation or need a new opt-in?
7. **The box's starting state.** The coach's text box starts unticked because "carriers do not accept
   pre-ticked consent" (`FeatureDecriptions/cancelation.md`); the family's box isn't stated, and the
   Harbor demo starts it ticked (`design/harbor/client/screens-account.js`, `sms: true`).
8. **The SMS terms under the box** say texts arrive "the morning of a lesson and when a lesson is
   cancelled", but payment, invitation and price-change texts are sent too. Reword?
9. **Does the carrier accept a single confirmation**, or is periodic re-disclosure needed? Answered by
   10DLC campaign vetting. ADR-007 Open; Open-Pending §7.
10. **`START`/`UNSTOP` asymmetry**: a family that texts START is re-subscribed at the carrier while
    `smsOptIn` stays false. Explain it in the UI? ADR-007 Open; Open-Pending §7.
11. **A family with texts on whose email bounces** gets only pointers to an email they can't read.
    ADR-007 Open; Open-Pending §7.
12. **Email switches and texts.** On the Phase 2 email templates page the coach can switch off the
    day-of and payment reminder emails (`FeatureDecriptions/C_Coach Email Templates.md`). Does that
    also stop the matching text?
13. **Separate topic for alert texts**: client texts and the owner's alert texts on their own topics
    and configuration sets. Open-Pending §10 (deferred to Phase 2).
