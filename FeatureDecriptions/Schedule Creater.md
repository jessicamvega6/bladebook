As of now schedule creation will have
*Updated 2026-10-12 to match the Harbor design. The design is the source of truth.*

  Name (optional): allows the coach to save a schedule. Applying it will be a phase 2 feature. Is stored on the schedule object.
        *Design: each block has an optional name (e.g. "Morning ice"), and a special schedule or time off has an optional name. There is no saved-schedule list to reload.*
        The schedule's name is stored, not applied: it is written onto the schedule it creates (the weekly
        schedule, or the special schedule). Saving a named schedule for reuse is Phase 2. *(from ADR-008 §2, moved 2026-11-08)*

  Block names (optional, added 2026-08-24):
        A block can have its own name, at most 40 characters. *2026-11-08 (owner, settling conflict S5 in the
        implementation plan, design/harbor/coach/schedule.html): the block Name field always shows, in a special
        schedule too.*
        ~~Blocks in special schedules have a name too, which puts two names on a special schedule: one for the
        whole schedule ("August Camp") and one per block ("Camp ice"). For the common single-block special
        schedule that is redundant, so the editor doesn't ask for a block name until a second block exists.~~
        *Withdrawn 2026-11-08 by the owner (above).*
        Why blocks have names: when two blocks overlap, the message is the coach's only guide to fixing it.
        "Monday: Morning ice and Afternoon power hours overlap" is something they can act on; "Block 1 and
        Block 2 overlap" makes them count tabs to work out what they did. The schedule's own name can't do
        this: a coach has exactly one weekly schedule, but switches between blocks all the time.
        The name is optional, but every block has a label. Everywhere a block is mentioned (validation
        messages, the block list, cancellation records) shows its name if it has one, and otherwise its
        number: Block 1, Block 2, Block 3. A one-block schedule needs no naming.
        A block's number never changes. Numbers aren't reused and blocks aren't renumbered: delete Block 1
        and Block 2 from a schedule of three and the one left is still Block 3; add another and it's Block 4.
        The weekly schedule and each special schedule number their own blocks from 1.
        A label made from the block's details ("6:00–11:30 · 30 min · $50") was considered and rejected. It
        changes as the coach edits the block, so the block renames itself while they type, and a warning
        they read a moment ago no longer matches what's on screen. A number holds still.
        Overlap messages always add each block's hours, name or not: "Monday: Morning ice (6–11:30 AM) and
        Block 2 (10 AM–5 PM) overlap in time." Two blocks both called "Morning" are still told apart by their
        hours, so names don't have to be unique.
        The block name is for the coach only and is never shown to families: "Morning ice" is the coach's
        private label and means nothing to a parent. The booking page groups times by "30 minutes · $50"
        instead.
        *(from ADR-008 §2a and its 2026-08-24 and 2026-11-08 amendments, moved 2026-11-08)*
  (SOD)Start of Day ("Starts"): A dropdown filled from ~~12am - 11:45pm~~ *5am - 11pm* in 15 minute intervals
  (EOD)End of Day ("Ends"): A dropdown filled from ~~12am - 11:45pm~~ *5am - 11pm* in 15 minute intervals
  (LL)length of lesson (in mins): a dropdown with 30,45,60,90,120 in the list. 
        This fixed list replaced "any length the coach chooses" (ADR-003 decision 3a) on purpose. A list covers
        nearly every coach, means less to check, and makes the calendar's times predictable. The cost: a coach
        who wants a length outside the list (20-minute lessons for tots, say) has no way to offer it.
        *(from ADR-008 §5, moved 2026-11-08)*
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
  (MF) Missed-lesson fee: an amount in the coach's sign-up currency; 0 means no charge. Hint: "charged for a
        no-show or a cancellation inside your notice period." Per tab, like LC, so each block has its own fee
        beside its own price (ADR-015 decision 2). Shown from Phase 2. In MVP it's hidden rather than shown and
        ignored, because a fee field that collects nothing invites a coach to believe it does.
        *Added 2026-09-29 as LF (late fee); renamed 2026-09-30.* *(from ADR-008 §2 and its 2026-09-29 amendment, moved 2026-11-08)*
        The fee itself was decided by the owner 2026-08-30 (ADR-015 decision 2; Phase 2 charge): one fee for a no-show
        or a cancellation inside the coach's notice period, set beside each block's price; 0 is the MVP value. Rules:
        cancelation.md, "Late-cancellation and missed-lesson fee". *(from ADR-015 §2, moved 2026-11-08)*

  The form as ADR-008 decision 2 listed it (2026-08-23): *(from ADR-008 §2, moved 2026-11-08)*

  | Field | Control | Shown for |
  |---|---|---|
  | **Name** | Free text, optional | Both |
  | **SOD** — start of day | Dropdown, ~~12:00am–11:45pm~~ 5:00am–11:00pm in 15-minute steps | Both |
  | **EOD** — end of day | Dropdown, ~~12:00am–11:45pm~~ 5:00am–11:00pm in 15-minute steps | Both |
  | **LL** — lesson length | Dropdown: 30, 45, 60, 90, 120 minutes | Both |
  | **LC** — lesson cost | Amount, in the coach's signup currency | Both |
  | **MF** — missed-lesson fee | Amount, in the coach's signup currency; `0` means no charge (see MF above). Shown from Phase 2 | Both |
  | **Days** | Seven checkboxes, Sun–Sat. **Mandatory** | Default only |
  | **SD / ED** — start and end date | Date pickers | Temp only |

  *Ruled by the owner 2026-11-09: the range is 5:00am–11:00pm, as in the design; the table is updated to match.*
  am or pm is part of each SOD/EOD dropdown entry; there is no separate am/pm control.
  (Days)Days this Schedule needs to repeat: wih 7 checkboxes representing sun - sat. For default view Days are manditory, for temp view they are not shown.
        *Design: a dot on a day means another block already runs that day. A special schedule's block applies to every date in its range.*
  (SD) Start Date: For temporary schedules the date the schedule needs to start. Only shown for temp Schedules
  (ED) End Date: For temporary schedules the date the schedule needs to stop. Only shown for temp Schedules   
        *Design: temporary schedules are called special schedules (e.g. a camp or holiday hours). They replace the weekly schedule on those dates only, and can't overlap another special schedule or time off. Time off is separate: see C_Coach Time Off.md.*

