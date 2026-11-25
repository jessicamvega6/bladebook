# Spec: Removing a skater (Phase 2)

**Status:** Draft — 2026-11-16
**Sources:** ADR-025 amendment 2026-10-13 items g and n, Tests, Consequences; ADR-024 decision 2 and
Consequences; ADR-033; ADR-021 decision 6; ADR-017; ADR-MASTER §5, §8, §16, §20, §24;
`FeatureDecriptions/ClientProfileView` (items n, "Open questions"); `FeatureDecriptions/Coach Dashboard on
website.md` (Student List); `FeatureDecriptions/Bookings:`; `FeatureDecriptions/Email templates Needed:`;
`docs/Open-Pending.md` §8 ("What does 'delete a student/client' … mean?"); `docs/Blockers-Before-Coding.md`
#17
**Depends on:** Minimum Viable Product (MVP) multi-coach skaters, the write link check (`ClientLinks.requireActive`), the
share-check; `also-coached-by.md` for what removal does to `otherCoaches`
**Out of scope:** **deleting a skater's data on request (erasure)**, a separate Phase 2 feature with
its own design in `docs/deletion/`; declining a `PENDING` skater (MVP)

## Summary
A skater can be removed from one coach or from all of them; in MVP neither website has a Remove
button. Most of what removal means is still undecided: whether it reaches back or only forward, what
happens to upcoming lessons, and what the family sees. What is decided is that removal is per coach
and never touches the skater's lessons with other coaches, that the coach confirms before removing,
and that a removed skater can no longer be booked or invited with that coach. Removal is not
erasure.

## Assumed in every example
- Coaches: Dana Lee and Sam Ortiz.
- The Rossi family (contact Laura Rossi) has one skater, Mia Rossi (*"Mia R."*), `ACTIVE` with both
  coaches.
