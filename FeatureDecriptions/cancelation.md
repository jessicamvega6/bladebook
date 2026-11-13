*Updated 2026-10-12 to match the Harbor design (bookings-cancel.html, recurrence.html, calendar-week.html, cancel-preview.html). The design is the source of truth.*
*2026-11-08: the product rules from ADR-009 (Cancellation) and ADR-015 (Late cancellation and no-show charges) were moved
here; the ADRs keep only the architecture.*

Why cancellation exists *(from ADR-009 Context, moved 2026-11-08)*: before ADR-009, BladeBook could create bookings and
destroy them only as a side effect of a schedule change. A client who could not make Tuesday had no recourse in the
product. A coach who woke up ill had to edit their schedule pattern — permanently changing their availability — to
cancel one day of lessons. The rules below are business decisions made by the owner, recorded so the reasoning is not
relitigated.

Client cancelation:
Within 'My bookings' section by each lesson item there is a cancel button. on click of the cancel a confirmation pops up asking if they are sure they want to cancel. This will cancel that particular booking and release that time slop back into the available slots
There will be a note that says bookings canceled within ~~24 hours~~ *the coach's notice period (24 hours in the design)* may incur a late cancelation fee. 
*Design:* the confirmation shows the lesson (day, time, length, price). Inside the notice period the note becomes a warning:
  "Inside the N-hour notice period. <coach> may charge a late cancellation fee."
  It says the time goes back on the coach's calendar and the coach will be told *if it's a late cancellation (revised 2026-10-13)*, and, for a repeating lesson, that other
  lessons in the series aren't affected. Buttons: "Keep lesson" and "Cancel lesson".
