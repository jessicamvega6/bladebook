# Items to Ask Kim About

**Started:** 2026-09-30
**Purpose:** Questions only a working coach can answer. Each one is holding up a decision in
the design. Plain-language questions first; what each answer decides is underneath, for
recording afterwards.

---

## 1. How often do prices and schedules change, and how far ahead do families book?

**The scenario.** A coach's weekly schedule (days and times) may stay the same(assumption) for months
while their price goes up. How BladeBook handles that depends on how often each actually
changes, and how far ahead families book.

**How it works today, for context:**

- A lesson's price is set on each block of time in the coach's schedule. Changing a price
  means editing the schedule and changing the lesson cost — not rebuilding it — and it cancels
  nothing.
- ~~**A lesson keeps the price it was booked at.** Raising the price only affects lessons booked
  after the change. A family with a weekly recurring booking made in September pays the
  September price for every lesson up to 12 months ahead.~~ *Revised 2026-10-13 (ADR-031): a
  price change reaches upcoming lessons — a drop at once, a rise only beyond the notice period.*
- The booking page shows three months ahead. Recurring bookings can run up to 12 months. ~~A
  single lesson has no limit at all behind the scenes.~~ *Changed 2026-10-13 (ADR-031): the
  system now checks the three months too. A single lesson can't be booked further ahead; a
  recurring booking must start inside the three months and can run past them.*

**Questions:**

1. How often do you change your prices? Once a season, once a year, whenever?
2. When you change them, is it for everyone at once, or student by student?
3. How often does your weekly schedule (days and times) change? 
  Not often
   *Recorded 2026-10-08 in `Open-Pending.md` §4 (one-off date ceiling).*
4. When you raise your price, should lessons **already booked** for the future stay at the old
   price, or move to the new one? Does it matter whether they are recurring?
   Move if they are outside the notice period
   *Recorded 2026-10-08: matches ADR-020 (increases move only beyond the notice period).*
5. How far ahead do your families usually book? Would anyone want to book a single lesson more
   than three months out?
6. When you raise or lower your prices, **by how much** do you usually change them? Roughly a
   percentage — 5%, 10%, 25%?

**What the answers decide:**

- ~~Whether single bookings get a date ceiling, and what it is — none, 12 months, or the booking
  page's three months. (ADR-006 Open; `Open-Pending.md` §4) *Kim: schedules change "not often"
  (question 3). Questions 1 and 5 are still unanswered, so the ceiling is still open.*~~
  *Decided by the owner 2026-10-13 (ADR-031 decision 3): the booking page's three months. Kim's
  answer to question 5 is still worth hearing as a check.*
- ~~Whether a price change should ever re-price lessons already booked.~~ *Decided by the
  owner 2026-09-30 (ADR-020): upcoming lessons follow the new price — increases only beyond
  the notice period, decreases at once — and families are told.* Kim's answer to question 4 is
  still worth hearing as a check.
- ~~**How large a price change should trigger the preview's "check this amount" warning**
  (question 6).~~ *Decided by the owner 2026-10-13: 50% or more of the old price, up or down.
  Kim's answer to question 6 is still a useful check that normal changes stay below it.* The warning exists to catch typos like $60 entered as $6; the trigger should
  sit above a normal price change. (ADR-020 decision 4)

---

## 5. Discounts for a family

**The scenario.** A family falls on hard times and the coach wants to charge them less for a
while. Today BladeBook offers two ways, and they don't fit together well:

*Personal prices moved to Phase 2 by the owner, 2026-10-13: this section is for Phase 2.*

- **A per-student price** (`priceMinorOverride`): one fixed amount that replaces the normal
  price on every lesson that student books — whatever the lesson's length, and unaffected by
  the coach's later price changes.
- ~~**Editing one booking's price by hand** (ADR-003 decision 2). This one causes a problem:
  since ADR-020, upcoming lessons follow the coach's current price, and nothing can tell a
  hand-edited price from an out-of-date one — so the next schedule save would put it back.~~
  *Answered by the owner, 2026-10-13: removed (ADR-031). No need to ask Kim.*

A lesson can also be **marked waived** — free — which already covers a one-off.

**Questions:**

1. When a family is going through a hard time, what do you do about their price today?
2. Would you rather set **their price** ("Mia pays $40"), take **a percentage off** ("20% off"),
   or take **a dollar amount off** ("$10 off the normal price")?
