# Batch 13: Emails and scheduled jobs

**Built:** 2026-11-13 · merged by PR #39 · back to the [implementation plan](../implementation-plan.md)

This file is a finished record, kept as it was written at the time. What's still open lives in the root
`README.md` (gaps and shortcuts) and `AI/implementation-plan.md` (what's left to build). A section number such as §4
or §6 below means the plan as it was then: its conflicts (§4) and decisions (§6) are now in `AI/plan-history.md`,
and §7 meant these batch logs.

## The plan, as written before it was built

From the plan's batch table. Struck-out text is what was first planned; the text after it is what changed.

**Done** (branch `feature/batch-13-emails-and-jobs`, after Batch 11). Emails and scheduled jobs: booking confirmation (SC-11), cancellation and schedule-change notices (SC-13), the decline email (SC-9), the payment reminder after a check-in (`CheckInRecorded` / `NoShowRecorded`, G-33), the day-of reminder and the coach's morning email (G-34, on GSI2), the weekly unpaid reminder (7 days, every Monday until settled; ADR-018; on GSI3) and the nightly lesson roller (G-9). Adds GSI2 and GSI3 to the seats (rest of G-25). The end-of-day report is Phase 2 since 2026-11-11

**Held back by:** — (Question 4, R8, R10a, R10c and R10d ruled 2026-11-12; R10b 2026-11-11). Jobs are triggered by hand or a local timer, a listed shortcut

## Log

The full list, with what closes each one, is in the root `README.md`.

- **Rulings applied:** R8 (the coach's late-cancellation wording, by email; the text itself still waits on ADR-007 d8);
  R10a (the weekly unpaid email: 7 days, each lesson with date, time, skater and amount, no-shows labelled, *attendance not
  recorded* where nothing was recorded, listed every Monday until paid or waived); R10c (a no-show is listed at that
  skater's share); R10b (no end-of-day report: Phase 2); A10 (no approval email: Phase 2).
- **Built:** every MVP email in `design/harbor/email/templates.mjs` except the business-email confirmation (Batch 14) and
  the two Phase 2 ones (*skater approved*, *skater removed*): the booking confirmation; the payment reminder after a check-in;
  the coach's cancel, a schedule change's cancellations and new prices, and a lesson that passed before it could be
  cancelled; a family's late cancel, to the coach; the decline; the day-of reminder and the coach's morning email
  (`sched-day-reminder`, on GSI2); the weekly unpaid list (`sched-unpaid-reminder`, on GSI3); the shared lessons' invitation,
  *joined* (to both families), *declined*, *withdrawn*, *no longer available*, *keep or cancel*, *cancelled, no answer* and
  the staying family's *dates cancelled*. And `sched-lesson-roller`, which adds the lesson times the schedule makes up to the
  end of what's stored. Seats now carry GSI2 and GSI3 keys; paying or waiving removes GSI3, undoing a payment puts it back.
- **Closed:** SC-9, SC-11, SC-13 (but for the coach's text, G-3), SC-18, G-9, G-25, G-33 and G-34.
- **Shortcuts:** SC-20 the table's stream is stood in for by a wrapper on the local client and a router after each request;
  SC-21 emails go to an in-memory outbox per API, readable at `/api/*/local/outbox`; SC-22 the 7am, Monday and nightly jobs
  run on a local timer, with local routes to run them for any date, and the unpaid threshold is a local setting.
- **Gaps:** ~~G-37 the day-of reminder's design says one per family per day, the ADR one per lesson (built as the ADR says);
  G-38 a shared series, and a series change with several late dates, send one email per date.~~ *Both ruled 2026-11-13 by
  the owner and built on this branch (below).*
- **Rulings applied after review (owner, 2026-11-13):**
  - **G-37: the day-of reminder is one email per family per day**, listing each of that day's lessons (skater, time, length,
    rink, who it's shared with). ADR-002 decision 7 reversed; ADR-MASTER §13, ADR-006 d6's note, the email feature notes and
    the template's note updated.
  - **G-38: shared-lesson emails list every date they cover.** One invitation per invitation, one *joined* to each family per
    answer, one *declined*, *withdrawn* or *no longer available* per invitation, one *keep or cancel* per leaving family's
    change (each date with its own answer-by time), and one late-cancellation email to the coach per change batch. Each
    template is worded for one date or several (`oneLesson`, `lessonCount`, `lessons`). ADR-031 amended; ADR-MASTER §8 and
    §13, ADR-006's note, `FeatureDecriptions/Email templates Needed:`, `Schedule lesson split` and the email design's
    README updated; the SES templates and gallery rebuilt.
- **Settled while building (owner may override):**
  - **Emails are the SES template's name plus its data**, formatted in the coach's zone and currency (`Mon, Nov 16`, `6:00 AM`,
    `$50`, `$25.01`), as `design/harbor/email/README.md` asks; nothing is HTML-escaped by the sender, because SES escapes each
    value. Payment instructions are passed as lines.
  - **Every guard is claimed before sending and given back if the email isn't accepted**, so a failure is tried again and a
    success is never sent twice. Change lines are stamped `SENT` or `FAILED` (with the reason) per recipient; a retry skips a
    recipient whose lines are all `SENT`.
  - **One booking confirmation per family per booking request**, listing every date booked with that coach (ADR-MASTER §13
    guards each seat; the template lists several). A seat that joined through an invitation gets *joined* instead.
  - **New guards not in the ADR's lists:** `inviteEmailSent` and `joinedEmailSent` on a seat, `emailSent` on an ended
    invitation and on a pending leave.
  - **Change-batch headers carry `notes`** (not in the ADR): for *no answer*, who left and the answer-by time; for the staying
    family's *Cancel, no charge*, `kind = STAYING_CANCEL`, so that family gets *dates cancelled* and the coach nothing.
  - **An ended invitation records both families** (`clientId`, the invited one, and `invitedByClientId`), so *declined* and
    *withdrawn* know whom to tell; a withdrawal that can't name the invited family finds them from the coach's `STUDENT#`
    record, as `consumer-invite` does.
  - **A family's late cancel is late when its whole hours to the start are under the coach's notice** (24 for everyone, B6),
    from the line's `noticeHours`.
  - **The payment reminder isn't sent once the lesson is already paid or waived**, and a no-show sends none (ADR-MASTER §13
    names `CheckInRecorded` only). `NoShowRecorded` has no consumer in MVP.
  - **The day-of reminder takes every seat on the date**, whatever its time, as the 7am run would; the morning email groups
    the day's seats by start time (*"Sam R. & Leo M."*). A coach with no lessons that day gets none.
  - **One day-of reminder per family per coach per day** (G-37 says per family per day): every family email comes from its
    coach and replies go to that coach, so a family with lessons from two coaches that day gets one from each. The guard stays
    `remindedOn` on each seat: every seat in the email is claimed before sending and all are given back if it isn't accepted,
    so a re-run sends nothing twice and a failed reminder is sent whole the next time.
  - **How several dates become one email (G-38):** the invitation, *joined* and ended-invitation emails are grouped by the
    invitation's `inviteId`. Whichever lesson time the consumer runs for first reads the invitation's other seats (through
    GSI1, the family's own index) or ended records (`SEATEND#` with that `inviteId`), claims each date's own guard, and sends
    one email for every date it claimed; the other lesson times then find nothing left. *Keep or cancel* moves to the change
    notifier and is grouped by the leaving family's `CLIENT` batch, whose header is `EXECUTED` only after every date of it is
    written, with each date's guard still on its pending leave. On AWS the stream can deliver one request's dates in separate
    batches: a date written after the first email went is sent in an email of its own, but no date is ever in two emails or
    left out. The *no answer* email stays one per sweep batch (the sweep cancels each lesson on its own).
  - **The unpaid list takes lessons dated more than 7 days before the Monday** (a lesson exactly 7 days before waits a week),
    at each seat's share; the job runs for whatever date it's given, Monday or not.
  - **The roller lists coaches by scanning their profiles**; one coach's failure doesn't stop the rest. It only adds.
  - **Every email's link is to a page that asks to sign in**: My bookings, Book, the invitation (`#/invite/<inviteId>`),
    Payments, the calendar and the rinkside page, from the setting `bladebook.site-url`.
  - **Seats from before this batch** get their GSI2 and GSI3 keys on the next start of either API, and are marked
    `confirmationSent` (and, once checked in, `paymentReminderSent`), so their next write doesn't send a late "Booked".
  - **The rink in every email is Pelham Civic Center**, the only rink in MVP.
- **Checked in the running app (APIs on :8096 and :8097; table `bladebook-b13check`):** a coach signs up and saves a week →
  a family signs up and is approved → booking two dates puts one confirmation in `api-client`'s outbox, from *"Dana
  Whitfield via BladeBook"*, Reply-To the coach, $50 each → the same request again books nothing and emails nothing → the
  coach's cancel of one date puts *lesson cancelled* in `api-coach`'s outbox → the 7am job for the other date sends one
  reminder and one morning email with the rinkside link, and nothing on a re-run → the roller for a date 40 days on adds 116
  lesson times, then none → declining a second family's skater sends the decline → the booked seat has its GSI2 and GSI3
  keys and its guards. The shared-lesson emails, the late cancel, the schedule change, the payment reminder and the Monday
  list are checked in `NotificationServiceTest` against DynamoDB Local. **Not checked in a browser** (no page changed), and
  **nothing has been rendered by SES**: the template data is checked against the template's fields by hand.
  G-37 and G-38 (2026-11-13) are checked in `NotificationServiceTest` against DynamoDB Local: two families' reminders, a
  refused reminder sent whole on the retry, a three-week shared series' one invitation and one *joined* each, a two-date
  decline and withdrawal, and stopping a shared series asking the staying family once for all three dates. The rebuilt
  templates were rendered with their samples by the email build's own Handlebars subset.