There will be a calendar view to the right where on entering in both a start of day and length of lesson, slots will auto popululate starting at the start of day time with the lesson duration. It will go until the End of Day time ~~if that has a value or will stop at 7pm. 7pm is not a hard stop but just a helpful prefill~~. The coach can add more slots by sleceting them on the schdeule view or by modifying the EOD field. 
*Design:* a new block starts filled in (6pm to 8pm, 30 minutes, $50; no days ticked on the weekly schedule, every date on a special schedule). The view on the right shows the whole week with every block together, one column per weekday (one column per real date on a special schedule), each with its lesson count and total. "All blocks" or "This block only". Under it: lessons a week and the weekly total.
*From ADR-008 §4 (2026-08-23, moved 2026-11-08):* ~~entering SOD and LL fills the calendar with back-to-back times from
SOD, running to EOD, or to **7:00pm** if EOD is blank. 7pm is a prefill, not a ceiling: the coach goes past it by
setting EOD, or by selecting more times directly.~~
*Replaced, ruled by the owner 2026-11-09:* the design's starting values replace the 7pm prefill. A new block opens
filled in as 6pm to 8pm, 30 minutes, $50, so EOD is never blank and there is nothing for a 7pm prefill to do.

~~The calendar view will have tabs, one to start --- with a + button next to it. On click of the + btn a new tab will appear next to the previous schedule tab and the SOD, EOD, LL, & Days will reset to blank. Each tab will have a X next to it that when clicked deletes that tab schedule.~~ There must be at least one schedule always for the next button to be enabled. When there is only one schedule in the view, that schedule will not have an X button until the + btn is clicked again. 
*Design:* tabs are blocks. A "Blocks" list on the left shows each block's name, days, hours, length and price; clicking one edits it. "Add a block with a different length or price" adds one. Each block has a delete (bin) button when there's more than one. "Tab" elsewhere in these docs means a block.
*From ADR-008 §3 (moved 2026-11-08; language matched to the design by the owner, 2026-11-09):* the Blocks list
always has at least one block, and the only remaining block has no bin button. At least one block must exist for
**Review changes** to be enabled.
A block in the list is a template: each holds one start, end, length and price, and makes one block on each ticked
weekday (weekly schedule) or on every date from SD to ED (special schedule). Two blocks that both cover Monday give
Monday two blocks; that's how a coach has 30-minute mornings at one price and 60-minute afternoons at another.

