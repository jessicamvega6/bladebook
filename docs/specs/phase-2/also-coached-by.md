# Spec: "Also coached by" and the disclosure line (Phase 2)

**Status:** Draft — 2026-11-16
**Sources:** ADR-025 decision 4 (and amendment 2026-10-07), decision 2 (and amendment 2026-10-06),
Consequences, Tests, Revisit if; ADR-021 decision 6 (amendment 2026-10-06); ADR-MASTER §2 (functions,
roles, events), §16, §24; `FeatureDecriptions/Coach Dashboard on website.md` (Student List);
`FeatureDecriptions/ClientProfileView` ("More than one coach, from ADR-025"); `FeatureDecriptions/Client
Sign Up` (ADR-025 item h); `docs/architecture.md` data model (`STUDENT#`, `otherCoaches`) and §10
Phase 2+; `docs/Items to ask Kim About.md` §10
**Depends on:** Minimum Viable Product (MVP) multi-coach skaters (one `studentId`, one `STUDENT#` record per coach, each
approved separately) and `consumer-student-link`; for 1.5, the Phase 2 removing-a-skater spec
**Out of scope:** anything else crossing between coaches (schedules, prices, lessons, notes,
contact details); a coach's switch to hide their name (only a "Revisit if" today)

## Summary
A coach sees, on a skater's record, the first and last names of the skater's other coaches, once
the skater is approved with both. It is a copied list (`otherCoaches` on each coach's `STUDENT#`
record) kept by `consumer-student-link`, not a new permission: no coach can read another coach's
partition. Because this is a deliberate, narrow exception to keeping coaches' data apart, the family
is told about it when they add a coach, and at sign-up when they choose more than one. Existing
skaters get the list from a one-off backfill when the feature ships.

## Assumed in every example
- Coaches: Dana Lee, Sam Ortiz and Ben Park.
- The Rossi family (contact Laura Rossi) has one skater, Mia Rossi.
- Unless a scenario says otherwise, Mia is `ACTIVE` with Coach Dana and Coach Sam.

## 1. What the coach sees

**1.1 A coach sees the other coach's name**
- **Given** Mia is `ACTIVE` with Coach Dana and Coach Sam
- **When** Coach Dana opens Mia's record on her Student List
- **Then** it shows *"Also coached by: Sam Ortiz."*
*(source: `FeatureDecriptions/Coach Dashboard on website.md`, Student List, "Phase 2 (owner,
2026-10-07; decided 2026-10-06)"; ADR-025 decision 4)*

