Coach Dashboard on website:
*Updated 2026-10-12 to match the Harbor design. The design is the source of truth.*

Shows the lessons for that day. 
*Design (today.html):* each lesson today with its time, skater, length, price and attendance; the next one is marked
"Next". A held slot shows as "Held slot, not bookable". A note says attendance comes from the rinkside app and mistakes
are fixed on Lessons. Links to the day and week views.
Figures across the top: this week's lessons and amount booked, unpaid total for past lessons, skaters waiting for approval.
When families are waiting, a "New families to approve" card lists them with a "Review sign-ups" button.

Has a button that routes to: ~~Create Default Schedule, Temparary Schedule~~ *Edit weekly schedule, Time off or special schedule*, Month view of lessons, week view of lessons, Student List, *Payments*, coach profile, ~~Pending Student List~~ *(pending students are reached from "Review sign-ups" and the Students page)*, Email template list (phase 2)
*Design:* the main navigation is Today · Calendar · Schedule · Students · Lessons · Payments · Profile. Students shows a count when families are waiting.


The month view shows high level how many booked lessons are schedule for that day with each week listed to the left of the calendar. 
*Design (calendar-month.html):* each day also shows how many open times are left; time off and special schedules are marked; a day with no lessons says so. The header gives the month's booked and open totals. Previous and next month, and a Today button.
By clicking on the day the caoch is taken to a Day view (see C_Coach Day View.md), by clicking on the week number they're taken to that week of lessons where the students are listed with their lesson times ~~and amounts~~ (see cancelation.md, Coach Week view). 



The student List page shows a list of students names and their guardians contact info. On this page there needs to be a way for the coach to update the contact information and delete the client/student. On delete there is a confirmation pop that must be accepted before delete happens. NEED TO DECIDE WHAT DELETE MEANS, ARE THEY REMOVED FROM INFO GOING FORWARD OR REFROACTIVATLY? DOES THIS MEAN THE CLIENT CAN NO LONGER BOOK WITH THE COACH, IF SO HOW DOES THAT SHOW ON THE UI FOR THE CLIENT
*Phase 2 (owner, 2026-10-13): removing a student, from one coach or from all, is Phase 2. MVP has no Remove button, and
students-remove.html is in the Phase 2 group.*
*Design (students-remove.html, Phase 2), the design's reading of this open decision (docs/Open-Pending.md):* upcoming lessons are
cancelled and the family is emailed, the student can no longer book with the coach, and past lessons and payments stay
in the coach's records.
*Design (students.html):* a search box (name, family, email or phone). Each row: skater (minor or adult), family contact
(email, phone, texts on or email only), ~~price,~~ next lesson, and an Edit contact button (~~Remove~~, Phase 2 since 2026-10-13). *Phase 2 (2026-10-12): all client SMS deferred.*
  Contact details belong to the family, so an edit applies to every skater in it.
  ~~Price: "Schedule price" or a personal price.~~ *Phase 2 (owner, 2026-10-13): personal prices move to Phase 2, and the
  Students list has no price column in MVP (students-price.html is in the Phase 2 group).* "Set price" (or "Change") chooses the schedule's price or one personal
  price per lesson for every lesson length (priceMinorOverride, ADR-003 d2). ~~It applies to lessons booked from now on;
  lessons already booked keep their price. *Both rules are the design's reading of open questions (Kim's list §5, ADR-020).*~~
  *Changed 2026-10-13 (owner, ADR-031): lessons don't store their own price, so a personal price will be a per-skater
  override applied when the skater's share is worked out. Whether it reaches lessons already booked is still the Phase 2
  question for Kim (§5).*
  The page has two tabs: Students, and Waiting for approval, each with a count.


On the coach profile page is a form that allows the coach to update their email, phone number, profile picture (Phase 2), ~~payment currency~~, where they want to display their contact info to the client. 
*Design:* currency is read-only; changing it is Phase 2. The profile has five tabs, described in C_Coach Profile.md.


The Pending student list is a page that displays the potential students of the coach. The coach needs to either accecpt or decline the student. 
On decline an email goes out to the client, saying something like the coach does not have availabilitiy to take on new students. 
*Design (pending.html, pending-decline.html, pending-empty.html):*
  Sign-ups are grouped by family, with the family's contact details and sign-up date. Approve or Decline per skater,
  and "Approve all" when a family has more than one.
  A banner explains that waiting families can't see the coach's times, open times or contact details until approved
  (ADR-022 d6), and that approving is how the coach checks they know them.
  Declining asks for confirmation and says the student is deleted outright; nothing is kept (ADR-002 2b).
  Nobody waiting: says so and shows the coach code to share.



Email template list page is a page where the coach can see a preview of what the emails look like and elect to send or not send each one. Phase 2
*Design:* cancellation, schedule-change and sign-up-declined emails can't be switched off. See C_Coach Email Templates.md.