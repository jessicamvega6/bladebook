# Spec: Cancellation history (Phase 2)

**Status:** Draft — 2026-11-16
**Sources:** ADR-MASTER §3 (Change batch, Cancellation line), §16, §18, §20, §24; ADR-006 decision 5 and
Open; ADR-021; ADR-022; `FeatureDecriptions/cancelation.md` ("All cancelations will be tracked …");
`docs/architecture.md` §5 data model (Cancellation batch, Cancelled lesson; access patterns 14 and 15)
and §6.6; `README.md` gap G-29; `docs/glossary.md` (`CHANGE_BATCH.cancelledBy`)
**Depends on:** Minimum Viable Product (MVP) cancellation (family per-lesson cancel, coach cancel of a lesson, day or week,
schedule-change cancellations, the hourly deadline sweep), which already writes every
`CHANGEBATCH#` header and `CANCELLED#` line this spec reads
**Out of scope:** late-cancellation and no-show **charges** and the fee fields on `CANCELLED#` lines
(the Phase 2 missed-lesson fee spec); distinct cancellation email templates by reason; the
cancellation emails themselves (MVP); deleting a skater's data on request (erasure)

## Summary
Every cancellation is already recorded in MVP, but no page lists one afterwards: the emails at the
time are the only record anyone sees (gap G-29). In Phase 2 the coach gets a view of the
cancellations in their own calendar after the fact, and each family gets a view of its own
cancellation history. Both read the same records: one `CHANGEBATCH#` header per cancelling action
and one `CANCELLED#` line per cancelled seat, which say who cancelled and which lesson times went.

## Assumed in every example
- Coach Dana Lee teaches in the America/New_York time zone; her notice period
  (`requiredNoticeHours`) is 24 hours; her currency is US Dollar (USD).
- The Rossi family (contact Laura Rossi, `clientRelationship = GUARDIAN`) has one skater, Mia Rossi
  (display name *"Mia R."*), `ACTIVE` with Coach Dana.
- The Chen family has one skater, Leo Chen (*"Leo C."*), `ACTIVE` with Coach Dana.
- Coach Sam Ortiz is a second coach; Mia is also `ACTIVE` with him.
- Now is Monday 2027-01-11, 10:00 AM in the coach's time zone.
- Mia had a private 30-minute lesson with Coach Dana on Tuesday 2027-01-12 at 4:00 PM, price $40.00.
  On Monday 2027-01-11 at 9:00 AM Laura cancelled it from My bookings, 31 hours before it started.
  That wrote one `CHANGEBATCH#` header with `cancelledBy = CLIENT` and one `CANCELLED#` line with
  `lessonDate = 2027-01-12`, `startTime = 16:00`, `durationMinutes = 30`, `priceMinor = 4000`,
  `studentId` (Mia's), `studentName = "Mia R."`, `clientId` (the Rossi family's),
  `cancelledAt = 2027-01-11T14:00Z`, `noticeHours = 31`, `executionStatus = EXECUTED`,
  `notificationStatus = SENT`.

## 1. The coach's view of cancellations

**1.1 A family's cancellation is listed afterwards**
- **Given** the Rossi family's cancellation above
- **When** Coach Dana opens her view of cancellations
- **Then** it lists Mia R.'s lesson on Tuesday 12 January at 4:00 PM, 30 minutes
- **And** it shows that the family cancelled it, and when (Monday 11 January, 9:00 AM)
*(source: ADR-MASTER §24, "The coach's view of cancellations after the fact (owner, 2026-11-12; gap
G-29)"; `FeatureDecriptions/cancelation.md`, "All cancelations will be tracked showing who canceled, and
if possible the time slots that were canceled"; ADR-MASTER §3, Cancellation line)*

**1.2 Who cancelled is shown for every kind of cancellation**
- **Given** Coach Dana's partition holds four `CHANGEBATCH#` headers, one for each value of
  `cancelledBy` below, each with one `EXECUTED` line
- **When** Coach Dana opens her view of cancellations
- **Then** each cancellation says who cancelled it:

| `cancelledBy` | Shown as cancelled by |
|---|---|
| `CLIENT` | the family |
| `COACH` | the coach |
| `SCHEDULE_CHANGE` | a schedule change (nobody cancelled the lesson directly) |
| `NO_ANSWER` | the hourly deadline sweep, because the staying family in a shared lesson didn't answer by the answer-by time |