Clicking a lesson slot on the schedule will select or deselect that lesson. ~~If the LL is not defined when clicking on the schedule, the slot length will default to 30 mins. and will auto fill the LL input.~~ 
*Design:* every time in a block starts on; tapping a time switches it off, and an off time is a break (e.g. "Break 11:30am–3pm"). Tap it again to switch it back on. "Undo edits" puts everything back. Nothing is saved until the coach reviews and accepts.
*From ADR-008 §4 (moved 2026-11-08; language matched to the design by the owner, 2026-11-09):* tapping a time
switches it off or on. A block always has a lesson length (a new block starts at 30 minutes), so there is no
"length not set" case.


The view will be used for both the Default and the Temp. ~~A radio button will indicate if schedule needs to be for default or temporary.~~ *Superseded by ADR-008: two dashboard buttons.* 
*Design:* the editors are reached from the schedule hub (C_Coach Schedule Hub.md) and the dashboard: "Edit weekly schedule", and "Time off or special schedule".
*From ADR-008 §6 and §6a (moved 2026-11-08):* the weekly and special schedules take different inputs. The weekly
schedule needs Days and has no dates; a special schedule needs SD/ED and doesn't show Days. So the coach has to know
which one they're making before they fill anything in, and chooses it first.
*Decided by the owner, 2026-09-30:* two separate entry points on the coach website's dashboard instead of a radio
button at the top of one form:
  Edit weekly schedule: the default. Days are mandatory; there are no dates.
  Add time off or a special schedule: start and end dates; no days.
They lead to different forms (different fields, different checks, different review wording), so choosing first, from
a button that names the job, is clearer than a radio button on a form that then rearranges itself. The coach
dashboard notes already listed separate *Create Default Schedule* and *Temporary Schedule* buttons; this names them
for what a coach is trying to do.

On click of Next (*"Review changes"*), user will be taken to validation / confirmation page. the system Will validate that no schedule has overlapping times on the same day and will also check any existing temp schedules for date/time overlap. IF there are validation errors, a message will be presented to the user describging the issue.
*Design:* overlapping blocks are caught in the editor, not on the next page: "Fix this before you can review" names the blocks, the day and their hours, and Review changes is disabled until it's fixed. With no clash, the editor says "No clashes", the lessons a week, and how many booked lessons are affected. An overlapping special schedule or time off is rejected on its form, naming the one it overlaps. If no validation errors, will present to user the schedule for confirmation. For both schedule types (temp/default) it will also present any bookings that will get canceled, and how long the schedule will run for. For temps until the end date, for defaults indefinately. A message will display to the coach that on accept cancelation emails will be sent to clients with canceled bookings. The coach must accept before any bookings are canceled. 
*Design (schedule-review.html):* "Review your changes" with what's changing (e.g. "Weekly schedule · repeats every week until you change it").
  Figures: lessons cancelled, lessons that change price, families emailed.
  Lists each booked lesson that will be cancelled (each family is emailed with a link to book another time), and each
  upcoming lesson whose price changes, old and new price. Families whose price goes down are told "Good news — some
  lessons are now cheaper."
  A price increase never reaches a lesson inside the coach's notice period; those are listed as not changed.
  A big price change (50% or more of the old price, up or down — owner, 2026-10-13; e.g. a 90% cut) must be confirmed with "I've checked the new price" before continuing, because a
  typo means families get emailed twice.
  Buttons: Back to editing, and Accept. Afterwards the save status page follows (C_Coach Schedule Save Status.md).

Checks before review (from ADR-008 §8, moved 2026-11-08):
  If any check fails, the coach is shown a message describing the problem and nothing is saved.
  No two tabs may make overlapping blocks on the same day. Blocks that only touch are fine (one ending at 15:00
    as the next begins at 15:00).
  A new special schedule's dates are checked against existing special schedules for date and time overlap.
  *Settled by the owner, 2026-09-30:* an overlap is rejected, never warned about and allowed, and the message says
    exactly what to do. It names the existing special schedule, the dates they share and the way out, e.g.
    "This overlaps **August Camp** (Aug 19–25) on Aug 21–22. Edit August Camp to change those days, or choose
    dates outside it." A one-day absence during a special schedule (a sick day inside a camp) isn't a schedule
    change at all: it's *cancel this day* (see cancelation.md).
  *Added 2026-10-13 (ADR-031 decision 13):* the odd-cents warning (see Skaters per lesson above) is a warning, not a
    failed check. The coach can still save.