3. If you teach lessons of different lengths — say 30 minutes for $50 and 60 minutes for $80 —
   should a family's discount apply to both, and how?
4. When you raise your prices, should a family with a discount see the increase too?
5. Do you ever make a **single** lesson cheaper — not free, just less, once?
6. Do you ever teach a family for **free** for a stretch of time?

**The owner's leanings, to test rather than assume:**

- Waiving a lesson is probably enough for one-offs, so hand-editing a single booking's price
  could go.
- Coaches may prefer "$10 off" to a percentage — no maths.
- Free lessons for a stretch are probably rare.

**What the answers decide:**

- **The shape of the per-student discount**: a fixed price, a percentage off, or a dollar
  amount off. A percentage or dollar amount off would follow the coach's price changes; a
  fixed price would not. (ADR-003, ADR-004 decision 4)
- ~~**Whether hand-editing one booking's price stays.** If it goes, re-pricing needs no
  exceptions. If it stays, ADR-020 needs a way to mark hand-set prices so they are never
  re-priced. (ADR-003 decision 2, ADR-020)~~ *Answered by the owner, 2026-10-13: it goes.*
- **Whether changing a family's discount re-prices lessons they have already booked**, under
  ADR-020's rules — likely yes, since that is the point of the discount.
- **What "no discount" looks like**: an empty field, so that `0` can mean free if free
  lessons are a real case.

---

## 6. Approving new families before they can book

**The scenario.** A family signs up with the coach's code and adds their skaters. Today each
skater waits for the coach to approve them. Until at least one is approved, the family sees
nothing but their own account: no schedule, no open times, no coach contact details.

**Why it is there:** a coach code is shared by word of mouth and can end up in a team group
chat, so anyone holding it could sign up. Approval means only families the coach actually
knows can see their times and book. From a security point of view it is probably worth
keeping. The question is whether it gets in a coach's way.

**Questions:**

1. Would you want to approve each new family or skater before they can book, or would you
   rather anyone with your code could book straight away?
   You approve a family
2. How quickly would you usually get to an approval? Same day, or could a family wait a few
   days?
   *Decided by the owner 2026-10-09:* no reminder email; the Students tab title shows the number
   of pending students (ADR-002).
4. Would you want to approve **siblings** added later by a family you already know, or should
   they be let in automatically?
   *Decided by the owner 2026-10-09:* the coach approves everyone, siblings included (ADR-002).

**What the answers decide:**

- ~~**Whether the `PENDING` step stays in MVP**, and with it whether a pending family sees
  nothing of the coach's (ADR-002 decision 2, ADR-022 decision 6). If it goes, the security
  case has to be made another way — for example, codes that expire or can be used only a few
  times.~~ ***Settled 2026-10-08 from Kim's answer to question 1: it stays*** (ADR-002).
- ~~**Whether a sibling of an approved family skips approval** (question 4). Today the family
  can see the schedule once one skater is approved, but cannot book for the pending sibling.~~
  ***Settled 2026-10-09 by the owner: it doesn't*** (ADR-002).
- ~~**Whether a slow approval needs a reminder to the coach** (question 2). There is none today.~~
  ***Settled 2026-10-09 by the owner: no reminder; the Students tab title shows the pending
  count*** (ADR-002).

---

## 7. A family books a time you are in the middle of removing

**The scenario.** You open your schedule and remove Tuesday 4:00. Before saving, you see a
preview of which booked lessons this will cancel. While you are reading it, a family books
Tuesday 4:00, which was still open because you hadn't saved yet. They get a confirmation
email.

BladeBook will notice the new booking when you click save and show you an updated preview,
so it is never cancelled without you knowing. The question is what should happen next. If
the lesson is cancelled, the family gets a cancellation email minutes after their
confirmation.

It should be rare: it needs you to be editing, and a family to book that exact time in the
few minutes before you save.

**The options:**

- **A. You're shown it and you choose.** The updated preview calls it out: *"Jane Smith
  booked Tuesday 4:00 two minutes ago. Saving will cancel it."* with a choice to keep that
  time open or cancel it anyway.
- **B. It's cancelled, with a friendlier message.** Saving goes ahead. Because the booking is
  only minutes old, the family gets a different email: *"Coach Kim updated their schedule
  just as you booked. Here are other open times."*
- **C. The family keeps the lesson.** A booking made while you were editing is never
  cancelled by that save. Tuesday 4:00 stays as a one-off for that week, and the rest of
  the change goes ahead.
