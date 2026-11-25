# Spec: Cancellation reasons (Phase 2)

**Status:** Draft — 2026-11-16
**Sources:** ADR-009 decision 9 and Revisit if; ADR-MASTER §10 ("By the coach"), §13, §24;
`docs/architecture.md` §10 Phase 2+; `FeatureDecriptions/cancelation.md` ("Coach cancelation", "Phase 2:
Make different types of emails for cancelation"); `FeatureDecriptions/Email templates Needed:`
("Cancelation from Coach", "Phase 2: Cancellation reasons"); `FeatureDecriptions/C_Coach Time Off.md`;
`FeatureDecriptions/C_Coach Email Templates.md`
**Depends on:** Minimum Viable Product (MVP) coach cancellation (one lesson, a day, or the rest of the week, from the week view or
the rinkside page) and its "Lesson cancelled by you" email
**Out of scope:** time off and special schedules (schedule changes, with their own email); a family's
cancellation; the cancellation text to families (see `family-sms.md`)

## Summary
In MVP every coach cancellation sends families the same "Lesson cancelled by you" email. In Phase 2 the
coach picks a reason when cancelling (sick, emergency, vacation and similar) and each reason has its own
version of the "Cancelled by the coach" email. Almost everything beyond that is undecided; this spec
records what is fixed and lists the rest.

## Assumed in every example
- Coach Dana Whitfield, business email lessons@danawhitfieldskating.com.
- The Chen family: contact Grace Chen, skater Mia Chen, with lessons with Coach Dana on Monday 2027-01-11
  at 4:00 PM and Wednesday 2027-01-13 at 4:00 PM.
- Now is Monday 2027-01-11, 7:30 AM in the coach's time zone. Coach Dana woke up ill.

## 1. Picking a reason

**1.1 The coach selects the kind of cancellation**
- **Given** Coach Dana is on the week view for 2027-01-10 to 2027-01-16
- **When** Coach Dana selects "Cancel day" for Monday 2027-01-11
- **Then** before the cancellation is accepted she can choose its reason from a list that includes sick,
  emergency and vacation (where on screen the choice sits is open, question 5)
*(source: `FeatureDecriptions/cancelation.md`, "Phase 2: Make different types of emails for cancelation … and
allow the coach to select type of cancelation"; ADR-MASTER §24)*

**1.2 The family gets the version of the email for that reason**
- **Given** Coach Dana chose "sick" for Monday 2027-01-11
- **When** Coach Dana accepts the cancellation
- **Then** Mia's 4:00 PM seat moves to a `CANCELLED#` line with `cancelledBy = COACH`
- **And** the Chen family gets one email, the "sick" version of "Cancelled by the coach", listing the
  cancelled lesson with a link to book another time
*(source: `FeatureDecriptions/Email templates Needed:`, "Phase 2: Cancellation reasons — separate 'Cancelled by
the coach' versions the coach picks from: sick, emergency or vacation"; ADR-009 d9; `FeatureDecriptions/
cancelation.md`, "The cancellation email")*

## 2. Rules that must always hold
- Whatever reason is picked, each family still gets one email per cancellation, listing all its cancelled
  lessons, never one per lesson. *(ADR-006 d6; `FeatureDecriptions/Email templates Needed:`, "Cancelation
  from Coach")*
- The email says the lesson is cancelled and links to the open times; it suggests no specific time and
  moves nothing. *(`FeatureDecriptions/cancelation.md`, "The cancellation email")*
- A coach cancellation is never charged to the family, whatever the reason. *(ADR-MASTER §10, "General")*
- The coach-cancellation email is always sent and has no on/off switch. *(`FeatureDecriptions/C_Coach
  Email Templates.md`, "Lesson cancelled by you … Always sent")*

## Open questions
1. **The list of reasons.** The sources give "sick, emergency, vacation, etc". Is there an "other" or a
   plain "no reason given" choice, and is one the default?
2. **Is a reason required?** Can the coach cancel without picking one, and which email goes then?
3. **Free text.** May the coach add their own words? If so it must be HTML-escaped (ADR-MASTER §13) and
   can never reach a text message (ADR-007 d4).
4. **Where the reason is stored**: on the `CHANGEBATCH#` header (one reason per cancelling action) or on
   each `CANCELLED#` line, and its name and values. It would also feed the Phase 2 cancellation history.
5. **Which surfaces offer it**: the week view's one lesson, "Cancel day" and "Cancel rest of week"; the
   rinkside page's cancel section and the cancel on each lesson in its check-in list (which must stay quick
   at the rink).
6. **Vacation versus time off.** Vacation is the example for time off, a schedule change with its own
   "Schedule change" email (`FeatureDecriptions/C_Coach Time Off.md`). Is "vacation" also a reason on a
   coach cancellation, and does a time-off save get reason-specific wording?
7. **Each version's wording**, and what differs between them (an apology, a promise of make-up times?).
8. **The text-message version.** The Phase 2 cancellation digest says "were cancelled by your coach". Does
   the reason change it? It must stay a pointer of at most 160 characters (ADR-007).
9. **Whether to build it now.** ADR-009's Revisit if names the trigger: "coaches begin cancelling frequently
   enough that clients complain".
10. **The email templates page.** Are the reason versions previewed there as separate entries under "Lesson
    cancelled by you"?