- The Chen family has one skater, Leo Chen, `ACTIVE` with Coach Dana.
- Now is Monday 2027-01-11, 10:00 AM in the coaches' time zone.
- Mia has a booked lesson with Coach Sam on Wednesday 2027-01-13 at 5:00 PM.
- "Removed" means removed with Coach Dana by whatever write the open questions settle; the skater is
  then no longer `ACTIVE` with her (ADR-024 decision 2 counts a removed skater as "linked, but isn't
  `ACTIVE` now").

## 1. Removing

**1.1 The coach confirms first**
- **Given** Mia is on Coach Dana's Student List
- **When** Coach Dana chooses to remove Mia
- **Then** a confirmation pop-up shows
- **And** nothing is removed until Coach Dana accepts it
*(source: `FeatureDecriptions/Coach Dashboard on website.md`, Student List: "On delete there is a
confirmation pop that must be accepted before delete happens"; Phase 2 (owner, 2026-10-13))*

**1.2 Lessons with another coach are untouched**
- **Given** Mia's booked lesson with Coach Sam on Wednesday 2027-01-13 at 5:00 PM
- **When** Coach Dana removes Mia
- **Then** Mia's `SEAT#` with Coach Sam is still `BOOKED`
- **And** Coach Sam's `STUDENT#` record for Mia is still `ACTIVE`
- **And** no `CHANGEBATCH#` or `CANCELLED#` item is written in Coach Sam's partition, and nothing is
  sent about Coach Sam's lessons
*(source: ADR-025 item g, "One coach removing a skater, or cancelling their lessons, doesn't affect the
skater's lessons with other coaches"; ADR-025 Tests; ADR-MASTER §5, "Skaters and coaches")*

## 2. After removal

**2.1 The family can't book with that coach**
- **Given** Coach Dana has removed Mia while Laura had Coach Dana's booking page open
- **When** Laura books Thursday 2027-01-14 at 4:00 PM with Coach Dana for Mia
- **Then** the request is refused with HTTP 409 and Laura sees *"Mia's lessons are no longer
  available to book. Contact Coach Dana."*
- **And** nothing is booked
- **And** it is logged as an ordinary application event, not a security event, and doesn't count
  toward the link-check alarms
*(source: ADR-024 decision 2, "removed too once removing a student arrives in Phase 2 (owner,
2026-10-13)"; ADR-MASTER §16, "The write link check"; `FeatureDecriptions/Bookings:`)*

**2.2 The family can still book with the other coach**
- **Given** Coach Dana has removed Mia
- **When** Laura books Thursday 2027-01-14 at 6:00 PM with Coach Sam for Mia
- **Then** the booking goes ahead as for any `ACTIVE` skater
*(source: ADR-025 item g; ADR-025 decision 3, "`linkStatus` is per coach")*

**2.3 A removed skater can't be invited to that coach's lessons**
- **Given** Coach Dana has removed Mia
- **When** the Chen family enters Mia's share code while booking a lesson with Coach Dana
- **Then** the share-check answers `onCoachRoster: false`
- **And** the site doesn't send the booking with that code, so nothing is booked
*(source: ADR-033; ADR-MASTER §8, "Only a skater `ACTIVE` with the coach can be invited" and "A refusal
at the share step books nothing")*

**2.4 An invitation sent before the removal can't be accepted**
- **Given** the Chen family invited Mia to share Leo's lesson with Coach Dana on Friday 2027-01-15 at
  4:00 PM, and the invited seat is still `INVITED`
- **And** Coach Dana has since removed Mia
- **When** Laura accepts the invitation
- **Then** it is refused with the ordinary *"no longer available"* message, and the seat stays `INVITED`
*(source: ADR-MASTER §8, "A skater no longer `ACTIVE` with the coach gets the ordinary 'no longer
available'")*

## 3. Rules that must always hold

- **Removal is per coach.** Removing a skater from one coach changes nothing in any other coach's
  partition. *(ADR-025 items g and n)*
- **The family's link item follows the coach's record.** Whatever removal writes to the coach's
  `STUDENT#` item raises `StudentChanged`, and `consumer-student-link` keeps the family's
  `CLIENT#…/STUDENT#<coachId>#<studentId>` link item in step; `api-coach` never writes the family's
  partition. *(ADR-021 decision 6; ADR-MASTER §3 events, §16)*
- **A removed link updates "Also coached by".** If that feature has shipped, `consumer-student-link`
  recomputes `otherCoaches` on every coach's record for the skater. *(ADR-025 decision 4;
  `also-coached-by.md` 1.5)*
- **Removal is not erasure.** Erasing a skater's data on request is an explicit delete that must
  reach the table, the archive, the monthly backups and every coach the skater had; it is designed
  separately. *(ADR-017; ADR-MASTER §20, §24)*

## Open questions

1. **What removing means for the data:** going forward or retroactive; whether the coach's
   `STUDENT#` record is deleted or kept with a new status; how long anything kept is held.
   (`docs/Open-Pending.md` §8; blocker #17; ADR-029 Open, registration-number retention)
2. **Upcoming lessons with the removing coach.** The design (`students-remove.html`) reads it as:
   upcoming lessons are cancelled and the family is emailed. Not decided: whether they are cancelled,
   as `cancelledBy = COACH` (so never charged), and whether each lesson time is released or held.
   (`FeatureDecriptions/Coach Dashboard on website.md`, Student List)
3. **The "Skater removed by the coach" email**, listing the cancelled lessons and sent only if
   lessons were cancelled, is likewise the design's reading. (`FeatureDecriptions/Email templates
   Needed:`)
4. **Past lessons and payments.** The design keeps them in the coach's records. Does an `UNPAID`
   past seat stay on the coach's payment dashboard and in the weekly unpaid reminder?
5. **What the family sees** on Profile, Home and My bookings, especially when one coach removes the
   skater and another keeps them. (`FeatureDecriptions/ClientProfileView`, "Open questions"; ADR-025
   Open; `docs/Items to ask Kim About.md` §10, question 4)
6. **Removing from all coaches:** who does it (a coach can't reach another coach's partition), and
   does the skater then become "Not with a coach yet"? (ADR-025 item n; ADR-MASTER §5)
7. **Can the family remove a skater?** The profile's Remove button was taken out on 2026-10-13 and
   left with this decision. (`FeatureDecriptions/ClientProfileView`)
8. **Can a removed skater rejoin** the same coach through *Add a coach*, as a new `PENDING` link?
9. **Shared lessons:** a removed skater's `BOOKED` seat in a lesson shared with another family, and
   invitations they sent that are still `INVITED`.
10. **Does removing need a recent sign-in?** (ADR-MASTER §25, "Whether other actions need a recent
    sign-in")
11. **A family account left with no skaters or no coach.** (`docs/Open-Pending.md` §8)