- **D. Times are hidden while you edit.** As soon as you preview a change, the times you're
  removing are hidden from families for about 15 minutes, or until you save or leave. The
  booking can't happen. But if you walk away without saving, those times were hidden for
  nothing.

A and B can go together: you choose, and if you cancel, the family gets the friendlier
message.

**Questions:**

1. If this happened to you, would you rather keep that one lesson or cancel it?
2. Would you want BladeBook to ask you each time (A), or just handle it one way (B or C)?
3. If a family's lesson is cancelled minutes after they booked it, how do you think they'd
   take it? Would a message explaining why be enough?
      **B. It's cancelled, with a friendlier message.** Saving goes ahead. Because the booking is
        only minutes old, the family gets a different email: *"Coach Kim updated their schedule
        just as you booked. Here are other open times."*
4. Would it bother you if times disappeared from your booking page while you were in the
   middle of editing (D)?
5. When you change your schedule, do you usually do it in a quiet moment, or while families
   are likely to be booking (for example, right after a session)?

**The owner's leaning, to test rather than assume:** A and B together. D is probably more
machinery than such a rare case needs.

**What the answers decide:**

- ~~**What the save does when a booking lands between preview and save**: ask the coach, cancel,
  or keep.~~ ***Settled 2026-10-08 from Kim's answer: B*** — the save goes ahead and the family
  gets the friendlier "just booked" email. (ADR-006, ADR-008, ADR-020)
- **Whether a separate "just booked, then cancelled" email template is needed.** *Yes, with B.* *Moved to Phase 2 by the owner, 2026-10-09.*
  (`FeatureDecriptions/Email templates Needed:`)
- **Whether slot holds during preview are built at all** (option D). *No, with B.*
- Underneath all options, the save would commit only if nothing was booked since the preview.
  This is a booking counter checked at save time. ~~It is **not yet recorded in any ADR**.
  It needs an amendment whichever option is chosen.~~ *Answered 2026-10-08:* recorded in the
  2026-10-08 amendments to ADR-006, ADR-008 and ADR-020. *2026-10-09: no counter in MVP, since
  the email it served is Phase 2.*

---

## 8. Sharing a lesson between skaters

**The scenario.** Two friends request a a semi-private lesson. Family1 add's the others skater using a short 
code from that family2. The family2 gets a message, confirms, and then both skaters are in the lesson. 
You decide, for each block of your schedule, how many skaters a lesson can have.

**Questions:**

1. ~~What's the most skaters you'd ever put in one lesson? 2? 3? More?~~ **Answered by the owner,
   2026-10-07: 2**, as a setting that may be raised later.
    2
2. ~~How do you charge for a shared lesson?~~ **Answered by the owner, 2026-10-13:** the lesson
   price is split between them ($50 lesson, two skaters, $25 each).
3. ~~If a second skater drops out, should the first skater's price change?~~ **Answered by the
   owner, 2026-10-13:** in time, the staying family chooses the full price or to cancel with no
   charge (no answer by ~~the start of the notice period~~ *the start of the notice period or 7
   days after the other skater left, whichever comes first (ADR-031, 2026-10-13)* cancels it); late, the one who drops out
   may be charged their share of the late-cancellation fee (half, for two skaters) and the other
   keeps their share of the price.
4. ~~Should you have to know and approve a skater before another family can invite them into a
   lesson with you?~~ **Answered by the owner, 2026-10-07:** a skater can be invited before you've
   accepted them, but no lesson is booked for them until you do. If you don't, the lesson goes
   ahead private.
   *The current flow:* the booking family enters the other skater's share code. That family is
   emailed straight away. If the skater isn't yet your student, the email asks the family to
   agree to join your roster; they sign in and confirm, and the skater appears in your pending
   list like any new family. Once you accept them, they join the lesson automatically, as long
   as it's still there ~~, hasn't started and has room~~ *and hasn't started. Their place is held
   from the moment the lesson is booked, so there is always room (ADR-031, 2026-10-13).* If you don't accept them, the lesson goes
   ahead private. (ADR-026 decision 5)
   *Superseded for MVP 2026-10-20 by ADR-033: only a skater you've already accepted can be invited
   to a shared lesson or added as a sibling. The invited family signs up with your code first.
   Inviting a skater new to you is Phase 2. No need to ask Kim.*
