As of now schedule creation will have
*Updated 2026-10-12 to match the Harbor design. The design is the source of truth.*

  Name (optional): allows the coach to save a schedule. Applying it will be a phase 2 feature. Is stored on the schedule object.
        *Design: each block has an optional name (e.g. "Morning ice"), and a special schedule or time off has an optional name. There is no saved-schedule list to reload.*
  (SOD)Start of Day ("Starts"): A dropdown filled from ~~12am - 11:45pm~~ *5am - 11pm* in 15 minute intervals
  (EOD)End of Day ("Ends"): A dropdown filled from ~~12am - 11:45pm~~ *5am - 11pm* in 15 minute intervals
  (LL)length of lesson (in mins): a dropdown with 30,45,60,90,120 in the list. 
  (LC)Lesson Cost ("Price per lesson"): the cost of the lesson. represented in the currency selected on sign up. MVP the currency is USD or canadian. 
  (SPL)Skaters per lesson: default 1, max 2 (owner, 2026-10-07; ADR-026 d1). Per tab.
        *Design: skaters per lesson, rink and ice type are on every block (schedule-weekly.html, schedule-weekly-no-ice.html, schedule-review-skaters.html).*
        *Added 2026-10-13 (ADR-031 decision 13): when a block allows 2 or more skaters and its price doesn't split evenly, the
        editor warns: "Split 2 ways, $45.01 is $22.51 and $22.50. One family will pay a cent more." It shows whenever the price
        or the skaters per lesson changes. The coach can still save.*
        *Added 2026-10-13: skaters per lesson can't be lowered on a lesson that's already booked; a change applies to lessons booked afterwards (owner 2026-10-12, ADR-026; kept by ADR-031 decision 1).*
  (R)Rink: the rink the lessons are at. Per tab, because a coach can work at more than one rink. Decides which ice types are listed. Added 2026-10-07.
                Phase 1: fixed to Pelham Civic Center (PCC) and not selectable. Phase 2: a dropdown of the rinks BladeBook has ice types for.
  (IT)Ice Type: the type of ice the lessons are on, named the way the rink names its sessions, e.g. at PCC: Birmingham Figure Skating Club (BFSC) freestyle ice, Stick and Puck (S&P) ice, public ice. Added 2026-10-07 from talking with Kim. 
                Per tab, like LC, because one day can mix ice types. The rink fee depends on it (see Coach Financial Page.md). 
                Required. Not shown to families. A dropdown of the ice types for the tab's rink. Each rink's list is
                maintained by the BladeBook owner and added to as BladeBook reaches new rinks; coaches don't create their own.
                What happens at a rink with no list yet is open (Phase 2), see docs/Open-Pending.md §4.
  (Days)Days this Schedule needs to repeat: wih 7 checkboxes representing sun - sat. For default view Days are manditory, for temp view they are not shown.
        *Design: a dot on a day means another block already runs that day. A special schedule's block applies to every date in its range.*
  (SD) Start Date: For temporary schedules the date the schedule needs to start. Only shown for temp Schedules
  (ED) End Date: For temporary schedules the date the schedule needs to stop. Only shown for temp Schedules   
        *Design: temporary schedules are called special schedules (e.g. a camp or holiday hours). They replace the weekly schedule on those dates only, and can't overlap another special schedule or time off. Time off is separate: see C_Coach Time Off.md.*

There will be a calendar view to the right where on entering in both a start of day and length of lesson, slots will auto popululate starting at the start of day time with the lesson duration. It will go until the End of Day time ~~if that has a value or will stop at 7pm. 7pm is not a hard stop but just a helpful prefill~~. The coach can add more slots by sleceting them on the schdeule view or by modifying the EOD field. 
*Design:* a new block starts filled in (6pm to 8pm, 30 minutes, $50; no days ticked on the weekly schedule, every date on a special schedule). The view on the right shows the whole week with every block together, one column per weekday (one column per real date on a special schedule), each with its lesson count and total. "All blocks" or "This block only". Under it: lessons a week and the weekly total.

~~The calendar view will have tabs, one to start --- with a + button next to it. On click of the + btn a new tab will appear next to the previous schedule tab and the SOD, EOD, LL, & Days will reset to blank. Each tab will have a X next to it that when clicked deletes that tab schedule.~~ There must be at least one schedule always for the next button to be enabled. When there is only one schedule in the view, that schedule will not have an X button until the + btn is clicked again. 
*Design:* tabs are blocks. A "Blocks" list on the left shows each block's name, days, hours, length and price; clicking one edits it. "Add a block with a different length or price" adds one. Each block has a delete (bin) button when there's more than one. "Tab" elsewhere in these docs means a block.

Clicking a lesson slot on the schedule will select or deselect that lesson. ~~If the LL is not defined when clicking on the schedule, the slot length will default to 30 mins. and will auto fill the LL input.~~ 
*Design:* every time in a block starts on; tapping a time switches it off, and an off time is a break (e.g. "Break 11:30am–3pm"). Tap it again to switch it back on. "Undo edits" puts everything back. Nothing is saved until the coach reviews and accepts.


The view will be used for both the Default and the Temp. ~~A radio button will indicate if schedule needs to be for default or temporary.~~ *Superseded by ADR-008: two dashboard buttons.* 
*Design:* the editors are reached from the schedule hub (C_Coach Schedule Hub.md) and the dashboard: "Edit weekly schedule", and "Time off or special schedule".

On click of Next (*"Review changes"*), user will be taken to validation / confirmation page. the system Will validate that no schedule has overlapping times on the same day and will also check any existing temp schedules for date/time overlap. IF there are validation errors, a message will be presented to the user describging the issue.
*Design:* overlapping blocks are caught in the editor, not on the next page: "Fix this before you can review" names the blocks, the day and their hours, and Review changes is disabled until it's fixed. With no clash, the editor says "No clashes", the lessons a week, and how many booked lessons are affected. An overlapping special schedule or time off is rejected on its form, naming the one it overlaps. If no validation errors, will present to user the schedule for confirmation. For both schedule types (temp/default) it will also present any bookings that will get canceled, and how long the schedule will run for. For temps until the end date, for defaults indefinately. A message will display to the coach that on accept cancelation emails will be sent to clients with canceled bookings. The coach must accept before any bookings are canceled. 
*Design (schedule-review.html):* "Review your changes" with what's changing (e.g. "Weekly schedule · repeats every week until you change it").
  Figures: lessons cancelled, lessons that change price, families emailed.
  Lists each booked lesson that will be cancelled (each family is emailed with a link to book another time), and each
  upcoming lesson whose price changes, old and new price. Families whose price goes down are told "Good news — some
  lessons are now cheaper."
  A price increase never reaches a lesson inside the coach's notice period; those are listed as not changed.
  A big price change (e.g. a 90% cut) must be confirmed with "I've checked the new price" before continuing, because a
  typo means families get emailed twice.
  Buttons: Back to editing, and Accept. Afterwards the save status page follows (C_Coach Schedule Save Status.md).


A saved named schedule is able to be reloaded and then modified. 
*Not in the Harbor design: the weekly schedule is always edited in place, and saved special schedules and time off are edited from the schedule hub.*





Business Decision:
For canceling see document labeled cancelation.md.
