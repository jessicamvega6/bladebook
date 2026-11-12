# BladeBook — Implementation Plan

**Status:** Approved. The owner answered §6 and said **go** for Batch 1 on 2026-11-08.
**Written:** 2026-11-06
**Sources:** `docs/adr/ADR-MASTER.md` (current through ADR-033) and the ADRs it cites, the Harbor
screen designs in `design/harbor/`, `docs/architecture.md` §10 (MVP features 1–16),
`docs/Blockers-Before-Coding.md`, and the feature notes in `FeatureDecriptions/`.

---

## 1. Ground rules for this work

| Rule | How it's applied |
|---|---|
| Plan first | Nothing is built until the owner says **go**. |
| Small vertical slices | Each batch runs end to end: React page → `api-coach` / `api-client` → `core` service → repository → DynamoDB Local. A batch is done only when every layer works for that slice. |
| Commit between batches | When the owner says to move on, the previous batch is committed first. |
| Test-driven development (TDD) on `core/` | A failing test (red) first, then the least code that makes it pass (green). Code counts as working only once its tests are green. |
| Test focus | Happy path, sad path, error states and invalid input, and important boundaries first. |
| ADR vs screen conflicts | **Nothing that conflicts gets built.** Each conflict is listed as a gap (§4). How much a conflict holds back is Question 2 in §6. |
| Gaps and shortcuts | Listed in the **root `README.md`** only (owner, 2026-11-08: no panel in the websites). Writing a gap down doesn't count as building it. |
| Layout | `controller/`, `service/`, `repository/` (`core.data`), `dto/`, `domain/`, `config/`, `security/` and `exception/` packages, as already scaffolded. `core/` stays framework-free (ADR-001). |

## 2. Where the code stands today

- `backend/` is a Maven multi-module build: `core`, `api-coach`, `api-client` and `consumers`.
  Each module is only a skeleton: entry points, empty packages, a context-load test and ArchUnit
  layering rules. The skeletons and CI were committed in `0aac88b`.
- `web/` has three Vite entry points (coach, rinkside and family), each showing a placeholder
  `App.tsx`. `shared/api`, `shared/auth` and `shared/logic` are empty.
- **Java version:** the owner chose **Java 17** on 2026-11-06. `backend/pom.xml` and CI are on
  Java 17, and the ADRs were amended (see §6). The skeleton builds and starts on Java 17.0.10.

## 3. What can't be built end to end yet (blocked outside this work)

| Blocker | Effect on this plan |
|---|---|
| Infrastructure as Code (IaC) tool not chosen (CDK or Terraform); no AWS Organization or domain (Blockers 2, 22) | Nothing is deployed. "End to end" means **running locally**. |
| Amazon Cognito user pool doesn't exist yet | Signing in locally needs a stand-in. See Question 3. |
| Events (DynamoDB Streams → EventBridge) and scheduled jobs can't run locally | The consumers (emails, family-sync, link sync, deadline sweep, roller) are built later, or called in-process as a listed shortcut. See Question 4. |
| Rink-fee calculation undecided (`docs/Q_Rink-Fees.md`) | The financial page's rink-fee figure isn't built. Gross can be. |
| The family read allowlist and the gate-test rows for `LESSON#`, `SEAT#`, `SEATEND#` and GSI4 (Blockers 23, 24) | Booking can run on DynamoDB Local, which ignores Identity and Access Management (IAM) rules. The per-tenant credential rules are listed as a shortcut until the gate tests pass on real AWS. |
| Which function sends the coach's SMS opt-in confirmation (ADR-007 d8) | The coach's late-cancellation text isn't built. |
| Coach who is also a parent: no screen, no master section, questions 2–9 still open | Not built. |

## 4. ADR vs screen conflicts found (listed as gaps; not built)

Four read-only reviews compared the in-force ADRs with the Harbor screens. Where the two
disagree, the conflicting part is **not** built. Only real conflicts are listed; mismatches with
superseded ADR text are left out. `M` = `docs/adr/ADR-MASTER.md`. **Resolution** is the owner's
ruling (ADR or screen) and any ADR it changed; a conflict marked *Not ruled yet* stays out of
its batch. The accounts and people conflicts were ruled on 2026-11-06.

### Accounts and people