5. ~~If the family who booked the lesson cancels, what should happen to the skater they invited?~~
   **Answered by the owner, 2026-10-13:** the same as anyone dropping out (question 3). If the
   inviting family cancels before the other skater has joined, the invitation simply ends.
6. ~~If the invited family hasn't said yes by the day before, should the invitation lapse and the
   lesson go ahead private?~~ **Answered by the owner, 2026-10-13:** no cutoff. The invitation stays
   open until the lesson starts, then expires, and the lesson goes ahead private.
7. When one skater drops out in time, the other family chooses: keep the lesson at the full
   price, or cancel with no charge. They have until your notice period starts or 7 days after
   the other skater dropped out, whichever comes first. Is 7 days the right limit, or should it
   be shorter or longer? *Added 2026-10-13 (ADR-031 decision 8).*

**The owner's leaning, to test rather than assume:** for question 5, ask the invited family
whether to continue; for question 6, the invitation lapses at your notice period (24 hours by
default) and the booking family is told. Both depend on the pricing answer. *2026-10-13: pricing and question 5 are settled (question 5
differently: no special case for the booking family). Only question 6 remains.* *2026-10-13: question 6 answered by the owner too: no cutoff.* *2026-10-13:
question 7 added (ADR-031).*

**What the answers decide:**

- ~~**The highest "skaters per lesson" a coach can set** (question 1).~~ **Answered by the owner,
  2026-10-07: 2.** (ADR-026 P1)
- ~~**How each skater's price is stamped**, and whether anyone is re-priced when a skater joins or
  leaves (questions 2 and 3).~~ **Answered by the owner, 2026-10-13:** the set price split evenly;
  ~~both skaters re-stamped when the second joins~~ (ADR-026). (ADR-026 P2, ADR-003, ADR-020)
  *Revised 2026-10-13 (ADR-031 d7): no amount is stored; each share is worked out from the lesson
  time.*
- ~~**Whether an invited skater must be approved first** (question 4).~~ **Answered by the owner,
  2026-10-07:** invited first, accepted by the coach before joining. (ADR-026 P3, ADR-024)
  *Superseded 2026-10-20 (ADR-033): accepted first; only ACTIVE skaters can be invited.*
- ~~**What the booking family cancelling does** (question 5)~~ *answered 2026-10-13: same as anyone
  leaving;* ~~and **when invitations lapse**
  (question 6)~~ *answered 2026-10-13: no cutoff; an invitation expires when the lesson starts.* (ADR-026 P4, P5) *P5 is partly answered: if the coach doesn't accept the skater,
  the lesson goes ahead private.* *(moot since ADR-033, 2026-10-20)*
- **How long the staying family has to answer** (question 7). The owner chose 7 days; Kim's
  answer can change it. (ADR-031 decision 8, `Open-Pending.md` §2a) *Added 2026-10-13.*

---

## 9. Skating membership numbers

**The scenario.** The sign-up notes say families must enter a USFSA or USA Hockey registration
number to sign up, and that a coach's own registration number would be their coach code, the
code families type to find them. Both numbers can change each season.
*Update 2026-10-12: the coach-code half is dropped; BladeBook generates the code.*

**Questions:**

1. Do all your skaters have a USFSA or USA Hockey number? What about adults skating for fun, or
   beginners in learn-to-skate?
   Everyone must have a number. Coaches must give the number to the rink(s) but have no obligation 
   to validate the students number. The rinks do that. 
   *Answered by Kim, recorded 2026-10-16.*
2. Why do you need a skater's number? Insurance, competition and test eligibility, something
   else? - see above
   *Answered by Kim, recorded 2026-10-16: the rinks require it; the coach passes it on.*
3. Do you check that a family's number is current each season? What happens if it has lapsed:
   would you still teach them?
   Do not need to check, just need the student to give it to the coaches. 
   --Phase 3: Have a reminder for renewing memebership/ updating skating organization number.
   *Answered by Kim, recorded 2026-10-16.*

4. Does each skater have their own number, or is it one per family?
  --each skater their own number
   *Answered by Kim, recorded 2026-10-16.*
5. ~~Would you be comfortable with your own registration number being the code families use to
   find you?~~ *No need to ask. The owner decided 2026-10-12 that BladeBook generates the coach
   code.*
6. Do you, or coaches you know, teach any skaters registered in Canada (Skate Canada, Hockey
   Canada)? *The owner moved Canada to Phase 2 on 2026-10-12; her answer only tells us how
   soon it's needed.*