*From ADR-009 decision 2:* In My Bookings, each lesson carries a cancel button. Clicking it raises a confirmation.
  Beside the confirmation: "Bookings cancelled within 24 hours may incur a late cancellation fee."
  This wording stays for MVP (owner, 2026-09-29). From Phase 2, when the charge switches on, ADR-015 decision 6
  replaces it with the coach's own threshold and the booking's stated fee (see "Late-cancellation and missed-lesson
  fee" below). *Ruled by the owner 2026-11-09.* The design's wording stands: "Inside the N-hour notice period. <coach> may charge a
  late cancellation fee." N is the coach's notice period, which is 24 hours for every coach at first, so the MVP
  screen reads the same as the fixed 24-hour line above.
  *(from ADR-009 §2, moved 2026-11-08)*
*Shared lessons (owner, 2026-10-13; ADR-026; bookings-cancel-shared.html, home-share-left.html):* either family can cancel
  their skater's place, with the same rules whichever family booked it. The pop-up shows their share of the price.
  In time: the other family is asked to keep it as a private lesson at the full price, or cancel with no charge.
    They see a card on Home and My bookings; no answer by ~~the start of the notice period~~ *the answer-by time* cancels it, no charge.
    *Changed 2026-10-13 (ADR-031 decision 8): the answer-by time is whichever comes first, the start of the notice
    period or 7 days after the other skater left. An unanswered lesson is cancelled with no charge by the hourly check.
    *Owner, 2026-11-11 (B8):* the pages don't wait for that check. Once the answer-by time passes, My bookings shows
      the lesson as "Cancelled, no answer" with no charge, and the card is gone. An invitation still unanswered when its
      lesson starts shows "This lesson is no longer available" at once.
    Both emails ("keep at full price or cancel", "cancelled, no answer") are always sent.*
  Late: the one cancelling may be charged their share of the late-cancellation fee (half, for two skaters); the other skater keeps their share of the price.
  *Added 2026-10-13 (ADR-031):*
  The time goes back on the coach's calendar only when the last skater in it has gone.
  The staying family's card:
    Remaining dates are the dates this leave freed that the staying family hasn't answered yet and that are still
      waiting: not started, answer-by not passed, not cancelled by the coach. Only dates left in time count.
    One date: the ordinary card. Keep it private at the full price, or cancel with no charge.
    More than one date: one card for the series. It lists each date with its answer-by time and the totals, and has
      "Keep all remaining dates", "Cancel all remaining dates" and a keep-or-cancel choice per date.
      "Cancel all remaining dates" asks for confirmation first: "No charge. This can't be undone."
    Cards are merged per series: dates still waiting from earlier one-off cancels by the same skater join the series
      card, each keeping its own answer-by time.
    Keep all and cancel all check each date again first. A date that has started, or was already answered or
      cancelled, is skipped and listed as no longer available.
    Cancelling all sends the family one email listing the cancelled dates. The coach isn't emailed, because none of
      these cancellations is late.
    A lesson the family keeps becomes a freed place, and can take a new skater (see 'Schedule lesson split').
  *Added 2026-10-13 (ADR-031 decision 5, option B):* ~~If the inviting family cancels before the other skater has joined, the invitation ends: at once if it wasn't answered yet, or within the hour (the invited family is emailed) if they'd accepted.~~ Withdrawing is only possible before the other family answers.
  *Changed 2026-10-20 (ADR-033 d4):* If the inviting family cancels while the invitation is still unanswered, it ends at
    once. If the invited family has already accepted, the cancel is an ordinary leave, in time or late (ADR-033 d4).




Client recurrence management:
Within the 'My bookings' sections there will also be a button to modify reoccuring lessons. 
This will allow the client to change the end date of the reoccuring lessons to a date earlier than currently selected. Or cancel all future lessons. Future lessons do not include that day's lesson if one exists. 
There will also be a button the change the reoccuring frequency, you can change it to less frequenct but never more frequent. 
*Design:* one page per series ("Change", from My bookings) with three choices:
  End it earlier: a new last date, which must be before the current last date and not before today.
  Make it less frequent: only the less frequent options are listed (every 2, 3 or 4 weeks). Already every 4 weeks: nothing to pick.
  Cancel all future lessons: from tomorrow on; today's lesson is kept.
  Beside the choices, "What this will do" previews every affected date as Kept or Cancelled, with the totals.
  Warnings: if a cancelled lesson is inside the notice period, a late fee may be charged; cancelled times are released
  for other families and switching back won't get them back.
  The button reads "Cancel N lessons" and is disabled until the choice is valid and cancels at least one lesson.
  To add lessons, the family books again.
*Shared series (added 2026-10-13, ADR-031 decision 9):* while a series is shared, only "Cancel one lesson" and "Cancel
  all future lessons" are offered. "End it earlier" and "Make it less frequent" are hidden. A series is shared while any
  future lesson in it has another skater, joined or invited. Once none does, both choices come back. Filling a freed
  date makes it shared again until that lesson is over.
  Either family cancelling follows the shared-lesson rules above, for each date.
*Rules (from ADR-009 decision 4):* also in My Bookings, a control to modify a recurring arrangement, offering exactly
  three operations:
  Move the end date earlier. Lessons after the new end date are cancelled as one batch. The end date may only move
    earlier.
  Reduce the frequency. The interval in weeks may only increase — weekly to fortnightly, never the reverse. Lessons that
    no longer fall on the new interval are cancelled as one batch. (The interval is 1 to 4 weeks; which lessons survive
    is set out in ADR-009 decision 4b.)
  Cancel all future lessons. Every remaining lesson is cancelled.
  *Amended 2026-10-13 by ADR-031 decision 9:* while a series is shared — any future lesson in it has another skater,
  joined or invited — a family can only cancel one lesson or cancel the series. Move the end date earlier and reduce
  the frequency are hidden, and come back once no future lesson is shared.
  "Future" excludes today's lesson, if one exists. A client cancelling their arrangement on a Tuesday keeps that
  Tuesday's lesson; dropping it requires the per-lesson cancel. This makes the boundary explicit rather than leaving
  "future" to mean whatever the implementation's clock says.
  *Added 2026-09-29.* Late lessons carry the same fee notice as a per-lesson cancel. All three operations can cancel a
  lesson inside the coach's late-cancellation threshold — "future" excludes only today, so ending an arrangement on
  Monday evening cancels Tuesday's lesson too. From Phase 2 such a lesson is charged exactly as a late per-lesson cancel
  would be (ADR-015 decision 1a); lessons beyond the threshold never are. So the confirmation names any lesson inside
  the threshold and states that cancelling it "may incur a late cancellation fee". MVP uses that "may" wording and
  collects nothing; whether Phase 2 makes it definite is decided then.
  Both restrictions are one-way and irreversible. A client who drops to fortnightly and later wants weekly again has no
  path back — the times in between were released and may be held by someone else by then. A client who wants more
  lessons books another recurrence.
  *(from ADR-009 §4, moved 2026-11-08)*




Make note for phase 2
For phase 2, clicking the lesson slot on the Week view if the booking belongs to the client clicking will give the option to cancel, also have cancel confirmation)
For phase 2, on coach registration & profile, have a checkbox to indicate if the coach has a late cancelation fee. And if the couch does have one then that note is changed from 'may' to 'will'
  *ADR-009 decision 3 sketched the same: "Phase 2: a checkbox on the coach profile declaring that they charge a late
  fee, which changes the client-facing wording from 'may incur' to 'will incur.'" Superseded 2026-08-30 by ADR-015: the
  checkbox is replaced by a per-block missed-lesson fee, where 0 is the off switch (see "Late-cancellation and
  missed-lesson fee" below).* *(from ADR-009 §3, moved 2026-11-08)*
An email is sent to the coach when a client shortens or cancels their reocurring bookings. *MVP per ADR-009 d9, only inside the notice period.* 
*Confirmed by the owner 2026-10-12: only inside the notice period. The design matches: the email template, the coach's
profile ("You get an email when a family cancels inside your notice period") and the family's cancel pop-up, which says
the coach will be told only for a late cancellation.*

Coach told about a client cancellation:
*From ADR-009 decision 9 and Open:* when a family cancels, the coach is told — the family already knows.
  *Settled 2026-10-08 from Kim (Items to ask Kim About.md §2):* only when the cancellation is inside the coach's notice
  period, by email and, if opted in, by text. Before that: deferred by the owner, 2026-08-25. The owner's note read
  "cancellation from student day of (check if needed)", which suggested a threshold. Until it was settled every client
  cancellation was to be sent — the safe default, since a missed same-day cancellation is the expensive failure and an
  extra email is not. Any threshold was to be the coach's notice period, the same one the fee uses, or the product ends
  up with two different definitions of "late."
  The coach also gets a text when a family cancels late, in MVP. *Decided by the owner, 2026-09-30.* A coach at the
  rink reads texts, not email.
    Only if the coach has opted in. A checkbox at signup and on the profile — "Text me when a family cancels late"
      (label amended 2026-10-09 to match the 2026-10-08 notice-period rule) — unticked until the coach ticks it,
      because carriers do not accept pre-ticked consent. Ticking it sends a one-time opt-in confirmation text to the
      coach's phone (ADR-007 decision 8).
    One text per cancellation, like every other message here — a family ending a recurrence produces one text, not
      twelve.
    *Amended 2026-10-08:* only cancellations inside the coach's notice period, email and text alike.
  *(from ADR-009 §9 and Open, moved 2026-11-08)*


Coach Week view: shows the coach the schedule for that week listed by timeslots and shows the unbooked slots with Open and the booked slots with the students name. 
*Design:* held slots show "Held". Past lessons are greyed and can't be cancelled. Each day heading opens the day view
(see C_Coach Day View.md). A time-off day says "Time off" with its name; a special schedule day shows its name.
Month / Week / Day switch, previous and next week, and a Today button.

Coach cancelation:
In week view there will be multiple ways to cancel. 
1) cancel everything that day. (ex sick)
2) cancel ~~entire week~~ *the rest of the week* (ex emergency came up). *Design: "Cancel rest of week" button.*
3) cancel per lesson (ex forgotten appts). *Design: click a booked lesson.*
*Design: day cancel is the "Cancel day" button under each day.*
each cancelation will ask the coach if they want to release the time slot back for rebooking or keep it unbook able. If coach says to keep the slot unbookable, then the slot(S) ~~is assigned to the coach~~ *becomes a held lesson time: closed to families, with no skater in it (changed 2026-10-13, ADR-031 decision 1)*. The default/temp schedule is not changed. 
*Design:* the choice is made per lesson on the confirmation view: "Release for rebooking" or "Hold — keep closed"~~, with a
"Release all" link~~. A held time stays closed to families.
*Changed 2026-11-08 (owner; ADR-009):*
  - The release-or-hold choice is asked one lesson at a time, never once for all of them. There is no "Release all" link.
  - "Cancel rest of week" doesn't ask. It cancels everything left in the week, Sunday–Saturday, from now on (all of a
    future week): every booked lesson and every open time is held closed. The weekly schedule doesn't change, so the
    next week is untouched. The button says the dates it covers and how many booked lessons and open times it closes.
  - The rinkside page's whole-week cancel works the same way.
  - A shared-lesson invitation that hasn't been answered when the coach cancels the lesson is quietly removed: no
    record, no email. If the family answers later, nothing is written and they see "no longer available".
    *Phase 2:* record it and tell the invited family.