**1.2 It works both ways**
- **Given** Mia is `ACTIVE` with Coach Dana and Coach Sam
- **When** Coach Sam opens Mia's record on his Student List
- **Then** it shows *"Also coached by: Dana Lee."*
*(source: ADR-025 decision 4; ADR-025 Tests, "`otherCoaches` appears on both coaches' records only
when the skater is `ACTIVE` with both")*

**1.3 A coach still to approve isn't named**
- **Given** Mia is `ACTIVE` with Coach Dana and `PENDING` with Coach Ben
- **And** Mia is not with Coach Sam
- **When** Coach Dana opens Mia's record
- **Then** it names no other coach
- **And** `otherCoaches` on Coach Dana's `STUDENT#` record for Mia is empty
*(source: ADR-025 decision 4, "Only the names, and only between approved links … only once the
skater is `ACTIVE` with both")*

**1.4 Approval adds the name on every record**
- **Given** Mia is `ACTIVE` with Coach Dana and `PENDING` with Coach Ben
- **When** Coach Ben approves Mia
- **Then** `consumer-student-link` sets `otherCoaches` on Coach Dana's `STUDENT#` record for Mia to
  `[{coachFirstName: "Ben", coachLastName: "Park"}]`
- **And** sets it on Coach Ben's record for Mia to `[{coachFirstName: "Dana", coachLastName: "Lee"}]`
*(source: ADR-025 decision 4, "recomputes the list for every coach of that skater whenever one of
the skater's links becomes `ACTIVE` or is removed")*

**1.5 Removing a link removes the name**
- **Given** Mia is `ACTIVE` with Coach Dana and Coach Sam
- **When** Mia's link with Coach Sam is removed
- **Then** `otherCoaches` on Coach Dana's record for Mia no longer includes Sam Ortiz
*(source: ADR-025 decision 4; ADR-025 Tests, "and disappears when one link is removed". How a link is
removed: `removing-a-skater.md`)*

**1.6 A coach's name change reaches the other coaches' records**
- **Given** Mia is `ACTIVE` with Coach Dana and Coach Sam
- **When** Coach Sam changes his last name to Ortiz-Reyes
- **Then** Coach Dana's record for Mia shows *"Also coached by: Sam Ortiz-Reyes."*
*(source: ADR-025 decision 4, "and when a coach changes their name")*

**1.7 Every other approved coach is listed, never the coach herself**
- **Given** Mia is `ACTIVE` with Coach Dana, Coach Sam and Coach Ben
- **When** Coach Dana opens Mia's record
- **Then** it names Sam Ortiz and Ben Park
- **And** it doesn't name Dana Lee
*(source: ADR-025 decision 4, "a list of `{coachFirstName, coachLastName}` for the skater's other
`ACTIVE` coaches")*

**1.8 Only the names cross**
- **Given** Mia is `ACTIVE` with Coach Dana and Coach Sam
- **When** Coach Dana opens Mia's record
- **Then** it shows nothing of Coach Sam's but his first and last name: not his schedule, prices,
  lessons, notes or contact details
- **And** the database still refuses any read Coach Dana's session makes of Coach Sam's partition
*(source: ADR-025 decision 4, "Nothing else crosses" and "This is a copy, not a new permission. No
policy changes"; ADR-MASTER §16, `coach-tenant`)*

**1.9 The consumer's own write doesn't start it again**
- **Given** Mia is `PENDING` with Coach Ben and `ACTIVE` with Coach Dana
- **When** `consumer-student-link` writes `otherCoaches` after Coach Ben's approval
- **Then** that write raises no `StudentChanged` event
*(source: ADR-025 decision 4, "`otherCoaches` is not one of the fields that raise `StudentChanged`";
ADR-MASTER §3, `StudentChanged` is raised by `studentStatus` or `studentName` changes or removal)*

**1.10 A repeated event has one effect**
- **Given** Coach Ben's approval of Mia raised one `StudentChanged` event
- **When** that event is delivered to `consumer-student-link` twice
- **Then** `otherCoaches` on each of Mia's records is the same as after one delivery
*(source: ADR-MASTER §19, `consumer-student-link` "Idempotent by construction"; ADR-013 decision 4,
"twice-delivered events have one effect")*

**1.11 The one-off backfill**
- **Given** before the feature ships, Mia is `ACTIVE` with Coach Dana and Coach Sam and neither
  `STUDENT#` record has `otherCoaches`
- **When** the one-off backfill runs
- **Then** Coach Dana's record for Mia has
  `otherCoaches = [{coachFirstName: "Sam", coachLastName: "Ortiz"}]`
- **And** Coach Sam's has `otherCoaches = [{coachFirstName: "Dana", coachLastName: "Lee"}]`
*(source: ADR-025 decision 4, "existing skaters need a one-off backfill, because the list is
otherwise only recomputed when a link changes"; `docs/architecture.md` §10 Phase 2+)*

## 2. What the family is told

**2.1 Adding a coach**
- **Given** Mia is `ACTIVE` with Coach Dana
- **And** Laura has entered Coach Sam's code on *Add a coach*, and Coach Sam is shown
- **When** Laura ticks Mia
- **Then** the add-a-coach screen says *"Coach Sam will see that Mia also skates with Coach Dana, and Coach Dana will see
  Coach Sam."*
*(source: `FeatureDecriptions/ClientProfileView`, "Phase 2 (owner, 2026-10-07), with 'Also coached by'
on the coach side"; ADR-025 decision 2)*

**2.2 Choosing more than one coach at sign-up**
- **Given** a new family entered Coach Dana's and Coach Sam's codes at sign-up
- **When** they tick both coaches for Mia
- **Then** the same disclosure line shows
*(source: `FeatureDecriptions/ClientProfileView`, "The same line shows at sign-up when more than one
coach is chosen"; ADR-025 decision 2, amendment 2026-10-06; `FeatureDecriptions/Client Sign Up`,
ADR-025 item h, "Only the disclosure line about other coaches stays Phase 2")*

**2.3 One coach at sign-up: no line**
- **Given** a new family entered only Coach Dana's code at sign-up
- **When** they tick Coach Dana for Mia
- **Then** no disclosure line shows
*(source: `FeatureDecriptions/ClientProfileView`, "when more than one coach is chosen")*

## 3. Rules that must always hold

- **A copy, not a permission.** No policy changes; a coach still can't read another coach's
  partition. *(ADR-025 decision 4; ADR-021 amendment 2026-10-06)*
- **Names only, and only between `ACTIVE` links.** *(ADR-025 decision 4)*
- **Only `consumer-student-link` writes `otherCoaches`**, and it recomputes the list for every coach
  of the skater when a link becomes `ACTIVE` or is removed, or a coach changes their name.
  *(ADR-025 decision 4; ADR-021 decision 6)*
- **The family is told before it happens:** the disclosure ships with the coach-side view, never
  one without the other. *(ADR-025 decision 2, "this message ships with decision 4")*

## Open questions

1. **Does it ship in Phase 2 at all,** and does it stay a plain list or need grouping or truncating
   for a skater with many coaches? Is seeing the names useful to Kim? (`docs/Items to ask Kim
   About.md` §10, question 5; ADR-025 "Revisit if": dropped, or a switch each coach turns on)
2. **The disclosure's wording beyond two coaches and one skater:** three or more coaches, several
   skaters ticked, or a skater with no `ACTIVE` coach yet (`PENDING` only, or "Not with a coach
   yet"). (`FeatureDecriptions/ClientProfileView`)
3. **Does *Add a skater*'s "Which coaches?" show the line** when it ticks more than one coach?
   (`FeatureDecriptions/ClientProfileView`, item k)
4. **`consumer-student-link`'s role.** ADR-025 says it "already runs on its execution role with the
   reach to do it", but its row in ADR-MASTER §2 lists only `UpdateItem`, `DeleteItem` and `GetItem`
   on the coach profile. Working out a skater's other `ACTIVE` coaches needs a read the row doesn't
   list. (ADR-MASTER §2, `consumer-student-link` row)
5. **Where the copied names come from and how a name change reaches them**, given the family's link
   items copy `coachFirstName` and `coachLastName` from the `CODE#` item at registration.
   (ADR-022 decision 7)
6. **The backfill:** how it runs, who runs it, and when relative to the release.
7. **Is `otherCoaches` listed among the personal-data field names in the access log** when a coach
   reads a skater's record? (ADR-012)
