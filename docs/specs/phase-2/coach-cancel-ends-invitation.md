# Spec: The coach's cancel ends an invitation (Phase 2)

**Status:** Draft — 2026-11-16
**Sources:** ADR-031 (decision 2, decision 14, amendment 2026-11-08, amendment 2026-11-13); ADR-033
(decisions 3, 6); ADR-017; ADR-MASTER §3 ("Ended invitation"), §7 ("Seats"), §8 ("Ending an invitation",
"Who sends what", "Coaches see every skater"), §10 ("By the coach"), §20, §24; `docs/architecture.md` §5
data model (Seat end) and event catalog; `FeatureDecriptions/cancelation.md` ("Coach cancelation", changed
2026-11-08); `FeatureDecriptions/Schedule lesson split` ("Coaches see every skater"); `docs/glossary.md`
(`SEATEND.seatOutcome`, `endedBy`)
**Depends on:** Minimum Viable Product (MVP) shared lessons by invitation (invited seats, `consumer-invite`, the hourly deadline
sweep); MVP coach cancellation of a lesson, a day or the rest of the week
**Out of scope:** the consent-link roster join and the coach declining an invited skater (Phase 2, ADR-033 d7);
cancellation reasons (see `cancellation-reasons.md`)

## Summary
When the coach cancels a lesson whose invited seat is still `INVITED` (the invited family hasn't answered),
MVP deletes that seat in the same transaction with no record and no email; the invited family finds out
only if they try to answer ("no longer available"). In Phase 2 the ending is recorded as a `SEATEND#`
record with `endedBy` the coach, and the invited family is told.

## Assumed in every example
- Coach Dana Whitfield, business email lessons@danawhitfieldskating.com.
- The Chen family (Grace Chen, skater Mia Chen) booked Mia into Wednesday 2027-01-13 at 4:00 PM, a block
  that allows 2 skaters, and invited Zoe Okafor with her share code. Zoe is `ACTIVE` with Coach Dana.
- So the lesson time has Mia's seat `BOOKED` and Zoe's seat `INVITED` (`inviteId` set, no `clientId`,
  `invitedClientId` = the Okafor family), with an `EXPIRE` deadline at the lesson's start.
- The Okafor family (Tom Okafor) has not answered.
- Now is Monday 2027-01-11, 10:00 AM in the coach's time zone.

## 1. Ending the invitation

**1.1 The invited seat is recorded as ended by the coach**
- **Given** the lesson above
- **When** Coach Dana accepts the cancellation of the Wednesday 2027-01-13 4:00 PM lesson
- **Then** Mia's seat moves to a `CANCELLED#` line with `cancelledBy = COACH`
- **And** in the same transaction Zoe's `INVITED` seat is deleted and a `SEATEND#2027-01-13#16:00#<Zoe's
  studentId>#<isoTs>` record is written with `endedAt`, `endedBy` = the coach, `studentId`,
  `studentName`, `clientId` and `inviteId`
*(source: ADR-031 amendment 2026-11-08 — "*Phase 2:* record the ending"; ADR-MASTER §8, "Ending an
invitation", and §24; ADR-MASTER §3, "Ended invitation" — "`endedBy` (the family or `SWEEP`; the coach
from Phase 2)"; ADR-MASTER §7 — "A seat that ends is moved, not kept")*

**1.2 The invited family is told**
- **Given** the cancellation of 1.1 has been carried out
- **When** the change reaches the stream
- **Then** the Okafor family gets an email saying the invitation for Zoe to share the 2027-01-13 4:00 PM
  lesson with Coach Dana has ended because the coach cancelled the lesson, and that nothing was booked for
  Zoe
*(source: ADR-MASTER §24 — "record it (a `SEATEND#` line) and tell the invited family";
`FeatureDecriptions/cancelation.md`, "Coach cancelation" — "*Phase 2:* record it and tell the invited family".
The wording is open.)*

**1.3 The inviting family gets the ordinary coach-cancellation email**
- **Given** the cancellation of 1.1
- **When** the change batch reaches `executionStatus = EXECUTED`
- **Then** the Chen family gets the ordinary "Lesson cancelled by you" email for Mia's lesson, with no
  charge
*(source: ADR-MASTER §8 "Coaches see every skater" — "A coach cancelling a lesson cancels every seat, and
each family is told"; ADR-MASTER §13, "Routing by actor")*

**1.4 A later answer still finds nothing**
- **Given** the cancellation of 1.1 is done
- **And** Tom has opened the invitation link from before the cancel and signed in
- **When** Tom selects "Go ahead" for Zoe
- **Then** nothing is written, because the seat is no longer `INVITED`
- **And** Tom sees that the invitation is no longer available
*(source: ADR-033 d3 — the accept is conditional on the seat being `INVITED`; ADR-MASTER §8, "The invited
family"; ADR-031 amendment 2026-11-08)*

**1.5 An invitation the family had already accepted is an ordinary seat**
- **Given** Tom had already accepted on Sunday 2027-01-10, so Zoe's seat is `BOOKED`
- **When** Coach Dana cancels the 2027-01-13 4:00 PM lesson
- **Then** Zoe's seat moves to a `CANCELLED#` line like Mia's, no `SEATEND#` record is written, and the
  Okafor family gets the ordinary coach-cancellation email
*(source: ADR-MASTER §8, "Ending an invitation" — the row applies only while the seat is "still `INVITED`";
ADR-MASTER §10, "By the coach")*

**1.6 The record is kept for the cancellation window**
- **Given** the `SEATEND#` record of 1.1
- **When** retention is applied
- **Then** it is kept for the same window as cancellation lines
*(source: ADR-MASTER §20 — "`SEATEND#` | Written | Cancellation window"; ADR-031 d14)*

## 2. Rules that must always hold
- The coach's cancel never leaves an `INVITED` seat behind on a cancelled lesson: it ends in the same
  transaction as the other seats. *(ADR-031 amendment 2026-11-08)*
- An ended invitation is moved to `SEATEND#`, never kept as a seat; its seat key is then free.
  *(ADR-MASTER §7)*
- An invitation that ends this way books nothing and costs nothing for the invited family. *(ADR-MASTER §8,
  "When an invitation ends"; ADR-MASTER §10, "General")*
- `consumer-invite` never ends a seat itself. *(architecture.md event catalog)*

## Open questions
1. **`seatOutcome` for this case.** The values are `DECLINED | WITHDRAWN | EXPIRED`, and none describes a
   coach's cancel. Is there a new value (e.g. a coach-cancelled outcome), or is one of these reused?
2. **What `endedBy` holds for the coach** (the coach's ID, or a constant such as `COACH`), and whether this
   is the same "coach from Phase 2" the glossary means. The glossary says the coach value arrives "when the
   coach can decline an invited skater" (the consent-link join, `docs/glossary.md`, `endedBy`), while
   ADR-MASTER §24 attaches it to the coach's cancel.
3. **Which function sends the email.** `consumer-invite` sends every other invitation outcome email from a
   seat's move to `SEATEND#` (ADR-MASTER §8, "Who sends what"); the change notifier sends cancellation
   emails. Which one sends this, and with what guard?
4. **The email's wording and subject.** Is it a new email, or the existing "Shared lesson no longer
   available" email (`FeatureDecriptions/Email templates Needed:`)?
5. **One email per invitation.** Shared-lesson emails are "one per invitation or answer, listing every
   date it covers" (owner, 2026-11-13, G-38). If the coach's "Cancel rest of week" ends two dates of the same
   series invitation, does the Okafor family get one email listing both?
6. **Whether the coach is shown** that cancelling also ends an unanswered invitation, on the cancel
   confirmation view.
7. **A text** for an invited family with texts on: not named among the Phase 2 family texts.
8. **Gate-test rows** for writing `SEATEND#` from the coach's cancel (ADR-MASTER §25 lists the `SEATEND#`
   rows still to write).