What the review page shows (from ADR-008 §8 and ADR-020 §2a and §4, moved 2026-11-08):
  Every booking the change will cancel, for both the weekly schedule and special schedules. A weekly schedule change
    is the more dangerous of the two: it covers every date without a special schedule, and with repeating bookings
    up to 12 months long one save can reach a year out. *(ADR-031 decision 3, 2026-10-13: single bookings are held to a
    3-month window, but a series can still run 12 months.)* A special schedule change is limited to its own dates.
  How long the schedule will run: for a special schedule, until its end date; for the weekly schedule, indefinitely.
  A statement that accepting will send cancellation emails to the affected families.
  *Added 2026-09-30 (ADR-020):* every upcoming lesson the change will re-price, with the old and new amount, e.g.
    "14 lessons for 6 families will change from $50 to $60. Each family will be emailed."
  *Added 2026-09-30 (ADR-020, owner):* which lessons a price increase won't reach because they're inside the coach's
    notice period, said plainly, e.g. "The new price won't apply to 3 lessons in the next 24 hours, which are inside
    your notice period. They stay at $50." A coach who expected every lesson to change must not find out from a
    family. (Which lessons change: see Re-pricing Booked Lessons.md.)
  Nothing is cancelled or re-priced until the coach accepts.

Big price change warning (from ADR-020 §4 and its 2026-10-13 threshold amendment, moved 2026-11-08):
  *Decided by the owner, 2026-09-30:* a large price change, up or down, must be **super noticeable**. The likeliest
    cause is a typo ($60 entered as $6), and a typo here emails every affected family twice: once for the mistake
    and once for the fix. So the warning is:
    At the top of the review page, above everything else, not a line in the list.
    Visually distinct, in the theme's warning colours, with an icon and words as well as colour, so it doesn't
      depend on colour vision.
    Specific: the old price, the new price and the change as a percentage, e.g. "This lowers the price from $60 to
      $6 — a 90% cut."
    Acknowledged: Accept stays disabled until the coach ticks "I've checked the new price".
  ~~The threshold is undecided; it depends on how much coaches normally change prices, a question for a coach.~~
    *Settled 2026-10-13 by the owner (blocker #12):* a change of **50% or more** of the old price, up or down.
    $60 to $6 (a 90% cut) and $50 to $75 (a 50% rise) both warn; $50 to $60 (20%) doesn't.

A family books during the review (from ADR-008's and ADR-020's 2026-10-08 and 2026-10-09 amendments, moved 2026-11-08):
  A family can book between the coach seeing the review page and accepting it. The review page is a guide; what was
  actually cancelled is what the save did.
  *2026-10-08, Kim's answer to Items to ask Kim About.md §7 (option B):* the save goes ahead without asking the
    coach. A booking made since the review that the change cancels is cancelled like the rest. Holding times while
    the coach reviews (option D) is not built.
  *2026-10-09, decided by the owner:* that family gets the ordinary cancellation email in MVP. A separate "just
    booked" email ("Coach updated their schedule just as you booked. Here are other open times.") is **Phase 2**.
    To be reconsidered if feedback supports that this is an issue.
  *2026-10-13 (ADR-031 decision 11):* a booking can no longer land on a time after the save has removed it.

Cancellation emails from a schedule change:
  *Settled by the owner, 2026-08-15:* the email says the lesson was cancelled and carries a link to the coach's open
  times, not specific other times. *(from ADR-004 Open, moved 2026-11-08)*
  ~~Should a coach see what a schedule change will release before saving? Without it they find out from the emails
  their families receive.~~ *Superseded: asked by ADR-005 (2026-07-31) when bookings were limited to 7 days ahead;
  answered by the review page above (ADR-008 decision 8).* *(from ADR-005 Open, moved 2026-11-08)*


A saved named schedule is able to be reloaded and then modified. 
*Not in the Harbor design: the weekly schedule is always edited in place, and saved special schedules and time off are edited from the schedule hub.*
*Decided by the owner, 2026-08-25:* a coach opens a special schedule from the schedule list, changes its dates or its
blocks, and saves. Bookings are handled like any other schedule change: the review page, then cancellation and
emails after the coach accepts. Known cost: times the coach switched off on one date inside the special schedule
are lost when it's saved (ADR-008 decision 7a explains why). *(from ADR-008 §7a, moved 2026-11-08)*





Business Decision:
For canceling see document labeled cancelation.md.