7. What does a US Figure Skating member number look like: how many digits, any letters? Is a
   Learn to Skate USA number different? *Needed to check the number when a family types it in.*
   *Still open 2026-10-16. Learn to Skate USA numbers are now accepted (question 8), so their
   format is needed too.*
8. ~~Should Learn to Skate USA numbers be accepted for beginners?~~ *Decided by the owner
   2026-10-16: yes, as a third kind of number.*
9. ~~How do coaches give the numbers to the rinks?~~ *Decided by the owner 2026-10-16: a
   download on the coach's Students tab, with Student First Name, Student Last Name and Skater
   Number.*

**What the answers decide:**

- ~~**Whether a membership number is required at all, optional, or per skater**~~ *The owner
  decided 2026-10-12: required, per skater.* ~~Still open: skaters who don't have a number yet,
  and what happens when one expires (questions 1–4).~~ *Answered 2026-10-16: everyone must have
  one; nothing happens when it lapses in MVP, and a renewal reminder is Phase 3.*
- ~~**Whether a coach's registration number can safely be their coach code**~~ *Decided
  2026-10-12: no, BladeBook generates it.*
- ~~**Whether Canadian skaters and coaches are supported**~~ *Decided 2026-10-12: Phase 2.*
- **The validation rule for US Figure Skating and Learn to Skate USA numbers** (question 7, `Open-Pending.md` §2b).

---

## 10. How many coaches one skater has

*Answered by the owner, 2026-10-07:* **no limit.** A skater signs up with **1 to 10 coaches** and
adds more later as needed. The questions below are **Phase 2**: keep them to check the owner's
number and to inform *"Also coached by"*, which moved to Phase 2 (ADR-025 decision 4).

**The scenario.** Since ADR-025 a skater can have any number of coaches, and a family can
enter several coach codes when they sign up. The owner expects 1 to 10 at sign-up, with more
added as needed, so the multi-coach screens are designed for about 10.

**How it works today, for context:**

- One skater has **one ID** across every coach, and each coach approves the skater separately.
  A family can be approved by one coach and still waiting on another.
- *(Phase 2)* Each coach sees **"Also coached by: Sam Ortiz"** on the skater's record — first
  and last name only, and only between approved links. Nothing else crosses between coaches.
- A family's contact or skater edit is copied out to **every** coach by a background job, so the
  work grows with the number of coaches.
- When a family books, BladeBook **warns** about a lesson that overlaps one with another coach
  but still lets them book — back-to-back lessons at the same rink are expected.

**Questions (all Phase 2):**

1. How many coaches do your skaters usually work with at once? One, two, more?
2. What is the most you have seen one skater have at the same time?
3. Does it change through the season — more coaches in competition season than in the summer?
4. How often does a skater add or drop a coach?
5. Is seeing the other coaches' **names** useful to you, or would you rather not see them at
   all? Is there anything else about a skater's other coaching/coach you would actually want?

**What the answers decide:**

- ~~**Whether a cap on coaches per skater is set at all.**~~ **Settled by the owner: no limit**
  (ADR-025 Open; `Open-Pending.md` §2).
- **Whether the multi-coach screens' layout holds up** (questions 1–3): the coach switcher,
  lessons and payments grouped by coach, and each skater's list of coaches, designed for about
  10. (ADR-025 decision 7; `Open-Pending.md` §2 to-do)
- **Whether "Also coached by" ships in Phase 2 at all**, and whether it stays a plain list or
  needs grouping or truncating (question 5). It is a deliberate narrow exception to keeping
  coaches' data apart, and ADR-025 already says it can be dropped or made opt-in if a coach
  objects. (ADR-025 decision 4, "Revisit if")