For cancelation types 1 & 2, only cancel the lessons that have not happened yet. 
*From ADR-009 decision 7:* a coach cancelling "everything today" at 2pm does not cancel the 9am lesson that already took
  place. Day and week scopes work from now forward, not backwards.
  "This week" is the Sunday–Saturday week the coach is looking at, from now on. *Decided by the owner, 2026-09-30.* It
  follows the week view, so the button can never cancel a different set of days from the ones on screen.
    Mid-week: on a Wednesday afternoon, it cancels Wednesday's lessons that have not started yet, through Saturday. The
      following Sunday is untouched.
    A future week: viewing a later week cancels all of that week.
    Already started, checked in or marked a no-show: kept.
    The button states the range and count before the preview: "Cancel remaining lessons Wed 14 – Sat 17 (6 lessons)."
  *(from ADR-009 §7 and Open, moved 2026-11-08)*


A confirmation view will show to the coach on all cancelation actions. This will present any bookings that will get canceled. A message will display to the coach that on accept cancelation emails will be sent to clients with canceled bookings. The coach must accept before any bookings are canceled. 
*Design:* the confirmation view shows the count cancelled, held closed, and families emailed; that each family gets one
email listing their cancelled lessons with a link to book another time; that repeating lessons in other weeks aren't
affected; and that a cancellation can't be undone. Buttons: Back and "Cancel N lessons". Afterwards the week view shows
a message with the counts, the released times back to Open and held times as Held.
*From ADR-009 decision 8:* every cancellation larger than a single lesson shows the affected bookings before anything
  is cancelled, states that accepting will send cancellation emails, and requires the coach to accept. It is the same
  preview-then-accept step the schedule editor uses for schedule changes, and should use the same list.
  *(from ADR-009 §8, moved 2026-11-08)*