| ID | Conflict | ADR | Screen | Resolution |
|---|---|---|---|---|
| A1 | Profile photo upload is drawn for MVP; the ADRs make photos Phase 2 | M:294, M:1695 | `coach/app.js:134`, `coach/screens-money-profile.js:222-224` | ADR: initials only, no upload |
| A2 | The sign-up banner says families can't reach the coach until the business email is confirmed; the ADR says replies go to the login email until then | ADR-016:59-61 | `coach/app.js:141` | Screen: at sign-up, families can't reach the coach until a different business email is confirmed. **The coach code doesn't work until then**: `CODE#` is written only once the address is confirmed, or at once if the coach uses the login email. **Drawn 2026-11-06:** `today-code-pending`, `profile-details-code-pending`, and a "Not working yet" code card on `signup-4-confirm-email`. *ADR updated: ADR-016, ADR-MASTER §4.* |
| A3 | The SMS-alerts switch should be on the sign-up form; the screen has it on the profile only | ADR-016:189 | `coach/app.js:123-135` | Screen: on the profile only. *ADR updated: ADR-016, ADR-MASTER §4.* |
| A4 | The coach can edit a family's contact details; the family's profile is the source of truth and `coach-tenant` can't write `CLIENT#` | M:209-210, M:374-376 | `coach/screens-students.js:25,52-61` | ADR: read-only for the coach |
| A5 | "Texts on / Email only" shown for families; family SMS is Phase 2 | M:203 | `coach/screens-students.js:16,24,40` | ADR: left out |
| A6 | Coach cards show "rink · sport"; the code lookup returns only the name and photo key, and no such field exists | M:192, M:1267 | `client/screens-account.js:66,110,183,259,266` | ADR: coach name only |
| A7 | A guardian can add an adult skater; skaters a guardian adds are minors | M:335-336 | `client/screens-account.js:149,154,297` | ADR: guardians add minors only |
| A8 | US Figure Skating / Learn to Skate USA number: the ADR says digits only within a loose length range; the screen allows letters and digits, up to 20 | M:392-393 | `client/screens-account.js:19-28` | Screen: letters and digits, 1 to 20 characters. *ADR updated: ADR-029, ADR-MASTER §5.* |
| A9 | When adding a coach, a new skater can't join only that coach; the ADR lets the family choose new or existing skaters | M:370-371 | `client/screens-account.js:271,301,409` | Option (b): *Add a skater* always asks which coaches and allows "None of my coaches yet"; the skater then joins a coach through *Add a coach*. **Drawn 2026-11-06:** `profile-add-skater-no-coach`, `profile-add-skater-one-coach`, `profile-skater-no-coach`, `profile-add-coach-new-skater`. *ADR updated: ADR-025, ADR-MASTER §5.* |
| A10 | The screens promise an "approved" email that no ADR defines | M:1101-1117 | `client/screens-account.js:168,212,272,300` | **Phase 2.** MVP sends none, and the six MVP messages are reworded so they don't promise an email (for example "You can book once Coach Dana approves"). **Drawn 2026-11-08:** no family page promises an approval email. *ADR updated: ADR-002, ADR-MASTER §24.* |
| A11 | ADR-022's read allowlist lists `displayPaymentTypesToClients` but not the `accepts*` flags, so the coach card's payment types can't be read (defect inside the ADRs) | ADR-022:231-238 | `client/screens-account.js:181` | Fix the ADR: replace `displayPaymentTypesToClients` with the four `accepts*` flags. The gate-test row must be re-run on real AWS before the coach card's payment types count as done. *ADR updated: ADR-022, ADR-MASTER §16, gate-test script and runbook.* |

### Coach schedule and calendar

| ID | Conflict | ADR | Screen | Resolution |
|---|---|---|---|---|
| S1 | Price is whole dollars, USD only, with $0 allowed; the ADR wants the coach's currency and an odd-cents warning (e.g. $45.01) | M:487-489 | `coach/schedule.html:977` | ADR: the price is in the coach's currency, with the odd-cents warning when a block allows 2 or more skaters (ruled 2026-11-08) |
| S2 | Block labels are numbered by position; the ADR requires a stored `seq` that is never reused | M:482-484 | `coach/schedule.html:763,970` | ADR: each block gets a stored `seq` when created, never renumbered or reused; an unnamed block is labelled *Block N* from it (ruled 2026-11-08) |
| S3 | Times run 5:00am–11:00pm; the ADR says 12:00am–11:45pm | M:471-472 | `coach/schedule.html:871` | ADR: 12:00 AM to 11:45 PM in 15-minute steps (ruled 2026-11-08) |
| S4 | A new block is prefilled (6–8pm, 30 min, $50); the ADR says start, end, length and days are cleared | M:476-477 | `coach/schedule.html:1074` | ADR: a new block starts with start, end, length and days cleared (ruled 2026-11-08). **Amended 2026-11-09 by the owner:** start defaults to 5:00 AM and end to 7:00 PM; the time lists have no blank choice, so the times shown are the times saved |
| S5 | The block Name field always shows; the ADR asks for it only once a second block exists | M:484-485 | `coach/schedule.html:969-970` | Screen: the block Name field always shows, in a special schedule too (ruled 2026-11-08). *ADR updated: ADR-008, ADR-MASTER (The editor).* |
| S6 | The 7pm default end, length defaulting to 30, and slots past the end time are in the ADR but not on screen | M:479-481 | `coach/schedule.html:762,1016-1019` | ADR: the slots run to 7:00 PM when the end is blank, length becomes 30 when a slot is clicked with none set, and no slot runs past the end time (ruled 2026-11-08) |
| S7 | Clicking a month date opens the day view; the ADR says it opens that week | M:497 | `coach/screens-calendar.js:79` | Screen: on the coach's month calendar, clicking a date opens that day (ruled 2026-11-08). *ADR updated: ADR-006, ADR-MASTER (Calendars).* |
| S8 | "Cancel rest of week" doesn't state the range and count | M:931-932 | `coach/screens-calendar.js:118` | Neither: *Cancel rest of week* closes the rest of the Sunday–Saturday week from now on (all of a future week). Booked lessons and open lesson times all become `HELD`, with no release-or-hold question; the weekly schedule is unchanged. The button still states the range and count (ruled 2026-11-08). *ADR updated: ADR-009, ADR-MASTER (By the coach).* |
| S9 | "Release all" answers release-or-hold for the whole selection; the ADR asks per lesson | M:928-929 | `coach/screens-calendar.js:46,164` | ADR: release-or-hold is asked per lesson, never once for a selection, for *this lesson* and *this day* (*this week* always holds, S8) (ruled 2026-11-08) |
| S10 | The large-price-change warning is red and below the figures; the ADR says warning colours, at the top | M:833-835 | `coach/schedule.html:427-433,1039` | ADR: the warning sits at the top of the review page, in the warning colours (ruled 2026-11-08). **Redrawn 2026-11-08:** `coach/static/schedule-review.html` |
| S11 | Coach cancel: an unanswered invitation becomes `EXPIRED` on screen; the ADR moves seats to `CANCELLED#` | M:682-688, M:927 | `coach/screens-calendar.js:54` | Neither: in MVP the coach's cancel deletes the unanswered invited seat with no record and no email, and a later answer writes nothing. Recording it and telling the family is Phase 2 (ruled 2026-11-08). *ADR updated: ADR-031, ADR-MASTER (Seats; Ending an invitation; §24).* |
| S12 | The day view has no ADR (gap, not a conflict) | — | `coach/screens-calendar.js:124-144` | Screen: the day view as drawn (ruled 2026-11-08). Batch 2 builds it; its cancel buttons come with Batch 5. *No ADR text yet.* |

