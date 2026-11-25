# Spec: "Just booked" email (Phase 2)

**Status:** Draft — 2026-11-16
**Sources:** ADR-006 Status (amendments 2026-10-08 and 2026-10-09); ADR-008 Status (same dates);
ADR-020 Status (same dates); ADR-031 decision 11; ADR-MASTER §9 ("One evaluator", "The preview"),
§10 ("General"), §13, §24; `FeatureDecriptions/Schedule Creater.md` ("A family books during the
review"); `FeatureDecriptions/cancelation.md` ("A booking made between the coach's preview and save");
`FeatureDecriptions/Email templates Needed:`; `FeatureDecriptions/C_Coach Email Templates.md`;
`docs/Open-Pending.md` §4
**Depends on:** Minimum Viable Product (MVP) schedule editor preview and save; MVP change batches and the change notifier's
cancellation email
**Out of scope:** holding times while the coach reviews (option D, not built); the ordinary
schedule-change email (MVP)

## Summary
A family can book a lesson time after the coach has seen the schedule review page but before the coach
accepts it. The save goes ahead without asking the coach again, and a booking made since the preview that
the change cancels is cancelled like the rest. In MVP that family gets the ordinary cancellation email.
In Phase 2 it gets a separate "just booked" email instead, explaining that the coach updated their
schedule just as they booked, with a link to other open times.

## Assumed in every example
- Coach Dana Whitfield, business email lessons@danawhitfieldskating.com.
- The Chen family: contact Grace Chen, skater Mia Chen, `ACTIVE` with Coach Dana.
- Coach Dana's weekly schedule offers Monday 6:00 AM lessons.
- At 9:00 AM on Monday 2027-01-11 Coach Dana opens the review page for a weekly-schedule change that
  removes the Monday 6:00 AM time from Monday 2027-01-18 on. The review page shows no booked lesson
  at that time on 2027-01-18.

## 1. A booking lands between the preview and the save

**1.1 The save goes ahead without asking the coach**
- **Given** at 9:02 AM Grace books Mia into Monday 2027-01-18 at 6:00 AM, so a `SEAT#` is `BOOKED`
- **When** Coach Dana accepts the change at 9:05 AM
- **Then** the save is not stopped and the coach is not asked again
- **And** the removal of that lesson time becomes a cancel in the same change batch: Mia's seat moves
  to a `CANCELLED#` line with `cancelledBy = SCHEDULE_CHANGE`
*(source: ADR-006 amendment 2026-10-08; ADR-MASTER §9, "One evaluator" (Remove) and "The preview")*

**1.2 The family gets the "just booked" email, not the ordinary cancellation email**
- **Given** the batch of 1.1 has reached `executionStatus = EXECUTED`
- **When** the change notifier handles the Chen family's lines
- **Then** the Chen family gets the "just booked" email, in substance: "Coach updated their schedule
  just as you booked. Here are other open times." with a link to the coach's open times
- **And** the ordinary cancellation email is not sent for that lesson
- **And** the email's `Reply-To` is lessons@danawhitfieldskating.com
*(source: ADR-006 amendments 2026-10-08 and 2026-10-09; `FeatureDecriptions/cancelation.md`, "A booking
made between the coach's preview and save"; ADR-MASTER §13)*

**1.3 The cancelled booking is never charged**
- **Given** Mia's 2027-01-18 booking was cancelled by the save
- **When** the Chen family's cancellation is recorded
- **Then** no missed-lesson fee is owed for it
*(source: ADR-MASTER §10, "General" — "A cancellation by the coach, a schedule change or the sweep is never
charged"; `FeatureDecriptions/cancelation.md`, "Who is charged")*

**1.4 A booking made before the preview gets the ordinary email**
- **Given** the Okafor family booked Zoe into Monday 2027-01-25 at 6:00 AM on Friday 2027-01-08, so the
  review page listed it as a lesson the change will cancel
- **When** Coach Dana accepts the change at 9:05 AM
- **Then** the Okafor family gets the ordinary schedule-change email, not the "just booked" email
*(source: ADR-006 amendment 2026-10-08 — the separate email is for "any booking made since the preview")*

**1.5 A booking cannot land after the save removed the time**
- **Given** the save of 1.1 has removed the 2027-01-25 6:00 AM lesson time
- **When** another family tries to book that time at 9:10 AM
- **Then** the booking is refused for that date and nothing is cancelled or emailed
*(source: ADR-031 d11; ADR-MASTER §9, "One evaluator" — "a booking can never land on a time the save
removed"; `FeatureDecriptions/Schedule Creater.md`, 2026-10-13 note)*

**1.6 The coach sees it on the email templates page as always sent**
- **Given** the Phase 2 email templates page
- **When** Coach Dana opens it
- **Then** "Just booked, then cancelled" is listed under emails families get, with no on/off switch
*(source: `FeatureDecriptions/C_Coach Email Templates.md` — cancellation and schedule-change emails are
"Always sent"; design `design/harbor/coach/screens-money-profile.js`, `justBooked`, `required: true`)*

## 2. Rules that must always hold
- The save never waits for, or asks, the coach because of a booking made since the preview.
  *(ADR-006, ADR-008, ADR-020 amendments 2026-10-08)*
- The review page is a guide; what was cancelled is what the save did. *(`FeatureDecriptions/Schedule
  Creater.md`, "A family books during the review")*
- The email never suggests a specific other time and moves nothing; it links to the open times.
  *(`FeatureDecriptions/cancelation.md`, "The cancellation email")*
- Cancellations from a schedule change are never charged. *(ADR-MASTER §10)*

## Open questions
1. **How the notifier knows a booking was made since the preview.** MVP builds no booking counter. ADR-006
   (2026-10-09) calls "the save recalculates the plan and compares it with the preview's" only the
   *likely* mechanism. Where is the mark stored (on the `CANCELLED#` line, the batch header?), and what
   is it called?
2. **A family with both kinds in one batch.** If the Chen family also had an older lesson cancelled by the
   same save, does it get one email covering both, or the "just booked" email plus the ordinary one?
   ADR-006 d6 says one message per family per batch; the 2026-10-08 amendment says a "separate" email.
3. **The exact wording and subject.** `FeatureDecriptions/cancelation.md` quotes "Coach updated their schedule
   just as you booked. Here are other open times." The Harbor design's sample
   (`design/harbor/coach/screens-money-profile.js`, `justBooked`) reads differently: "You booked Mia's lesson
   on Mon, Nov 2 at 6:00 AM just as Dana changed their schedule, and that time is no longer offered. The
   booking has been cancelled and you won't be charged." Which is the wording?
4. **A recurring booking made since the preview** that the change cancels on some dates only: which dates
   count as "just booked"?
5. **A re-price instead of a cancel.** A booking made since the preview that the save re-prices: does it
   get any special email? Only cancellations are named.
6. **Text version.** `FeatureDecriptions/SMS Messages.md` names no "just booked" text.
7. **Whether to build it at all.** The owner moved it to Phase 2 "to be reconsidered if feedback supports
   that this is an issue" (ADR-006 amendment 2026-10-09; Open-Pending §4).