- **Whether adding and dropping coaches mid-season needs more than today's remove flow**
  (question 4), including what the family sees when one coach removes their skater while another
  keeps them. *Removing a student is Phase 2 (owner, 2026-10-13).* (ADR-025 Open; blocker #17)

---

## 11. Rink fees

- [ ] **To-do: Go through `Q_Rink-Fees.md` with Kim** (Part A, questions 1–17). It's complex
  enough to need its own session, so it's kept in its own document. Record her answers there.

---

## 12. Skating organizations and their numbers

*Added 2026-10-20.* Follows on from §9.

**The scenario.** When a family signs up, each skater picks the organization that issued their
number, then types the number. In Phase 1 the list has three: **US Figure Skating**, **USA
Hockey** and **Learn to Skate USA**. Skate Canada and Hockey Canada are Phase 2 (ADR-029). A
skater whose organization isn't on the list can't sign up.

**Other organizations that might apply, for her to confirm or rule out** (not researched in
depth):

- **Ice Sports Industry** (formerly the Ice Skating Institute): recreational skating and its
  own competitions, popular at rink-run programs.
- **US Speedskating**.
- **USA Ringette**.
- Adult or recreational hockey leagues with their own registration, if they don't go through
  USA Hockey.

**Questions:**

1. Are there organizations other than US Figure Skating, USA Hockey and Learn to Skate USA
   whose numbers your rinks ask for? Which ones?
2. Do any of your skaters belong to Ice Sports Industry, US Speedskating or USA Ringette instead
   of the three above?
3. Can a skater belong to **more than one** organization (say, US Figure Skating and Ice Sports
   Industry)? If so, does the rink want every number, or just one?
4. Which organization's number does the rink want when a skater has several?
5. For any new organization, what does its number look like: how many characters, digits only
   or letters too?

**What the answers decide:**

- **Which organizations go on the sign-up list** (`skatingOrg`, ADR-029 decisions 2–3). Each new
  one needs a value and a shape check.
- **Whether a skater can have more than one number.** Today it's one number from one
  organization per skater (ADR-029 decision 1). More than one would change the `SKATER#` item,
  the sign-up and profile screens, and the rink download.
- **What the rink download holds** if a skater has several numbers (ADR-029, amended
  2026-10-16).

---

## 13. Coaches who are also parents

*Added 2026-10-23.*

**The scenario.** Some coaches have a child who skates, or take lessons themselves. BladeBook will
let one account be both a coach and a family, with one email and password (owner, 2026-10-23).

**Questions:**

1. How common is it for a coach to have a child who skates, or to take lessons themselves?
2. Does that child usually take lessons with their own parent, or with another coach?

**What the answers decide:**

- How much effort goes into the switch between the coach and family sides
  (`FeatureDecriptions/Coach Who Is Also a Parent.md`, question 2).
- Whether a coach can book lessons with themselves, and whether their own skater needs approval
  (question 4).

---

## 14. Special schedules set up by mistake

*Added 2026-11-12.*

**The scenario.** A coach can now delete time off or a special schedule. Deleting a special
schedule puts the normal week back on those dates, which can cancel lessons families booked under
it. Today every family affected is emailed straight away. If a coach sets up the wrong special
schedule and deletes it, families could get an email for a mistake.

**Questions:**

1. How likely is it that a coach adds the wrong special schedule (wrong dates, wrong times, wrong
   prices) and has to remove or redo it?
2. If that happened, would you rather families were emailed at once, or would you rather check
   and send the emails yourself?

**What the answers decide:**

- Whether Phase 2 stops emailing families automatically after a schedule change, and lets the
  coach review and send instead (`FeatureDecriptions/C_Coach Schedule Hub.md`, "Deleting time off
  or a special schedule").

---

## Already waiting on a coach

These came up earlier and are recorded in `Open-Pending.md` as needing coach input.

### 2. Being told about client cancellations

1. When a family cancels a lesson, do you want a text and email **every** time, or only when
   it is late — inside your notice period? (Coaches can opt in to a text for this in MVP.)

   -Inside the notice period

**Decides:** whether the cancellation notice to the coach has a threshold. Today it sends on
every cancellation. ***Settled 2026-10-08 from Kim's answer:*** *only cancellations inside the
coach's notice period (`requiredNoticeHours`) notify the coach (ADR-009).* (ADR-009 Open; the note in `FeatureDecriptions/Email templates Needed:`
reads *"check if needed from kim"*.)

### 3. Keeping records of cancelled lessons

1. Do you need records of cancelled lessons for taxes or your own bookkeeping?
2. If so, for how long?
3. If so, which records? (ie that they booked, that they attended lesson(s), something else)

**Decides:** the floor for how long cancellation records are kept before they expire from the
live system and move to the archive. (ADR-006, ADR-009, ADR-017)

### 4. Reminders about unpaid lessons

1. If a lesson is still marked unpaid, after how long would you want a reminder — a week, a
   month, longer?
2. Weekly on Monday morning — is that a good time to get it?
3. If you ignore it, should it remind you again, or once is enough?

**Decides:** the threshold, cadence and repeat of the weekly unpaid-lesson email to the coach.
The job is switched off until the threshold is set. (ADR-018)