### Family booking and shared lessons

| ID | Conflict | ADR | Screen | Resolution |
|---|---|---|---|---|
| B1 | **The result page gives separate reasons ("taken", "no longer exists", "away"); the ADR requires one merged message so no family learns about another's booking** | M:575-576 | `client/screens-booking.js:514-515,631` | ADR: one merged message, *"That time was taken or no longer exists."* (ruled 2026-11-08; wording 2026-11-09) |
| B2 | Answer-by ignores the "7 days after the leave" limit | M:726-727 | `client/screens-booking.js:338-339` | ADR: answer by whichever comes first, the start of the notice period or 7 days after the leave (ruled 2026-11-11). **Redrawn 2026-11-11:** `client/screens-booking.js` (`bkAnswerBy`; new page `home-share-left-series`). *Feature notes already match: `cancelation.md`, `Schedule lesson split`.* |
| B3 | The staying family gets one card per lesson; the ADR wants one card per series with Keep all / Cancel all remaining | M:740-751 | `client/screens-booking.js:348-351` | ADR: one card per series, each date with its answer-by time, *Keep all* / *Cancel all remaining dates* (which confirms) and a choice per date (ruled 2026-11-11). **Redrawn 2026-11-11:** `client/screens-booking.js` (new pages `home-share-left-series`, `home-share-left-cancel-all`). *Feature notes already match: `cancelation.md`, `C_Client My Bookings.md`.* |
| B4 | A shared series still offers "end earlier" and "make less frequent" | M:758-762 | `client/screens-booking.js:413,455-463,597` | ADR: while any lesson still to come in the series is shared (joined or invited), the change page offers only *Cancel all future lessons*, with a note saying why; *End it earlier* and *Make it less frequent* come back once nothing is shared (ruled 2026-11-09). **Redrawn 2026-11-09:** `client/screens-booking.js` (new `recurrence-shared`). |
| B5 | The day view can step outside the booking window | M:544-549 | `client/screens-booking.js:155,159` | Neither, a new rule: the family's day view shows only days inside the booking window; previous and next stop at its edges (ruled 2026-11-08). *ADR updated: ADR-031 decision 3, ADR-MASTER (The booking window).* |
| B6 | Coaches have different notice periods; MVP fixes it at 24 hours (ADR-025 also says notice differs by coach, so the ADRs disagree with each other) | M:292, M:1687 vs M:608-610 | `client/app.js:31`, `client/screens-booking.js:23,424` | ADR, for MVP: 24 hours for every coach. Per-coach notice periods, and the *"Coaches can have different…"* pop-up line, are Phase 2 (ruled 2026-11-08). *ADR updated: ADR-025 d, ADR-MASTER (Booking with more than one coach; §24).* |
| B7 | The clash list stops at six; the ADR lists every clashing date | M:615-616 | `client/screens-booking.js:284` | ADR: every clashing date is listed (ruled 2026-11-11). **Redrawn 2026-11-11:** `client/screens-booking.js` (new page `book-confirm-many-clashes`). *Feature note already matches: `Bookings:`.* |
| B8 | Expired and "cancelled, no answer" come from stored status, not from the clock | M:774-775 | `client/screens-account.js:193,332-335,432-435` | ADR: the pages work out *expired* and *cancelled, no answer* from the clock, without waiting for the hourly sweep (ruled 2026-11-11). **Redrawn 2026-11-11:** `client/app.js` (`invStatus`), `client/screens-booking.js` (`bkNoAnswer`), `client/screens-account.js`; new pages `invite-expired` and `bookings-share-no-answer`. |
| B9 | The recurrence change doesn't name the late lessons | M:916-917 | `client/screens-booking.js:466` | Rule (`cancelation.md`): the warning names each cancelled lesson inside the notice period (*"Thu, Oct 15 · 4:15 PM is less than 24 hours away. Cancelling it may incur a late cancellation fee from Coach Ben."*), and the date list marks it *Cancelled · late* (ruled 2026-11-09). **Redrawn 2026-11-09:** `client/screens-booking.js` (new `recurrence-late`). |
| B10 | Shared-price wording reveals the seat count (low) | M:635-636 | `client/screens-booking.js:254` | ADR: a share is the price divided by the number of skaters, odd cents to the earliest joiners; no page says "half" (ruled 2026-11-11). **Redrawn 2026-11-11:** `shared.js` (`shareOf`, `splitPrice`), `client/screens-booking.js` (share box, cancel pop-up), `client/screens-account.js` (invitation price). *Feature note: `Schedule lesson split`.* |
| B11 | Invitation buttons say Go ahead / Decline; the ADR says Go ahead / Cancel (low) | M:671 | `client/screens-account.js:342` | Screen: the buttons stay **Go ahead** / **Decline**; ADR-025 d5 and the feature note now say decline (ruled 2026-11-11). *No redraw needed. Feature note: `FeatureDecriptions/Schedule lesson split`.* |
| B12 | Home says "repeats weekly" for any series; series repeat every 1–4 weeks (low) | M:580-581 | `client/screens-account.js:188` | ADR: Home says how often the series repeats (*"repeats weekly"* or *"repeats every N weeks"*), matching My bookings; the coach's day view is fixed the same way (ruled 2026-11-09). **Redrawn 2026-11-09:** `client/screens-account.js`, `client/screens-booking.js` (new `home-every-2-weeks`), `coach/screens-calendar.js`. |

### Attendance and money