*The cancellation email (owner, decided 2026-08-15):* the lesson is cancelled, not "needs rebooking". The message carries a link to
  the open times if the family wants a different time. The system doesn't guess which other time a family can make: no
  specific times are suggested and nothing is moved for them.
  One message per family per schedule change, listing all their cancelled lessons, not one per lesson.
  *Phase 2 (SMS to families is Phase 2, ADR-007):* the text message states how many lessons were cancelled and the date
  range, and points to the email, because a list of lessons doesn't fit in one 160-character text.
  *(from ADR-006 §5 and §6, moved 2026-11-08)*
*A booking made between the coach's preview and save (Kim's answer to Items to ask Kim About §7, option B, 2026-10-08; owner, 2026-10-09):*
  The save goes ahead without asking the coach. A booking made since the preview that the change cancels is cancelled like the rest.
  In MVP its family gets the ordinary cancellation email.
  *Phase 2:* a separate "just booked" email: "Coach updated their schedule just as you booked. Here are other open times."
  To be reconsidered if feedback supports that this is an issue.
  *(from ADR-006 Status, amendments 2026-10-08 and 2026-10-09, moved 2026-11-08)*


Phase 2: Make different types of emails for cancelation (sick, emergency, vacation, etc) and allow the coach to select type of cancelation. 
*From ADR-009 Revisit if:* revisit if coaches begin cancelling often enough that clients complain, which would make
  cancellation reasons (the Phase 2 email templates) and coach-side reliability measures worth building.
  *(moved 2026-11-08)*


