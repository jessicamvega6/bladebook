*Updated 2026-10-12 to match the Harbor design (bookings-cancel.html, recurrence.html, calendar-week.html, cancel-preview.html). The design is the source of truth.*

Client cancelation:
Within 'My bookings' section by each lesson item there is a cancel button. on click of the cancel a confirmation pops up asking if they are sure they want to cancel. This will cancel that particular booking and release that time slop back into the available slots
There will be a note that says bookings canceled within ~~24 hours~~ *the coach's notice period (24 hours in the design)* may incur a late cancelation fee. 
*Design:* the confirmation shows the lesson (day, time, length, price). Inside the notice period the note becomes a warning:
  "Inside the N-hour notice period. <coach> may charge a late cancellation fee."
  It says the time goes back on the coach's calendar and the coach will be told, and, for a repeating lesson, that other
  lessons in the series aren't affected. Buttons: "Keep lesson" and "Cancel lesson".
*Shared lessons (owner, 2026-10-13; ADR-026; bookings-cancel-shared.html, home-share-left.html):* either family can cancel
  their skater's place, with the same rules whichever family booked it. The pop-up shows their share of the price.
  In time: the other family is asked to keep it as a private lesson at the full price, or cancel with no charge.
    They see a card on Home and My bookings; no answer by ~~the start of the notice period~~ *the answer-by time* cancels it, no charge.
    *Changed 2026-10-13 (ADR-031 decision 8): the answer-by time is whichever comes first, the start of the notice
    period or 7 days after the other skater left. An unanswered lesson is cancelled with no charge by the hourly check.
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




Make note for phase 2
For phase 2, clicking the lesson slot on the Week view if the booking belongs to the client clicking will give the option to cancel, also have cancel confirmation)
For phase 2, on coach registration & profile, have a checkbox to indicate if the coach has a late cancelation fee. And if the couch does have one then that note is changed from 'may' to 'will'
An email is sent to the coach when a client shortens or cancels their reocurring bookings. *MVP per ADR-009 d9, only inside the notice period.* 
*Confirmed by the owner 2026-10-12: only inside the notice period. The design matches: the email template, the coach's
profile ("You get an email when a family cancels inside your notice period") and the family's cancel pop-up, which says
the coach will be told only for a late cancellation.*


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
*Design:* the choice is made per lesson on the confirmation view: "Release for rebooking" or "Hold — keep closed", with a
"Release all" link. A held time stays closed to families.

For cancelation types 1 & 2, only cancel the lessons that have not happened yet. 


A confirmation view will show to the coach on all cancelation actions. This will present any bookings that will get canceled. A message will display to the coach that on accept cancelation emails will be sent to clients with canceled bookings. The coach must accept before any bookings are canceled. 
*Design:* the confirmation view shows the count cancelled, held closed, and families emailed; that each family gets one
email listing their cancelled lessons with a link to book another time; that repeating lessons in other weeks aren't
affected; and that a cancellation can't be undone. Buttons: Back and "Cancel N lessons". Afterwards the week view shows
a message with the counts, the released times back to Open and held times as Held.


Phase 2: Make different types of emails for cancelation (sick, emergency, vacation, etc) and allow the coach to select type of cancelation. 


All cancelations will be tracked showing who canceled, and if possible the time slots that were canceled.

Business decision: there is no rescheduling, the option is to rebook-then-cancel
Mark this as a phase 2 feature: A coach books on a client's behalf.



Cancelations cannot happen on bookings in the past or happening now. 