| ID | Conflict | ADR | Screen | Resolution |
|---|---|---|---|---|
| R1 | **The rinkside page has Undo on a recorded outcome; correction is website-only** | ADR-014:337-339, M:1005 | `rinkside/screens-rink.js:29,72-77` | ADR: no Undo on the phone; a recorded outcome is corrected on the website's Lessons page (ruled 2026-11-09). **Redrawn 2026-11-09:** `rinkside/screens-rink.js`, `rinkside/app.js`. *Feature note: `FeatureDecriptions/Coach App`.* |
| R2 | Logging out deletes queued check-ins; M says they survive a sign-out (ADR-023 leaves explicit logout open) | M:1213 | `rinkside/screens-rink.js:19,194-196` | ADR: the queue survives a logout and sends after the same coach signs in again; each entry carries the coach's ID; logging out warns that they'll send at the next log-in (ruled 2026-11-09). **Redrawn 2026-11-09:** `rinkside/screens-rink.js` (log-out sheet, sign-in banner, new pages `signout-waiting` and `signin-waiting`). *Feature notes: `FeatureDecriptions/C_Rinkside Offline.md`, `C_Rinkside Account.md`.* |
| R3 | The "Not sent" list has only Dismiss; the ADR wants Record on the website / Done, 7-day removal and the wrong-clock case | M:997-1001 | `rinkside/screens-rink.js:58,135` | ADR: each entry has *Record on the website* and *Done*, is marked a day before it goes, and is removed after 7 days; only a wrong-clock entry is listed (ruled 2026-11-09). **Redrawn 2026-11-09:** `rinkside/screens-rink.js`. *Feature note: `FeatureDecriptions/C_Rinkside Offline.md`.* |
| R4 | A family cancellation is shown as a failure the coach must dismiss; the ADR says report it and clear it | ADR-014:194-199 | `rinkside/app.js:128-130` | ADR: a family's cancellation is reported and cleared, not listed as a failure; the lesson shows as cancelled on Today (ruled 2026-11-09). **Redrawn 2026-11-09:** `rinkside/app.js`. *Feature note: `FeatureDecriptions/C_Rinkside Offline.md`.* |
| R5 | The offline Week tab shows the whole week; only today is cached | M:968-969 | `rinkside/screens-rink.js:149-159` | ADR: the phone keeps today's lessons only; with no signal the Week tab shows no lessons, just "The week needs a connection" (ruled 2026-11-09). **Redrawn 2026-11-09:** `rinkside/screens-rink.js` (new page `week-offline`). *Feature notes: `FeatureDecriptions/C_Rinkside Cancel Several Lessons.md`, `Coach App`.* |
| R6 | The cancel dialog leaves out the date | M:940-941 | `rinkside/screens-rink.js:123` | ADR: the dialog names the skater, date and time, e.g. *"Cancel Leo M. · Today, Wed, Oct 14 · 10:00 AM?"* (ruled 2026-11-09). **Redrawn 2026-11-09:** `rinkside/screens-rink.js` (`today-cancel`, `today-shared-cancel`). |
| R7 | Payments lets a waived lesson be undone; waived is final | ADR-003:207-210, M:1030 | `coach/screens-money-profile.js:83,115` | ADR: waived is final. No Undo on a waived lesson, and *Waive* always asks for confirmation first; Undo stays on paid lessons (ruled 2026-11-09). **Redrawn 2026-11-09:** `coach/screens-money-profile.js` (new `payments-waive`). |
| R8 | The example late-cancellation text adds words the fixed template doesn't have | M:1128 | `coach/screens-money-profile.js:263` | **Not ruled yet** |
| R9 | Copy says rinkside "can only see today's lessons" | M:1174-1185 | `coach/app.js:81`, `rinkside/screens-rink.js:191` | ADR: the text says what the page is for, not what it can see: *"…shows today's lessons, attendance and cancelling"* and *"This page is for today's lessons, attendance and cancelling"*. The rinkside sign-in reaches every coach route (ADR-023 d2–3) (ruled 2026-11-09). **Redrawn 2026-11-09:** `coach/app.js`, `coach/screens-money-profile.js` (Profile → Account), `rinkside/screens-rink.js`. |
| R10 | MVP email wording differs: weekly unpaid reminder, end-of-day report, the Payments footnote, the financial-page caveat | M:1044, M:1061, M:1152-1160, M:1075 | `coach/screens-money-profile.js:100,178,388-393` | **Not ruled yet** |

## 5. Batches

Each batch is one vertical slice. **Conflicts the owner hasn't ruled on stay out of the batch and
appear in its gap list.** Batches are ordered so the first ones have the fewest conflicts.

### Batch 1 — Walking skeleton + coach profile and coach code (MVP 1, part)

- **Foundation, smallest possible:**
  - DynamoDB Local in Docker, and the one table created by a test helper.
  - Local sign-in stand-in (Question 3).
  - `shared/api` fetch client with the single retry on a server error.
  - Harbor CSS loaded.
  - ~~The "Gaps & shortcuts" panel component.~~ Built, then removed by the owner on 2026-11-08; the list is in the root `README.md`.
  - `GET /health`.
- **Core (TDD):**
  - `CoachCode`: generate 8 characters from the set with no look-alikes, shown as 4-4. Normalise case and dash. Reject the wrong length or characters.
  - Collision retry on the `attribute_not_exists` write.
  - `PaymentTypes`: a type can't be switched on without a handle; switching off keeps the handle.
- **Slice:** a coach (already signed in through the stand-in) completes the business-details step. This writes `PROFILE` and `CODE#`.
  - Profile → Details: name, phone, time zone, currency read-only.
  - Profile → Payments.
  - Coach code: show, copy, rotate.
- **Left out:** photo (A1) and the SMS switch at sign-up (A3), both ruled out. **Built from the rulings:** the business-email banner and the code's "Not working yet" state (A2). **Also left out (owner, 2026-11-08):** the business-email confirmation email and link. Batch 1 fully builds the *Use my login email* path, which writes `CODE#` at once. A different address leaves the code "Not working yet", and a **local-only "mark confirmed" action** stands in for clicking the link. That action is **listed as a shortcut** on screen and in `README.md` until batch 14 replaces it.
- **Settled by Claude (owner may override):** time-zone labels are stored as IANA names (e.g. "Central — Chicago" → `America/Chicago`). The Cognito-owned sign-up steps (create account, verify code) aren't built; the slice starts at step 3 behind the local token stub.