*(source: `FeatureDecriptions/cancelation.md`, "All cancelations will be tracked showing who canceled";
`docs/glossary.md`, `CHANGE_BATCH.cancelledBy`; `docs/architecture.md` §6.6, "the same `CHANGEBATCH#`
and `CANCELLED#` records … tagged with `cancelledBy`")*

**1.3 One cancelling action is one entry, with every lesson it cancelled**
- **Given** on Friday 2027-01-08 Coach Dana cancelled her whole day of Saturday 2027-01-16, which
  had three booked lessons: Mia R. at 9:00 AM, Leo C. at 9:30 AM and Mia R. at 11:00 AM
- **And** that wrote one `CHANGEBATCH#` header with `cancelledBy = COACH` and `lessonCount = 3`,
  and three `CANCELLED#` lines
- **When** Coach Dana opens her view of cancellations
- **Then** the day's cancellation shows as one entry listing all three lessons with their times
*(source: ADR-006 decision 5, a batch and its lines; `docs/architecture.md` access patterns 14 and 15)*

**1.4 Newest first**
- **Given** Coach Dana has cancellation batches written on 2027-01-04, 2027-01-08 and 2027-01-11
- **When** Coach Dana opens her view of cancellations
- **Then** they are listed 2027-01-11, then 2027-01-08, then 2027-01-04
*(source: `docs/architecture.md` access pattern 14, "List a coach's cancellation batches, newest first")*

**1.5 Cancelled lessons from one series are shown as that series**
- **Given** Mia has a weekly series of 24 Monday lessons with Coach Dana, all with the same `recurrenceId`
- **And** Coach Dana cancelled 3 of those Mondays
- **When** Coach Dana opens her view of cancellations
- **Then** the 3 cancelled lessons are shown as part of Mia's Monday series, not as three unrelated lessons
*(source: ADR-006 decision 5, "`recurrenceId` on the line is what lets the coach see '3 of this client's
24 Mondays' rather than three unrelated losses")*

**1.6 A family that wasn't reached is shown**
- **Given** Coach Dana cancelled Leo C.'s lesson on Wednesday 2027-01-13 at 5:00 PM
- **And** its `CANCELLED#` line has `notificationStatus = FAILED` and a `failureReason`
- **When** Coach Dana opens her view of cancellations
- **Then** the line shows that the Chen family could not be told, so that Coach Dana can contact them
*(source: ADR-006 decision 5, "Notification state is not a boolean … the case that matters is failure …
because that is exactly when the coach has to pick up the phone"; "the coach reads it in the app")*

**1.7 "Sent" never claims delivery**
- **Given** the Rossi family's line has `notificationStatus = SENT`
- **When** Coach Dana opens her view of cancellations
- **Then** nothing on the line says the email was delivered or read
*(source: ADR-006 decision 5, "`SENT` means SES or SNS accepted the message. It does not mean delivered";
ADR-MASTER §24, real delivery confirmation is a separate Phase 2 item)*

**1.8 A coach sees only her own cancellations**
- **Given** the Rossi family's cancellation of Mia's lesson with Coach Dana
- **When** Coach Sam opens his view of cancellations
- **Then** it doesn't list Mia's cancelled lesson with Coach Dana
- **And** the database refuses any read Coach Sam's session makes of `COACH#<Dana's coachId>`
*(source: ADR-021; ADR-MASTER §16, `coach-tenant` policy, `dynamodb:LeadingKeys = COACH#${aws:PrincipalTag/coachId}`)*

**1.9 Opening the view is a logged personal-data read**
- **Given** the Rossi family's cancellation above
- **When** Coach Dana opens her view of cancellations
- **Then** the access log records Coach Dana as actor, her role, the identifiers of the `CANCELLED#`
  lines returned, the names of the personal-data fields returned (such as `studentName` and
  `clientId`), the operation, the time, the request ID and the source address
- **And** it records none of the values
*(source: ADR-012; ADR-MASTER §18, "Every read that returns personal data logs … Never the values")*

## 2. The family's cancellation history

**2.1 A family sees its own cancellation**
- **Given** the Rossi family's cancellation above
- **When** Laura opens the family's cancellation history
- **Then** it lists Mia R.'s lesson with Coach Dana on Tuesday 12 January at 4:00 PM, 30 minutes
- **And** it shows that the family cancelled it, on Monday 11 January at 9:00 AM
*(source: `FeatureDecriptions/cancelation.md`, "Does a family see their own cancellation history …
Settled 2026-10-12 by the owner: yes, in Phase 2"; ADR-MASTER §24)*

**2.2 A cancellation by the coach shows in the family's history**
- **Given** Coach Dana cancelled Mia's lesson on Thursday 2027-01-14 at 4:00 PM, writing a batch
  with `cancelledBy = COACH`
- **When** Laura opens the family's cancellation history
- **Then** it lists that lesson as cancelled by Coach Dana
*(source: `FeatureDecriptions/cancelation.md`, "All cancelations will be tracked showing who canceled")*

**2.3 Another family's cancellation is never shown**
- **Given** the Chen family cancelled Leo C.'s lesson on Wednesday 2027-01-13 at 5:00 PM, writing a
  `CANCELLED#` line whose `clientId` is the Chen family's
- **When** Laura opens the family's cancellation history
- **Then** Leo C.'s cancelled lesson is not listed
*(source: ADR-022, a family is held to its own records at the database; ADR-MASTER §16, the
`client-tenant` reads of a coach's partition are allowlisted and fail closed)*

**2.4 The family's read is logged**
- **Given** the Rossi family's cancellation above
- **When** Laura opens the family's cancellation history
- **Then** the access log records the read, with the record identifiers, the names of the
  personal-data fields returned, and `clientRelationship = GUARDIAN`
- **And** it records none of the values
*(source: ADR-MASTER §18, "Family reads are logged with `clientRelationship`")*

## 3. Rules that must always hold

- **Both views read the records MVP already writes.** One `CHANGEBATCH#` header per cancelling
  action and one `CANCELLED#` line per cancelled seat, whoever cancelled; a single-lesson cancel is
  a batch of one. *(ADR-006 decision 5; `docs/architecture.md` §6.6)*
- **A coach reads only her own partition, and a family only what its allowlist and its own records
  give it.** *(ADR-021; ADR-022; ADR-MASTER §16)*
- **Every read that returns a name is logged, never the values.** *(ADR-012; ADR-MASTER §18)*
- **Cancellation lines don't live forever.** Each non-chargeable `CANCELLED#` line gets `expiresAt`
  when written, from the cancellation window, and the header is kept no earlier than its latest
  line. *(ADR-MASTER §20)*

## Open questions

1. **How does a family read its cancellation lines?** `CANCELLED#` lines are in the coach's
   partition and aren't on GSI1, and the `client-tenant` allowlist covers schedule items, public
   profile fields, availability fields, the family's own seat and `studentStatus` only. Reading
   lines needs an allowlist addition and gate-test rows, or another read path.
   (ADR-MASTER §16; §25, "The family read allowlist")
2. **Where each view lives and what it says:** the coach's (Lessons page, week view or its own
   page) and the family's (My bookings, Payments or its own page); labels and wording. Nothing is
   drawn yet. (G-29; ADR-006 Consequences)
3. **Which lines are shown:** `SKIPPED` lines (`BOOKING_GONE`, `NO_LONGER_NEEDED`, `LESSON_PASSED`),
   lines still `PLANNED`, `REPRICED#` lines in the same batch, and ended invitations (`SEATEND#`).
4. **What each entry shows beyond who and when:** the price, `noticeHours`, whether it was late,
   and, once charges ship, the fee (left to the Phase 2 missed-lesson fee spec). (ADR-MASTER §25,
   "What the Phase 2 fee is charged against")
5. **How long cancellation records are kept**, and whether the history says older ones are archived
   and can be requested, as other history screens do. Deferred pending whether coaches need them
   for tax. (ADR-006 Open, "Retention of cancellation records"; ADR-009 Open; `docs/architecture.md`
   "Retention of cancellation records"; ADR-MASTER §20 legal review)
6. **Can a coach clear her cancellation history?** Not specified. (ADR-006 Open)
7. **Range and paging:** is the coach's view bounded by a date range, like the payment dashboard,
   or paged newest first?
8. **A family with several coaches:** is the family's history grouped by coach, and is a coach the
   family is still waiting for left out (as `linkStatus` would require)? (ADR-025 d3)
9. **Shared lessons:** does the staying family see that the other family cancelled (a line with the
   other family's `clientId`), beyond the pending-leave question MVP already shows?