All cancelations will be tracked showing who canceled, and if possible the time slots that were canceled.
*Does a family see their own cancellation history, or only the email at the time?* Settled 2026-10-12 by the owner: yes,
  in **Phase 2**. MVP stays email only.
  *(from ADR-006 Open, moved 2026-11-08)*

Business decision: there is no rescheduling, the option is to rebook-then-cancel
*From ADR-009 decision 10:* moving a lesson is not an operation. The path is rebook, then cancel — in that order. The
  order is the point, not incidental. Booking the new slot before releasing the old one means a client who finds their
  preferred alternative already taken still has their original lesson. Cancel-first risks losing both, and the screens
  should not present it that way. Revisit if clients ask to reschedule as one action: this is a business decision, not a
  technical constraint, and rebook-then-cancel already contains both halves.
  *(from ADR-009 §10 and Revisit if, moved 2026-11-08)*
Mark this as a phase 2 feature: A coach books on a client's behalf.



Cancelations cannot happen on bookings in the past or happening now. 


Late-cancellation and missed-lesson fee:
*Moved 2026-11-08 from ADR-015 (and the fee parts of ADR-009). The charge itself is Phase 2; in MVP the fee is $0 and
nothing is collected.*

Why one fee covers both *(from ADR-015 Context and decision 1)*: two questions had been open separately — is a no-show
  owed, and does a late cancellation cost anything? Answering them apart produces a loophole that a family finds
  quickly: if cancelling three hours out costs money and simply not appearing does not, the rational move is to stop
  cancelling. The no-show is strictly the cheaper option, and it is also the one that costs the coach most — they
  travelled to the rink and waited. They are the same question: a no-show is a cancellation with zero notice.
  *Decided by the owner, 2026-08-30:* both a late cancellation and a no-show incur a charge, under one rule. This is
  what closes the loophole, and why the two must not be separated later: any future change to one that is not applied
  to the other re-opens it.
  Before ADR-015 (ADR-009 decision 3, 2026-08-23), the fee was a notice, not a charge: client-facing wording only.
  ADR-009's consequence, still true for MVP: the notice is honest about what it is. It warns, and it records enough for
  a coach to act, and it does nothing else. That is the right amount for a system that does not move money, but it does
  mean a client can cancel ten minutes before a lesson and the product's only response is a line in a list.

Who is charged *(from ADR-015 decision 1a, decided by the owner 2026-09-29)*: only the family's own late cancellation —
  from any screen — and a no-show.
  | Cancellation | Charged? |
  |---|---|
  | Per-lesson cancel in My Bookings | If late |
  | Recurrence management — end date earlier, reduce frequency, cancel all future | Only the lessons that are late — in practice at most the next one or two |
  | Coach cancels a lesson, day or week, from the website or the rinkside app | Never |
  | Schedule change | Never |
  | No-show | Yes — it is the client's booking, and it keeps it |
  Coach and schedule-change cancellations are never charged. The coach made the decision; billing the family would be
  charging them for the coach's cancellation. A family's cancellation made with enough notice is never owed, in any
  phase (ADR-009 decision 11).
  Which screen the client used does not matter. A late cancellation costs the same whichever button made it, so a
  client cannot drop tomorrow's lesson free by ending the arrangement instead of using the per-lesson cancel.
  Recurrence management must say so before the client accepts. It is a bulk action, so a fee on it must not arrive as a
  surprise. When any lesson it would cancel is inside the coach's threshold, its confirmation names that lesson and
  states that cancelling it "may incur a late cancellation fee" (see Client recurrence management above). In MVP no fee
  is ever collected; the wording is the same "may" the per-lesson cancel uses. Whether Phase 2 changes either message to
  a definite amount is a Phase 2 decision.
  Shared lessons *(ADR-026, decided by the owner 2026-10-13)*: a skater who cancels late or doesn't show may be charged
  their share of the late-cancellation fee (half, for two skaters). The skater who stays isn't charged any fee, keeps
  their share of the price, and isn't asked anything.