### Batch 2 — Weekly schedule and the coach's week and month views (MVP 3, 4, 9, part)

- **Core (TDD), shared fixture at the repo root, tested in Java and TypeScript:**
  - Slot expansion, including the daylight-saving, uneven-block and abutting-block cases.
  - Schedule-for-date resolution (an override, an empty override, or the default).
  - Block validation: end after start, at least one day, ice type required, no overlaps, lesson length from {30, 45, 60, 90, 120}.
  - Sunday–Saturday week arithmetic.
- **Slice:** the schedule hub, then the weekly editor, then save, then lesson times written for the window.
  - The coach's month view (previous/next) and week view showing Open.
  - With no bookings yet, save skips the impact preview. Shown as a shortcut until Batch 6.
- **Rulings (2026-11-08):** S1–S7 and S10 are all ruled (§4). S10 is in the save preview, which this batch skips until Batch 6. S12 (the day view) was ruled **Screen** when Batch 2 started, because S7 opens it.

### Batch 3 — Family sign-up with a coach code; coach approves or declines (MVP 1, 2)

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

### Batch 4 — Book one lesson (MVP 5, part)

- **Core (TDD):**
  - `BookingWindow`: today through the end of the month two months ahead, in the coach's time zone, with the edges tested.
  - Seat capacity.
  - Idempotency-key outcome classification (booked / already yours / unavailable).
  - Price share for one skater.
- **Slice:** pick a day, pick times, confirm, then results.
  - The coach's week view shows the skater's name.
- **Rulings (2026-11-08):**
  - B1: the results page gives one merged message for a failed date, never a separate reason.
  - B5: the day view shows only days inside the booking window.
  - **Redrawn 2026-11-08:** `client/screens-booking.js` (one message on the results page; the day strip stops at the window's edges) and `client/app.js` (every coach's notice is 24 hours).

### Batch 5 — Cancel one lesson, family and coach (MVP 7, 8, 10, part)

- **Core (TDD):**
  - `Notice.isLate`: strictly under 24 hours, tested at the boundary.
  - Cancellation record (`CANCELLED#`, `cancelledBy`).
  - Release-or-hold.
- **Slice:**
  - My bookings and the family's cancel dialog.
  - Coach cancels one lesson, a day, or the rest of the week from the week view, choosing release or hold per lesson.
- **Rulings (2026-11-08):**
  - B6: the notice period is 24 hours for every coach; `Notice.isLate` uses the lesson's stamped `requiredNoticeHours`.
  - S8: *Cancel rest of week* holds every booked lesson and open time left in the week.
  - S9: release-or-hold is asked per lesson for *this lesson* and *this day*. The rinkside whole-week cancel holds everything, like S8.
  - S11: the coach's cancel deletes an unanswered invited seat with no record or email; a later answer writes nothing.
  - **Redrawn 2026-11-08:** `coach/screens-calendar.js` (no *Release all*; *Cancel rest of week* states the range and count, and its new preview, `cancel-preview-week`, holds everything) and `rinkside/screens-rink.js` (*Cancel rest of week* on the Week tab, `week-all-confirm`).

### Batch 6 — Time off, special schedules, and the save impact preview (MVP 3, 6)

- **Core (TDD):**
  - The one schedule-change evaluator (add / remove / cancel / re-price; past lessons untouched; a default save skips temp dates).
  - Re-pricing rules (an increase only outside the notice period).
  - The 50% large-change warning, including old price = 0.
  - Odd cents.
  - Temp-overlap ranges.
- **Slice:** time off and special-schedule forms, then review (with the must-acknowledge warning), then save status.
- **Rulings (2026-11-12):**
  - The evaluator doesn't need to cover a change of `iceType` or `maxSkaters` on an `OPEN` time (owner).
  - Signing in again before a save works locally as shortcut SC-7 (Batch 2): the token stub gives a fresh sign-in, and the real 15-minute `auth_time` check runs against it. Time off and special-schedule saves use the same flow.

### Batch 7 — Rinkside attendance online, and lesson-list corrections (MVP 12 part, 13 part)

- **Core (TDD):**
  - Outcome time check: from 1 hour before the start to the end of the day, and not in the future.
  - Capture only while the seat is `BOOKED`.
  - `statusOf` (not recorded).
- **Slice:** rinkside Today (Present / No-show), contact on a tap (logged), then the coach Lessons page with its date range and corrections.
- **Rulings (2026-11-09):**
  - R1: no Undo on the phone; corrections are made on the website's Lessons page.
  - R6: the rinkside cancel dialog names the skater, date and time.
  - R9: the coach website and rinkside text says what the page is for, not that it "can only see today's lessons".
- **Left out:** nothing.

### Batch 8 — Payments (MVP 13, part)

- **Core (TDD):**
  - Money arithmetic in minor units, with odd cents going to the earliest skater.
  - Paid and waived transitions.
  - No totals across currencies.
- **Slice:** Payments, with a date range, the Unpaid/All switch, mark paid with how they paid, waive, and undo paid.
- **Ruling (2026-11-09):** R7: waived is final, with a confirmation before waiving. Undo is for paid lessons only.

### Later batches (planned after Batch 8, in this order)

