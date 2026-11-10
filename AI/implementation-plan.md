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
| B2 | Answer-by ignores the "7 days after the leave" limit | M:726-727 | `client/screens-booking.js:338-339` | **Not ruled yet** |
| B3 | The staying family gets one card per lesson; the ADR wants one card per series with Keep all / Cancel all remaining | M:740-751 | `client/screens-booking.js:348-351` | **Not ruled yet** |
| B4 | A shared series still offers "end earlier" and "make less frequent" | M:758-762 | `client/screens-booking.js:413,455-463,597` | ADR: while any lesson still to come in the series is shared (joined or invited), the change page offers only *Cancel all future lessons*, with a note saying why; *End it earlier* and *Make it less frequent* come back once nothing is shared (ruled 2026-11-09). **Redrawn 2026-11-09:** `client/screens-booking.js` (new `recurrence-shared`). |
| B5 | The day view can step outside the booking window | M:544-549 | `client/screens-booking.js:155,159` | Neither, a new rule: the family's day view shows only days inside the booking window; previous and next stop at its edges (ruled 2026-11-08). *ADR updated: ADR-031 decision 3, ADR-MASTER (The booking window).* |
| B6 | Coaches have different notice periods; MVP fixes it at 24 hours (ADR-025 also says notice differs by coach, so the ADRs disagree with each other) | M:292, M:1687 vs M:608-610 | `client/app.js:31`, `client/screens-booking.js:23,424` | ADR, for MVP: 24 hours for every coach. Per-coach notice periods, and the *"Coaches can have different…"* pop-up line, are Phase 2 (ruled 2026-11-08). *ADR updated: ADR-025 d, ADR-MASTER (Booking with more than one coach; §24).* |
| B7 | The clash list stops at six; the ADR lists every clashing date | M:615-616 | `client/screens-booking.js:284` | **Not ruled yet** |
| B8 | Expired and "cancelled, no answer" come from stored status, not from the clock | M:774-775 | `client/screens-account.js:193,332-335,432-435` | **Not ruled yet** |
| B9 | The recurrence change doesn't name the late lessons | M:916-917 | `client/screens-booking.js:466` | Rule (`cancelation.md`): the warning names each cancelled lesson inside the notice period (*"Thu, Oct 15 · 4:15 PM is less than 24 hours away. Cancelling it may incur a late cancellation fee from Coach Ben."*), and the date list marks it *Cancelled · late* (ruled 2026-11-09). **Redrawn 2026-11-09:** `client/screens-booking.js` (new `recurrence-late`). |
| B10 | Shared-price wording reveals the seat count (low) | M:635-636 | `client/screens-booking.js:254` | **Not ruled yet** |
| B11 | Invitation buttons say Go ahead / Decline; the ADR says Go ahead / Cancel (low) | M:671 | `client/screens-account.js:342` | **Not ruled yet** |
| B12 | Home says "repeats weekly" for any series; series repeat every 1–4 weeks (low) | M:580-581 | `client/screens-account.js:188` | ADR: Home says how often the series repeats (*"repeats weekly"* or *"repeats every N weeks"*), matching My bookings; the coach's day view is fixed the same way (ruled 2026-11-09). **Redrawn 2026-11-09:** `client/screens-account.js`, `client/screens-booking.js` (new `home-every-2-weeks`), `coach/screens-calendar.js`. |

### Attendance and money

| ID | Conflict | ADR | Screen | Resolution |
|---|---|---|---|---|
| R1 | **The rinkside page has Undo on a recorded outcome; correction is website-only** | ADR-014:337-339, M:1005 | `rinkside/screens-rink.js:29,72-77` | ADR: no Undo on the phone; a recorded outcome is corrected on the website's Lessons page (ruled 2026-11-09). **Redrawn 2026-11-09:** `rinkside/screens-rink.js`, `rinkside/app.js`. *Feature note: `FeatureDecriptions/Coach App`.* |
| R2 | Logging out deletes queued check-ins; M says they survive a sign-out (ADR-023 leaves explicit logout open) | M:1213 | `rinkside/screens-rink.js:19,194-196` | ADR: the queue survives a logout and sends after the same coach signs in again; each entry carries the coach's ID; logging out warns that they'll send at the next log-in (ruled 2026-11-09). **Redrawn 2026-11-09:** `rinkside/screens-rink.js` (log-out sheet, sign-in banner, new pages `signout-waiting` and `signin-waiting`). *Feature notes: `FeatureDecriptions/C_Rinkside Offline.md`, `C_Rinkside Account.md`.* |
| R3 | The "Not sent" list has only Dismiss; the ADR wants Record on the website / Done, 7-day removal and the wrong-clock case | M:997-1001 | `rinkside/screens-rink.js:58,135` | ADR: each entry has *Record on the website* and *Done*, is marked a day before it goes, and is removed after 7 days; only a wrong-clock entry is listed (ruled 2026-11-09). **Redrawn 2026-11-09:** `rinkside/screens-rink.js`. *Feature note: `FeatureDecriptions/C_Rinkside Offline.md`.* |
| R4 | A family cancellation is shown as a failure the coach must dismiss; the ADR says report it and clear it | ADR-014:194-199 | `rinkside/app.js:128-130` | ADR: a family's cancellation is reported and cleared, not listed as a failure; the lesson shows as cancelled on Today (ruled 2026-11-09). **Redrawn 2026-11-09:** `rinkside/app.js`. *Feature note: `FeatureDecriptions/C_Rinkside Offline.md`.* |
| R5 | The offline Week tab shows the whole week; only today is cached | M:968-969 | `rinkside/screens-rink.js:149-159` | **Not ruled yet** |
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
- **Gaps to raise:** changes to `iceType` or `maxSkaters` on an `OPEN` time aren't covered by the evaluator, and nothing says how re-authentication works locally.

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
| 10 | Rinkside offline queue and service worker | R2, R5 (R3 and R4 ruled 2026-11-09) |
| 11 | Shared lessons: share code, invite, accept, leave | B2, B3, B7, B8, B10, B11; the gate-test rows |
| 12 | Financial page: gross and the summary CSV | Rink-fee method |
| 13 | Emails and scheduled jobs (confirmations, day-of, morning, end-of-day, unpaid reminder) | Question 4, R10 |
| 14 | Business-email confirmation: BladeBook's own email with a link to a page where the coach clicks Confirm; Resend gives a new link; the `CODE#` item is written on confirmation (ADR-016, A2). Replaces Batch 1's local stand-in | How the link is built and how long it lasts (ADR-MASTER §25). Proposed: a one-time random token, valid 24 hours |
| 15 | Family profile: *Add a skater*, with "None of my coaches yet", and *Add a coach* (A9; ADR-025 decision 2 and item k) | — |
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
  address; G-2 Business email tab; G-3 Visibility & texts tab (contact switches now in Batch 3); G-4 Account tab; G-5 sign-up steps
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

