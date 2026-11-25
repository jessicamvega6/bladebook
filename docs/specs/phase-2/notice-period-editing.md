# Spec: Editing the notice period (Phase 2)

**Status:** Draft — 2026-11-16
**Sources:** ADR-025 (item d and its 2026-11-08 amendment), ADR-016 (decision 2's profile table,
amendment 2026-09-29), ADR-015 (decision 3, Open), ADR-031 (decisions 1, 8), ADR-020 (decision 2,
Open), ADR-009 (2026-10-08 amendment), ADR-022 (decision 6's allowlist),
`FeatureDecriptions/C_Coach Profile.md`, `FeatureDecriptions/Bookings:` ("More than one coach"),
`FeatureDecriptions/cancelation.md` ("Client cancelation", "Coach told about a client cancellation",
"Where the coach sets it"), `FeatureDecriptions/Re-pricing Booked Lessons.md`, ADR-MASTER §4, §7
("Booking with more than one coach"), §24, §25, `docs/Open-Pending.md` §3 and §4.
**Depends on:** the Minimum Viable Product (MVP) coach profile (ADR-MASTER §4); MVP booking with more than one coach (§7);
MVP cancellation and the coach's late-cancellation email and text (§10, §13); re-pricing (§9).
**Out of scope:** the missed-lesson fee and what a late cancellation is charged
(`missed-lesson-fee.md`); the Phase 2 shared-lesson warning that is timed from the notice period
(`FeatureDecriptions/Schedule lesson split`); the family's Payments page, which shows each coach's
notice period (`FeatureDecriptions/C_Client Payments.md`).

## Summary
In MVP every coach's notice period (`requiredNoticeHours`) is 24 hours and can't be changed. From
Phase 2 a coach edits it on their profile, so notice periods differ by coach. The notice period
decides which family cancellations are late, when the coach is told about one, how far ahead a
price rise reaches, and when a shared lesson's keep-or-cancel question must be answered. Families
see each coach's own period when booking.

## Assumed in every example
- Coach Dana Park has `requiredNoticeHours = 24`; Coach Sam Ortiz has changed his to 48. Both
  use `America/Chicago`.
- Skater Mia R. (the Rossi family) is `ACTIVE` with both coaches. Skater Leo T. (the Tran
  family) is `ACTIVE` with Sam only.
- Now is **Monday 2027-03-01 10:00**. Sam's lesson times named below were made after his change,
  so they are stamped `requiredNoticeHours = 48`.
- Hours are used as the unit because the field is `requiredNoticeHours`; the unit itself is an
  open question.

## 1. Changing the notice period

**1.1 The coach saves a new notice period**
- **Given** Sam's profile has `requiredNoticeHours = 24`
- **When** Sam sets his notice period to 48 hours on his profile and saves
- **Then** his `COACH#<coachId>` / `PROFILE` item stores `requiredNoticeHours = 48`
*(source: ADR-016 d2 table, "`requiredNoticeHours`"; FeatureDecriptions/cancelation.md, "Where the coach sets it")*

**1.2 The notice period is not on the sign-up form**
- **Given** a coach is signing up
- **When** they reach the end of the sign-up form
- **Then** no notice-period field has been shown, and the new profile stores `requiredNoticeHours = 24`
*(source: ADR-016 d2 table; ADR-MASTER §4)*

**1.3 A lesson time made after the change carries the new notice period**
- **Given** Sam's profile has `requiredNoticeHours = 48`
- **When** `sched-lesson-roller` makes a new lesson time for Sam
- **Then** the `LESSON#` item carries `requiredNoticeHours = 48`
*(source: ADR-031 d1; ADR-015 d3)*

**1.4 It is one setting per coach, not per block**
- **Given** Sam has a 30-minute block and a 60-minute block
- **When** he edits either block in the schedule editor
- **Then** neither block offers a notice-period field
*(source: FeatureDecriptions/cancelation.md, "Where the coach sets it": "a coach-level policy … not per block")*

## 2. What families see when booking

**2.1 The booking pages show the selected coach's notice period**
- **Given** the Rossi family is booking for Mia, with Sam selected in the *Coach* dropdown
- **When** the booking page loads
- **Then** it shows Sam's notice period of 48 hours
*(source: ADR-025 d; FeatureDecriptions/Bookings:, "More than one coach")*

**2.2 Switching coach shows that coach's notice period**
- **Given** the Rossi family is booking for Mia with Sam selected
- **When** they switch the *Coach* dropdown to Dana
- **Then** the page shows Dana's notice period of 24 hours
*(source: ADR-025 d; FeatureDecriptions/Bookings:)*

**2.3 With more than one coach, the confirm pop-up says notice periods can differ**
- **Given** Mia has two coaches, Dana and Sam, and the Rossi family has picked times with both
- **When** they open the confirm pop-up
- **Then** it says *"Coaches can have different cancellation notice periods."*
- **And** it doesn't list each coach's notice period
*(source: ADR-025 d and its 2026-11-08 amendment; ADR-MASTER §7, §24)*

**2.4 With one coach, the line isn't shown**
- **Given** the Tran family's only coach is Sam
- **When** they open the confirm pop-up for a booking for Leo
- **Then** the pop-up doesn't say *"Coaches can have different cancellation notice periods."*
*(source: ADR-025 d: "when the family has more than one coach")*

## 3. What the notice period decides

**3.1 The cancel confirmation warns inside the lesson's notice period**
- **Given** Leo is booked into Sam's lesson on Tuesday 2027-03-02 16:00 (30 hours away), stamped
  `requiredNoticeHours = 48`
- **When** the Tran family opens its cancel confirmation at 10:00
- **Then** the confirmation shows the notice-period warning naming 48 hours, because 30 hours is
  inside 48 (wording: `missed-lesson-fee.md`, open question 2)
*(source: FeatureDecriptions/cancelation.md, "Client cancelation" ("N is the coach's notice period"); ADR-015 d6)*

**3.2 The coach is told about a cancellation inside the notice period**
- **Given** Leo is booked into Sam's lesson on Tuesday 2027-03-02 16:00, stamped
  `requiredNoticeHours = 48`, and Sam has *"Text me when a family cancels late"* ticked
- **When** the Tran family cancels it at 10:00 (30 hours' notice)
- **Then** Sam is emailed that a family cancelled late
- **And** Sam is sent one text
*(source: ADR-009 amendment 2026-10-08; FeatureDecriptions/cancelation.md, "Coach told about a client cancellation")*

**3.3 The coach isn't told about a cancellation with enough notice**
- **Given** Leo is booked into Sam's lesson on Thursday 2027-03-04 16:00 (78 hours away), stamped
  `requiredNoticeHours = 48`
- **When** the Tran family cancels it at 10:00
- **Then** nothing is sent to Sam
*(source: ADR-009 amendment 2026-10-08; FeatureDecriptions/cancelation.md)*

**3.4 A price rise waits for the lesson's notice period**
- **Given** Sam's lessons on Tuesday 2027-03-02 16:00 (30 hours away) and Thursday 2027-03-04
  16:00 (78 hours away) are booked at $50.00, each stamped `requiredNoticeHours = 48`
- **When** Sam raises the block's price to $55.00 and saves
- **Then** Thursday's lesson time is changed to `priceMinor = 5500`
- **And** Tuesday's keeps `priceMinor = 5000`
*(source: ADR-020 d2 ("the booking's `requiredNoticeHours`"); FeatureDecriptions/Re-pricing Booked Lessons.md)*

**3.5 A shared lesson's answer-by time follows the lesson's notice period**
- **Given** Mia and Leo share Sam's lesson on Saturday 2027-03-06 16:00, stamped
  `requiredNoticeHours = 48`
- **When** the Rossi family cancels Mia's place at 10:00 on Monday 2027-03-01
- **Then** the lesson time's `pendingLeave` records `answerBy` = Thursday 2027-03-04 16:00 (the
  start of the 48-hour notice period, which comes before 7 days after the leave)
*(source: ADR-031 d8, "The answer-by time")*

## 4. Rules that must always hold
- **Each lesson time is judged by the notice period stamped on it**, not by the coach's current
  setting, so whether a cancellation was late can be decided from the record alone.
  *(ADR-015 d3; ADR-031 d1)*
- **"Late" has one meaning.** The coach's notification, the fee, the price-rise rule and the
  answer-by time all use the same `requiredNoticeHours`. *(FeatureDecriptions/cancelation.md,
  "Coach told about a client cancellation"; ADR-020 d2; ADR-031 d8)*
- **The notice period is set by the coach only, on their own profile, and is never on the
  sign-up form.** *(ADR-016 d2)*
- **A family can read a coach's `requiredNoticeHours`** only through the coach-partition read
  allowlist, as an `ACTIVE` linked family. *(ADR-022 d6)*

## Open questions
1. **Unit and bounds.** May a coach set 0, or 168 hours, or only pick from a short list? Validation
   follows the answer. *(Open-Pending §3; ADR-015 Open; ADR-MASTER §25; FeatureDecriptions/cancelation.md, "Open and revisit")*
2. **Do lesson times already made follow a change?** Lesson times are made about 15 months ahead,
   so if none follow, a change reaches only lessons more than about 15 months away. Whether open
   and booked lesson times are re-stamped, and by what rule, is undecided. *(Open-Pending §4;
   ADR-020 Open; FeatureDecriptions/Re-pricing Booked Lessons.md, "Open questions"; see the
   report's note: FeatureDecriptions/cancelation.md says booked lessons don't change)*
3. **Where on the profile the setting sits, and its wording.** `FeatureDecriptions/C_Coach Profile.md`
   has no field for it yet.
4. **Whether families are told** when a coach changes their notice period.
5. **Which notice period the booking page shows**: the profile's current value or the stamped value
   of the lesson times listed, if question 2 lets the two differ.