| # | Batch | Holding it back |
|---|---|---|
| 9 | Recurring bookings and recurrence changes | — (B4, B9 and B12 ruled 2026-11-09) |
| 10 | Rinkside offline queue and service worker | — (R2, R3, R4 and R5 ruled 2026-11-09) |
| 11 | Shared lessons: share code, invite, accept, leave | The gate-test rows (B2, B3, B7, B8, B10 and B11 ruled 2026-11-11) |
| 12 | Financial page: gross and the summary CSV | Rink-fee method |
| 13 | Emails and scheduled jobs (confirmations, day-of, morning, end-of-day, unpaid reminder) | Question 4, R10 |
| 14 | Business-email confirmation: BladeBook's own email with a link to a page where the coach clicks Confirm; Resend gives a new link; the `CODE#` item is written on confirmation (ADR-016, A2). Replaces Batch 1's local stand-in | How the link is built and how long it lasts (ADR-MASTER §25). Proposed: a one-time random token, valid 24 hours |
| 15 | Family profile: *Add a skater*, with "None of my coaches yet", and *Add a coach* (A9; ADR-025 decision 2 and item k) | — |
| 16 | Coach Profile → *Visibility & texts*: show my phone to families, show my business email to families (ADR-MASTER §4, "What families see"; A3). Families see each only once the coach has approved one of their skaters, which Batch 3 already enforces. Added by the owner 2026-11-09, moved out of Batch 3 | The *Text me on late cancellations* switch waits on ADR-007 d8 (§3); the two contact switches don't |
| — | Coach late-cancellation SMS; coach who is also a parent | Blocked (§3) |

## 6. Decisions and open questions

**Answered by the owner, 2026-11-06:**

- **Conflicts:** before each batch, Claude lists only that batch's conflicts and the owner rules ADR or screen for each one. Anything unruled stays out and is listed as a gap.
- **Signing in locally:** a token stub that exists only in the local profile. It issues tokens with the right group and app-client claims, the real group and app-client checks run against it, and it's listed as a shortcut until Cognito exists.
- **Events locally:** consumer handlers are written for real, with tests. A local dispatcher calls them in-process after the write. Emails go to a log. Listed as a shortcut.

- **Java 17**, chosen over the ADRs' Java 25. Code uses nothing newer than Java 17: no pattern-matching `switch`, no record patterns, no sequenced-collection methods, no unnamed `_` variables.

**Java 17 follow-ups, done 2026-11-06 with the owner's approval:** ADR-001 amendment A10
(`java17.al2023`, the Java 17 runtime on Amazon Linux 2023, deprecated 2029-06-30, the same date
as `java25`), ADR-MASTER §1, `architecture.md` §2 and the glossary. SnapStart was already
withdrawn (ADR-001 A1), so nothing needs re-measuring. **Batch 1 (2026-11-08):**
`aws-serverless-java-container` 3.0.4 builds and starts on Java 17. Its Lambda handler isn't
exercised until something is deployed.

## 7. Gaps and shortcuts log

Started in Batch 1 and kept in the root `README.md`. Each entry names the
conflict or shortcut ID above, what was left out, and what would close it.

### Batch 1 (2026-11-08)

The full list, with what closes each one, is in the root `README.md`.

- **Shortcuts:** SC-1 local token stub for Cognito; SC-2 “I’ve clicked the link” confirms the
  business email locally; SC-3 DynamoDB Local with one unscoped client (no `coach-tenant` gate);
  SC-4 nothing deployed.
- **Gaps:** A1 photo and A3 sign-up texts switch (both ruled out); G-1 Resend link / Change
  address; G-2 Business email tab; G-3 Visibility & texts tab (contact switches moved to Batch 16 on 2026-11-09); G-4 Account tab; G-5 sign-up steps
  1–2; G-6 every other coach page; G-7 no warning before the 60-minute sign-in ends.
- **Settled while building (owner may override):**
  - An unconfirmed business email is stored as `pendingBusinessEmail`; `businessEmail` stays
    empty until it is confirmed, and the code works exactly when `businessEmail` is set. The
    attribute name isn't in the ADRs.
  - Time zones: the seven on the Profile → Details design are offered at sign-up too (step 3's
    design shows five).
  - Rotating a code that isn't working yet only changes the profile; its `CODE#` item is
    written when the business email is confirmed, with a new code if that one was taken
    meanwhile.
  - `api-coach` accepts Cognito **ID** tokens (`token_use = id`, app client in `aud`), since the
    login email is read from the token's `email` claim, which access tokens don't carry.
  - Field limits: names 50 characters, handles 60, payment instructions 1,000, phone 10–15
    digits.
- **Owner's changes, 2026-11-08** (these differ from the Harbor designs, which aren't redrawn):
  - Sign-up's time zone defaults to **Central — Chicago**.
  - A payment type's handle box shows **only while its switch is on**. Switching on no longer
    waits for a handle; Save refuses a type that is on with no handle (the ADR-016 d7 rule
    now applies when saving). Switching off hides the box and keeps the handle.
  - Handles carry a **prefix**, shown in front of the box and stored with the handle: `$` Cash
    App, `@` Venmo, `paypal.me/` PayPal. `core` adds it if it's missing and never doubles it.
- **Found while building:** `aws-serverless-java-container` brings
  `spring-cloud-function-serverless-web`, whose auto-configuration replaces Tomcat with a
  Lambda-only server, so `api-coach` and `api-client` never listened on :8080 / :8081 locally.
  The `local` profile now excludes it (`application-local.properties` in each API).

### Batch 2 (2026-11-08)

The full list, with what closes each one, is in the root `README.md`.

- **Shortcuts:** SC-5 the schedule-change consumer runs in-process after the save; SC-6 no impact
  preview before saving; SC-7 "Sign in again and save" uses the token stub.
- **Gaps:** G-8 time off and special schedules; G-9 no nightly lesson roller; G-10 booked lesson
  times left alone by a save; G-11 no names or cancel buttons on the calendars; G-12 no change-batch
  progress; G-13 a time-zone change doesn't move existing lesson times.