Where the coach sets it *(from ADR-015 decisions 2 and 3, decided by the owner 2026-08-30)*:
  The amount is set per block, in the schedule builder, beside the block's price. A 30-minute lesson and a 90-minute
    lesson do not warrant the same fee, and putting it anywhere else would mean a second screen for a number that
    belongs beside the price already there.
  A fee of 0 means no charge. The amount is its own off switch, per block, so ADR-009's sketched profile checkbox is not
    needed. A coach who charges nothing sets zero and the client-facing wording drops away.
  The notice period (the threshold) is a coach-level policy ("I need a day's notice"), set on the coach profile, not
    per block.
  A coach who changes their fee or notice period does not change lessons already booked (the values are fixed on each
    lesson; ADR-020 lets a fee change reach upcoming lessons by the same rules as a price change: increases only beyond
    the notice period, decreases at once).
  *2026-09-30 (owner):* the fee is named the missed-lesson fee — one fee for a lesson missed by a no-show or by a
    cancellation inside the notice period. The client-facing MVP wording ("may incur a late cancellation fee") is
    unchanged and is shown where a client is cancelling.

What the family is told *(from ADR-015 decision 6)*: because the amount is on the booking, the client sees it when they
  book, and "Bookings cancelled within 24 hours may incur a late cancellation fee" becomes a stated amount at the point
  of commitment. The cancellation confirmation can also say plainly that cancelling now will incur the fee, rather than
  warning that it might. A fee disclosed before the commitment is a materially different thing from one asserted
  afterwards, and this is the main practical gain from putting the amount on the block.
  This is Phase 2, with the charge. *Decided by the owner, 2026-09-29.* Until the charge switches on, the cancel
  confirmation keeps the "may incur a late cancellation fee" wording and the booking page shows no fee. Stating an
  amount the system will not collect would be a promise the product does not keep. Recurrence management's
  confirmation uses the same "may incur" wording. Whether either message becomes a definite "will incur" with an amount
  is decided with the Phase 2 charge.

No-shows on the coach's payment page *(from ADR-015 decision 4, decided by the owner 2026-09-30)*:
  In MVP, a recorded no-show stays unpaid until the coach marks it paid or waived. Its fee is 0 in MVP, so nothing is
    owed, but nothing settles it automatically either: it stays on the payment dashboard and is picked up by the weekly
    unpaid-lessons reminder to the coach (ADR-018). An automatic settle for a zero fee was considered and deferred;
    revisit with the Phase 2 charge.
  For now, the dashboard shows a no-show at what that skater owes (their share; the full price unless the lesson is shared) *(owner, 2026-11-12)*, labelled as a no-show. It is the amount the booking
    already carries, and the no-show label tells the coach what they are looking at before they decide to mark it paid
    or waive it. The weekly reminder lists it the same way. *Note 2026-10-13 (ADR-031):* the amount is the skater's
    share, which for a private lesson is the full price. Showing the missed-lesson fee instead is part of the open
    question below, and is decided with the Phase 2 charge. (See also Coach Payment Section on Dashboard.md.)
  Phase 2: late-cancellation fees also appear among the coach's outstanding lessons, or the coach is owed money by a
    screen that never mentions it.

Open and revisit *(from ADR-015 Open and Revisit if)*:
  ~~Whether a no-show and a late cancellation should ever carry different amounts.~~ Settled 2026-08-30: one fee for
    both. Splitting it later stays possible if a coach ever asks.
  What the fee is charged against when it differs from the lesson price. If the fee is lower than the price, the
    outstanding view shows an amount that is not the lesson price, and the payment reminder must state which it is.
    Cosmetic, but it is client-facing money and should be written down before it is built. *Narrowed 2026-09-30:* for
    MVP a no-show shows what that skater owes (their share; the full price unless the lesson is shared) *(owner, 2026-11-12)*; this question now applies to the Phase 2 charge only.
  ~~Whether a coach can waive a charge.~~ Settled 2026-08-30: yes. The coach payment dashboard gets a "mark as waived"
    action (Coach Payment Section on Dashboard.md). It is available from MVP rather than Phase 2, because it applies to
    any unpaid lesson and not only to a late-cancellation fee.
  The notice period's unit and bounds. Nothing says whether a coach may set 0, or 168 hours, or only a short list of
    sensible values.
  Revisit if waived charges outnumber collected ones. That would mean the fee is set too high for what coaches are
    actually willing to enforce, and the amount is the thing to revisit rather than the mechanism.
