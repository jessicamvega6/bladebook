# Spec: Approval email to the family (Phase 2)

**Status:** Draft — 2026-11-16
**Sources:** ADR-002 (amendments 2026-10-08/09 and 2026-11-06); ADR-021 decision 6; ADR-025;
ADR-033 (decisions 1, 3 and Consequences); ADR-MASTER §2 (`consumer-student-link`), §5 ("Approval"),
§13 ("Rules for every email"), §24; `FeatureDecriptions/Client Sign Up` ("Coach approval", step 5);
`FeatureDecriptions/ClientHomeView` ("Waiting for approval"); `FeatureDecriptions/Email templates
Needed:` ("Skater approved")
**Depends on:** Minimum Viable Product (MVP) registration and approval (`PENDING` → `ACTIVE` on the coach's `STUDENT#` record,
mirrored onto the family's link item by `consumer-student-link`); the MVP decline email from the
same consumer
**Out of scope:** the decline email (MVP); a reminder to the coach about waiting skaters (decided
against, ADR-002 2026-10-09); the consent-link roster join through a shared-lesson invitation (Phase 2,
ADR-033 d7)

## Summary
In MVP a family learns that the coach approved their skater only by opening the website again: the
waiting banner goes and the coach becomes bookable. In Phase 2 the family also gets an email when a
coach approves their skater, saying booking with that coach is open. It is sent by
`consumer-student-link`, which already handles the approval and sends the decline email.

## Assumed in every example
- Coach Dana Whitfield, business email lessons@danawhitfieldskating.com. Coach Ben Ross is a second
  coach.
- The Park family: contact Sarah Park, login email sarah.park@example.com. Skater Ava Park signed up
  with Coach Dana and Coach Ben on Monday 2027-01-11 and is `PENDING` with both.
- Now is Tuesday 2027-01-12, 9:00 AM in the coach's time zone.

## 1. Sending the email

**1.1 The coach approves a waiting skater**
- **Given** Ava is `PENDING` on `COACH#<Dana>/STUDENT#<Ava>`
- **When** Coach Dana approves Ava on the Students tab
- **Then** `api-coach` sets `studentStatus = ACTIVE` on Coach Dana's `STUDENT#` record only
- **And** `consumer-student-link`, triggered by `StudentChanged`, mirrors `ACTIVE` onto the family's
  link item and sends one email to sarah.park@example.com saying Ava can now book with Coach Dana
- **And** the email's `Reply-To` is lessons@danawhitfieldskating.com
*(source: ADR-002 amendment 2026-11-06; ADR-MASTER §5 "Approval", §13 "Rules for every email";
`FeatureDecriptions/Email templates Needed:`, "Skater approved")*

**1.2 Each coach's approval sends its own email**
- **Given** Coach Dana approved Ava at 9:00 AM and Ava is still `PENDING` with Coach Ben
- **When** Coach Ben approves Ava at 6:00 PM
- **Then** a second, separate email is sent about Coach Ben, with `Reply-To` set to Coach Ben's
  business email
- **And** the first email is not re-sent
*(source: `FeatureDecriptions/Email templates Needed:`, "Skater approved" — "With several coaches, one per
coach"; ADR-025; ADR-MASTER §13)*

**1.3 A sibling added later is approved like any new skater**
- **Given** Sarah adds a second skater, Noah Park, who is `PENDING` with Coach Dana
- **When** Coach Dana approves Noah
- **Then** the approval email about Noah and Coach Dana is sent
*(source: `FeatureDecriptions/Client Sign Up`, "Coach approval" — "a skater a family adds later waits for
approval like any new student"; ADR-002 amendment 2026-11-06)*

**1.4 Declining sends the decline email, not this one**
- **Given** Ava is `PENDING` with Coach Ben
- **When** Coach Ben declines Ava
- **Then** the `STUDENT#` record is deleted and the family gets the decline email
- **And** no approval email is sent
*(source: ADR-MASTER §5, "Approval"; ADR-002 decision 2b)*

**1.5 The email does not replace what the website shows**
- **Given** Coach Dana has approved Ava
- **When** Sarah next opens the family website
- **Then** the waiting banner for Coach Dana is gone and Coach Dana's times are bookable, whether or
  not she read the email
*(source: `FeatureDecriptions/Client Sign Up`, "Coach approval"; ADR-MASTER §5, "What a waiting family sees")*

## 2. Rules that must always hold
- The approval email is sent by `consumer-student-link`, never by `api-coach`. *(ADR-002 amendment
  2026-11-06; ADR-MASTER §5)*
- One email per coach's approval: approvals by different coaches are never combined. *(`FeatureDecriptions/
  Email templates Needed:`, "Skater approved")*
- Every family email sets `Reply-To` to the approving coach's `businessEmail`; the sender stays
  BladeBook's verified domain. *(ADR-MASTER §13)*
- No reminder email about waiting approvals is sent to the coach; the Students tab shows the count.
  *(ADR-002 amendment 2026-10-09)*

## Open questions
1. **The email's wording and subject.** Only its substance is fixed: "booking is open"
   (`FeatureDecriptions/Email templates Needed:`, "Skater approved"). No Harbor design exists for it.
2. **Two skaters approved together.** If Coach Dana approves Ava and Noah one after the other in the same
   minute, does the family get one email naming both, or one per skater? Each approval is its own
   `StudentChanged` event.
3. **The guard against a duplicate.** ADR-MASTER §19 lists `consumer-student-link` as "idempotent by
   construction" with replay on failure, but a sent email is not idempotent. Which flag or key stops a
   replayed event re-sending the approval email?
4. **The waiting pages' wording once it ships.** The MVP sign-up step 5 and Home were reworded not to
   promise an email (ADR-002 amendment 2026-11-06). Do they go back to "We'll email you as soon as Coach
   Dana approves"?
5. **On the coach's email templates page?** The Phase 2 page (`FeatureDecriptions/C_Coach Email
   Templates.md`) doesn't list this email. Is it shown, and is it switchable or "Always sent"?
6. **A text version** for families with texts on: not listed among the Phase 2 family texts
   (`FeatureDecriptions/SMS Messages.md`).