- **Settled while building (owner may override):**
  - **Reopening a saved week:** every block a template makes keeps the template's `seq`, so the
    editor regroups blocks by `seq` to rebuild each template. Its days, start, end and
    switched-off slots come back from the blocks. No new stored attributes. An uneven end is shown
    trimmed (6:00–11:30 at 45 minutes reopens as 6:00–11:15).
  - **Daylight saving:** a lesson time is made only if its start exists that day and it really
    lasts its length. So on the spring-forward day 2:00–2:59 AM makes nothing, and on the fall-back
    day the first 1:00 AM hour is used and a lesson that would run across the change isn't made.
  - **A new block** starts 5:00 AM to 7:00 PM with 1 skater per lesson; length, days, price and ice
    type start blank (S4 as amended 2026-11-09). A saved block with no end reopens showing 7:00 PM.
  - **Validation additions** the ADRs don't word: "needs a start time", "needs a lesson length",
    "needs an end time" (blank end from 7:00 PM on), "needs a price", "price must be under
    $10,000", "can have 1 or 2 skaters per lesson", and "Every time in … is switched off".
    Overlap messages use ADR-008's wording.
  - **Open lesson times are re-priced like booked ones:** a decrease at once, an increase only
    beyond the notice period.
  - **Ice types** are stored as `BFSC_FREESTYLE`, `STICK_AND_PUCK` and `PUBLIC`.
  - The `SCHEDULE#DEFAULT` item stores `days` as a map keyed `SUN` to `SAT`.
  - Save needs a sign-in within 15 minutes (`bladebook.auth.schedule-save-minutes`); refused with
    401 `SIGN_IN_TO_SAVE`, which the editor handles without losing edits.
  - Week view copy drops "Tap a booked lesson to cancel" until cancelling exists.
- **Checked in the running app:** sign-up → build two blocks (one slot switched off, odd cents
  shown, a clash shown) → review → save → week, month and day views, at desktop and phone width.


### Batch 3 (2026-11-09)

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

### Batch 4 (2026-11-11)

The full list, with what closes each one, is in the root `README.md`.

