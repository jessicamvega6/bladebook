# Batch 3: Family sign-up with a coach code; coach approves or declines

**Built:** 2026-11-09 · merged by PR #13 · back to the [implementation plan](../implementation-plan.md)

This file is a finished record, kept as it was written at the time. What's still open lives in the root
`README.md` (gaps and shortcuts) and `AI/implementation-plan.md` (what's left to build). A section number such as §4
or §6 below means the plan as it was then: its conflicts (§4) and decisions (§6) are now in `AI/plan-history.md`,
and §7 meant these batch logs.

## The plan, as written before it was built

- **Core (TDD):**
  - Registration-number shape. USA Hockey: 14 characters, with a check-digit setting. U.S. Figure Skating and Learn to Skate USA: letters and digits, 1 to 20 characters (A8).
  - Code-entry state machine, with several coach codes at sign-up (ADR-025 item h).
  - The waiting gate ("waiting" means no skater is `ACTIVE` with any coach).
- **Slice:** the code lookup (no sign-in), then the self path (an adult skater), then the guardian path, then a `PENDING` `STUDENT#` per skater per coach.
  - The coach's pending list: approve, approve all, decline.
  - The read-only student list with search.
  - The waiting family's Home and Profile.
- **Rulings applied (§4, all ruled 2026-11-06):**
  - A4: the coach's student list is read-only, with no *Edit contact*.
  - A5: no "Texts on / Email only" for families.
  - A6: the coach found by a code shows the coach's name only, with no rink or sport line.
  - A7: a guardian adds minors only.
  - A8: the number shapes above.
  - A10: no page promises an approval email. The family sees the approval the next time they open the website.
- **Shortcut:** the link-item sync (`consumer-student-link`) is called in-process (Question 4). The decline email isn't sent.
- **Not in this batch:** A9's *Add a skater* (with "None of my coaches yet") and *Add a coach* on the family profile. They're in Batch 15.

## Log

The full list, with what closes each one, is in the root `README.md`.

- **Rulings applied:** A4 (read-only student list), A5 (no "Texts on / Email only"), A6 (coach name
  only), A7 (guardians add minors only), A8 (number shapes), A10 (no page promises an approval email).
- **Shortcuts:** SC-1 widened to the family token stub and log-in; SC-3 widened to `client-tenant`
  and `code-lookup`; SC-4 widened to `api-client`; SC-8 `consumer-student-link` and
  `consumer-family-sync` run in-process; SC-9 the decline email isn't sent; SC-10 the family's
  "Create account" stores no password.
- **Gaps:** G-3 Visibility & texts not built (moved to Batch 16 by the owner, 2026-11-09); G-14 family step 3
  (verify email); G-15 changing the family's login email; G-16 booking on the approved family's Home;
  G-17 share codes; G-18 Add a skater and Add a coach (Batch 15); G-19 the rink download
  (ruled Phase 2 on 2026-11-09, with the name split when the file is made).
- **Settled while building (owner may override):**
  - **USA Hockey season check digit:** a setting of two values, its place among the number's nine
    digits and the digit, off until both are set (`bladebook.usa-hockey.check-digit-position` and
    `bladebook.usa-hockey.check-digit`). "The 4th digit" is read as the 4th *digit*, not the 4th
    character. A mismatch says "That isn’t this season’s USA Hockey number. Check the skater’s
    current card."
  - **Attributes the ADRs don't name:** the family profile keeps `firstName` and `lastName` as well
    as `clientName`; `STUDENT#` records carry `studentId`, `isMinor`, `clientRelationship` and
    `signedUpAt`; the link item's status is `studentStatus`, with `coachId` and `studentId`.
  - **Limits:** up to 10 skaters in one sign-up, a skater's full name up to 80 characters, and a
    sign-up refused if it would write more than 100 items (one transaction).
  - **A family's mobile number is required.**
  - **Codes:** a code that can't be a coach code (a share code, a letter O) answers "no such coach",
    the same as an unknown one, so the two can't be told apart.
  - **Coaches are listed by name** on the family's pages (links are keyed by random coach IDs, so
    there's no sign-up order to keep).
  - **Approving twice is harmless; declining an approved skater is refused** (409).
  - **The Students tab is sorted by family contact, then skater** (owner, 2026-11-09); Waiting for
    approval stays in sign-up order.
  - **Wording the designs don't give:** "Enter the skater’s member/registration number.", "Pick at
    least one coach for Ava Park.", "Add at least one skater.", "You’re already signed up. Log in
    to see your account.", and the coach's "No students yet" empty state.
  - **An email that already has a family** is refused on step 2 ("You already have an account with
    this email", with Log in instead), as Cognito's sign-up will; the stand-in checks for an existing
    family itself (owner, 2026-11-09).
  - **Step 4 for an adult skater:** "Change who the lessons are for" goes back to step 2 with the
    guardian option chosen, as the design does. *Owner, 2026-11-09:* "I’m 18 or older" starts
    unticked and must be ticked before sending (the design drew it ticked and inert); the design and
    `FeatureDecriptions/Client Sign Up` are updated to match.
  - **Password rules** checked in the browser follow the design's list (8 characters, upper, lower,
    number, symbol); the real rules are the Cognito user pool's.
  - **The decline dialog keeps its designed wording** ("gets an email") although locally no email
    is sent (SC-9).
  - **A skater with no coach** (declined by their only coach) shows "Not with a coach yet", as the
    design does for a skater added with no coach.
- **Found while building:** four Batch 1 files export plain values or functions next to their
  components (`SignupBusiness.tsx`, `LocalSignIn.tsx`, `PaymentTypeRows.tsx`, `Shells.tsx`), which
  makes Vite reload the page instead of updating it in place, as `ICE_TYPES` did. Not changed.
- **Checked in the running app:** two coaches; a guardian signs up two children with both coaches,
  one skater with one coach only, and a USA Hockey number refused then fixed → waiting Home and
  Profile → the coach's Today card and nav count → decline one skater, approve the other → the
  family's approved Home and Profile → a contact change reaching the second coach. At desktop and
  phone width.