- **Rulings applied:** B1 (one message for every date that couldn't be booked, *"That time was taken or
  no longer exists."*), B5 (the day view and its arrows stay inside the booking window), B6 (the page
  shows the lesson's stamped notice, 24 hours for every coach).
- **Closed:** G-16 (the approved family's Home: *Book a lesson*, Today, Coming up, *Go to*; *Book a
  lesson* open in the menu). G-11 in part: the calendars name who is booked; the cancel buttons are
  Batch 5.
- **Shortcuts:** SC-11 no confirmation email (the result page keeps the designed wording, as SC-9 does);
  SC-12 the never-linked security event goes to the application log, with no access-log group or alarms.
- **Gaps:** G-20 repeating bookings (Batch 9); G-21 sharing at booking (Batch 11); G-22 the clash warning
  across coaches (not yet placed); G-23 My bookings (Batch 5); G-24 special schedules and time off on the
  family's pages (Batch 6); G-25 GSI2, GSI3 and `paymentStatus` on seats (Batches 8 and 13); G-26 ADR-022's
  allowlist for lesson-time and seat attributes.
- **Settled while building (owner may override):**
  - **The family website now gets the family's own IDs:** each skater's `studentId`, and the `coachId` of
    each coach who has approved one of its skaters. Batch 3 sent none; booking has to name both, and
    `ClientLinks.requireActive` checks them against the family's links (ADR-MASTER §16). A waiting
    family still gets no coach ID, so it reads nothing of a coach but the name.
  - **`ClientLinks.requireActive(caller, coachId, studentId)`** takes the coach as well as the skater
    (ADR-MASTER §16 names only the skater): a skater has one link per coach, and booking needs the one
    for that coach.
  - **A never-linked skater answers `404 NOT_FOUND`**, a new error kind (`NO_SUCH_ITEM`), so the website
    can't mistake it for a family with no account (`NO_ACCOUNT`, which sends it to sign-up).
  - **One booking page call returns the whole window** (about three months of one coach's times), so the
    months' counts, the calendar and the day views need no further reads.
  - **The booking transaction also checks the start and length the family read**, so the seat's copies of
    them are right; a time that changed since the read is *unavailable*. A time already taken skips the
    write and goes straight to the seat read.
  - **Limits:** up to 50 picks in one request; a repeated pick is dropped. A pick before today is refused
    with *"That date has already passed."* (the window's *"further ahead"* wording didn't fit).
  - **The seat's `studentName` is the display form, "Ava P."** (first name, last name's initial), as
    ADR-031 says; the coach's week view shows it, and the day view shows the full name and the family
    contact from the coach's own `STUDENT#` record.
  - **Home's Today uses each lesson's coach's time zone**, like every other date.
  - **Both booking pages name the time zone:** *"Times are in Coach Dana's time zone, Central — Chicago."*
  - **The result page's second button is *Back to home*** until My bookings exists (Batch 5); the design's is
    *View my bookings*.
  - **A booking request that fails is resent once by the website with the same key**, then offers
    *Try again*, which resends it again with that key; a refusal (409, 400) offers no *Try again*.
- **Found while building:** `CalendarService` needed a `StudentRepository` bean in `api-coach`, which
  Batch 3 had built inline; it is now a bean of its own.
- **Checked in the running app (APIs only; table `bladebook-b4check`):** a coach signs up and saves two
  blocks, one unnamed → a guardian signs up two skaters (no coach ID while waiting) → the coach approves
  one → the booking page (the coach's zone, today, the window, 100 times) → booking a real time and a time
  with no lesson (booked, and the one message) → the same request again (booked, nothing twice) → a new
  request for the same time (already booked) → the waiting skater (409, the product wording) → someone
  else's skater (404) → Home's lessons → the coach's calendar naming "Ava P.", "Ava Park", "Sarah Park".
  **Not checked in a browser**: no browser was available to this session.

### Batch 5 (2026-11-12)

The full list, with what closes each one, is in the root `README.md`.

- **Rulings applied:** B6 (late is strictly under the lesson's own `requiredNoticeHours`, 24 for every
  coach, tested at the boundary); S8 (*Cancel rest of week* holds every booked lesson and open time left
  in the week, with no question); S9 (release-or-hold asked per lesson, no *Release all*); S11 (an
  unanswered invitation on a cancelled lesson is deleted with no line; coded, and reachable once sharing
  exists in Batch 11).
- **Closed:** G-11 (Cancel on a booked lesson in the week and day views, *Cancel day*, *Cancel this day*,
  *Cancel rest of week*, and the cancel preview). G-23 (My bookings with its cancel pop-up; *My bookings*
  open in the menu and on Home's *Go to*; *All bookings* on *Coming up*; the price on Home's lesson rows; the
  result page's *View my bookings*).
- **Shortcuts:** SC-13 no cancellation email or late-cancel notice (the pages keep the designed wording, as
  SC-9 and SC-11 do); SC-14 a coach's cancel of several lessons is carried out as it goes, with no resume.
- **Gaps:** G-27 no attendance badge on *Recent* (Batch 7); G-28 cancelling from the rinkside page (Batch 7);
  G-29 nothing lists a cancellation afterwards.
- **Settled while building (owner may override):**
  - **Every coach cancel goes through the preview, one lesson too**, as the design draws it (ADR-MASTER §10
    asks it only for more than one lesson).
  - **A single lesson is one transaction** with its header and line already `EXECUTED`, as §9 says. A day or a
    week writes the header first, then each lesson on its own (SC-14).
  - **Cancel rest of week sends only its Sunday.** The server works out what it closes from the moment it
    runs: every booked lesson and open time that hasn't started, Sunday to Saturday. A time booked between
    the preview and *Cancel* is held too (S8); one that started meanwhile is left.
  - **A lesson that started or was cancelled since the preview is left alone and counted.** The message
    afterwards adds *"1 lesson had already started or gone, so it was left alone."* (not in the design). If
    nothing at all is left, the preview shows *"These lessons have already started or were cancelled."*
  - **A lesson can't be cancelled once it has started, or once the coach has marked it** (checked in or a
    no-show): *"This lesson has already started, so it can't be cancelled."* / *"Coach Dana has already marked
    this lesson, so it can't be cancelled."*, shown inside the pop-up.
  - **Asking to cancel a lesson that's already gone answers `ALREADY_CANCELLED`** and writes nothing, so the
    website resends a family's cancel once after a server error. The coach's cancel isn't resent.
  - **The line's `priceMinor` is the skater's share**; `noticeHours` is whole hours to the start, rounded down.
  - **The family's read of a lesson time now names `requiredNoticeHours`**, so the pop-up's late warning uses
    the lesson's own stamp (B6). Home's lessons now come with their price, the same shape as My bookings.
  - **My bookings' *Recent* looks back a year** (366 days) for the last four lessons.
  - **Headers written by the APIs are `planStatus = COMPLETE`** from the start; only the schedule-change
    consumer plans first.
- **Checked in the running app (APIs only; table `bladebook-b5check`):** a coach signs up and saves a week →
  a family signs up and is approved → three lessons booked → My bookings and Home list them at $50 with 24
  hours' notice → the family cancels one (cancelled, not late) → the same cancel again (already cancelled) →
  the coach cancels a day's lesson, held → *Cancel rest of week* holds the last booked lesson and 12 open
  times → the calendar shows every time held, and My bookings is empty. **Not checked in a browser.**


### Batch 6 (2026-11-12)

The full list, with what closes each one, is in the root `README.md`.

- **Rulings applied:** the owner's 2026-11-12 ruling (the evaluator leaves a booked lesson's ice type and skaters
  per lesson alone; signing in again before a save is SC-7, unchanged).
- **Closed:** SC-6 (the review before every save: lessons cancelled, re-priced and kept, the families emailed, and
  the big price change to tick); G-8 (time off and special schedules: the hub's card and list, *Add dates*, the
  time off form, the special schedule editor); G-10 (a save cancels and re-prices booked lessons through a change
  batch); G-12 (the save status page); G-24 (the family's day view: *"Dana is away (Fall break)"* and the special
  hours banner).
- **Shortcuts:** SC-5 now also covers the change batch, which nothing resumes after a failure; SC-13 widened to the
  schedule review and save status's email wording; SC-14 stays open (it needs the retried event, not this batch).
- **Gaps:** G-30 time off can't be edited and nothing can be deleted (not in the design); G-31 the review doesn't
  report a skaters-per-lesson change.
- **Settled while building (owner may override):**
  - **The 50% warning doesn't fire for a block that was $0**, as the design draws it (there's no percentage of
    nothing). Exactly 50% warns. Blocks are matched by their number; a new block has nothing to compare.
  - **A price increase reaches only lessons starting *later* than the notice period**, so one exactly 24 hours
    away keeps its price (ADR-020's "later than"). Batch 2's open-time rule was the same except at that exact
    instant; both now agree.
  - **A booked lesson the new schedule makes with a different length is cancelled**, and the new open time takes
    its place in the same transaction.
  - **A special schedule runs at most 31 days** (the editor shows one column per date); **time off at most 366**.
    A new one can't start in the past; an edit may keep a start that has passed (a camp that's running) but can't
    move it there.
  - **A special schedule's times switched off are kept per date**, as the design's editor does; its header stores
    its blocks so it can be opened again. Time off can't become a special schedule or the reverse.
  - **The review lists skaters by the seat's display name** ("Mia R."), as the design does.
  - **The weekly review doesn't report dates under time off or a special schedule**: a weekly change doesn't
    reach them. A dated change reports only its own dates, old and new.
  - **The save writes no change batch when no booking is touched**; the save status then says *"No families
    needed telling."* from the review's figures.
  - **The month view's chip for a special schedule shows its name** (the design's demo says *"Camp"*).
  - **Unnamed ones are called *"Time off"* and *"Special schedule"*** wherever they're named, as the design saves them.
- **Checked in the running app (APIs only; table `bladebook-b6check`):** a coach saves a week and a family books two
  lessons → the weekly preview of a $50 → $5 cut (2 re-priced, 1 family, the 90% warning) → time off on the first
  lesson's date previews that lesson (*"Ava P."*) → saving it cancels the lesson; the status is `EXECUTED`, 1
  lesson, 1 family → the calendar and the family's booking page name *"Fall break"* → My bookings shows one lesson
  at $50 → a weekly save at $40 re-prices it to $40. **Not checked in a browser.**
