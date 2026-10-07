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
- **A lesson keeps the price it was booked at.** Raising the price only affects lessons booked
  after the change. A family with a weekly recurring booking made in September pays the
  September price for every lesson up to 12 months ahead.
- The booking page shows three months ahead. Recurring bookings can run up to 12 months. A
  single lesson has no limit at all behind the scenes.

**Questions:**

1. How often do you change your prices? Once a season, once a year, whenever?
2. When you change them, is it for everyone at once, or student by student?
3. How often does your weekly schedule (days and times) change?
4. When you raise your price, should lessons **already booked** for the future stay at the old
   price, or move to the new one? Does it matter whether they are recurring?
5. How far ahead do your families usually book? Would anyone want to book a single lesson more
   than three months out?
6. When you raise or lower your prices, **by how much** do you usually change them? Roughly a
   percentage — 5%, 10%, 25%?

**What the answers decide:**

- Whether single bookings get a date ceiling, and what it is — none, 12 months, or the booking
  page's three months. (ADR-006 Open; `Open-Pending.md` §4)
- ~~Whether a price change should ever re-price lessons already booked.~~ *Decided by the
  owner 2026-09-30 (ADR-020): upcoming lessons follow the new price — increases only beyond
  the notice period, decreases at once — and families are told.* Kim's answer to question 4 is
  still worth hearing as a check.
- **How large a price change should trigger the preview's "check this amount" warning**
  (question 6). The warning exists to catch typos like $60 entered as $6; the trigger should
  sit above a normal price change. (ADR-020 decision 4)

---

## 5. Discounts for a family

**The scenario.** A family falls on hard times and the coach wants to charge them less for a
while. Today BladeBook offers two ways, and they don't fit together well:

- **A per-student price** (`priceMinorOverride`): one fixed amount that replaces the normal
  price on every lesson that student books — whatever the lesson's length, and unaffected by
  the coach's later price changes.
- **Editing one booking's price by hand** (ADR-003 decision 2). This one causes a problem:
  since ADR-020, upcoming lessons follow the coach's current price, and nothing can tell a
  hand-edited price from an out-of-date one — so the next schedule save would put it back.

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
- **Whether hand-editing one booking's price stays.** If it goes, re-pricing needs no
  exceptions. If it stays, ADR-020 needs a way to mark hand-set prices so they are never
  re-priced. (ADR-003 decision 2, ADR-020)
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
2. How quickly would you usually get to an approval? Same day, or could a family wait a few
   days?
3. Have you ever had someone you didn't know try to book lessons with you?
4. Would you want to approve **siblings** added later by a family you already know, or should
   they be let in automatically?

**What the answers decide:**

- **Whether the `PENDING` step stays in MVP**, and with it whether a pending family sees
  nothing of the coach's (ADR-002 decision 2, ADR-022 decision 6). If it goes, the security
  case has to be made another way — for example, codes that expire or can be used only a few
  times.
- **Whether a sibling of an approved family skips approval** (question 4). Today the family
  can see the schedule once one skater is approved, but cannot book for the pending sibling.
- **Whether a slow approval needs a reminder to the coach** (question 2). There is none today.

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
4. Would it bother you if times disappeared from your booking page while you were in the
   middle of editing (D)?
5. When you change your schedule, do you usually do it in a quiet moment, or while families
   are likely to be booking (for example, right after a session)?

**The owner's leaning, to test rather than assume:** A and B together. D is probably more
machinery than such a rare case needs.

**What the answers decide:**

- **What the save does when a booking lands between preview and save**: ask the coach, cancel,
  or keep. (ADR-006, ADR-008, ADR-020)
- **Whether a separate "just booked, then cancelled" email template is needed.**
  (`FeatureDecriptions/Email templates Needed:`)
- **Whether slot holds during preview are built at all** (option D).
- Underneath all options, the save would commit only if nothing was booked since the preview.
  This is a booking counter checked at save time, and it is **not yet recorded in any ADR**.
  It needs an amendment whichever option is chosen.

---

## 8. Sharing a lesson between skaters

**The scenario.** Two friends request a a semi-private lesson. Family1 add's the others skater using a short 
code from that family2. The family2 gets a message, confirms, and then both skaters are in the lesson. 
You decide, for each block of your schedule, how many skaters a lesson can have.

**Questions:**

1. What's the most skaters you'd ever put in one lesson? 2? 3? More?
2. How do you charge for a shared lesson?
   - Each skater pays their normal private price?
   - The lesson price is split between them (e.g. $60 lesson, two skaters, $30 each)?
   - A set "shared lesson" price per skater (e.g. $40 each)?
3. If a second skater drops out, should the first skater's price change?
4. Should you have to know and approve a skater before another family can invite them into a
   lesson with you? (This connects to question 6 above about approving families at all.)
5. If the family who booked the lesson cancels, what should happen to the skater they invited?
   Keep the lesson for them, cancel it for everyone, or ask the invited family?
6. If the invited family hasn't said yes by the day before, should the invitation lapse and the
   lesson go ahead private?

**The owner's leaning, to test rather than assume:** for question 5, ask the invited family
whether to continue; for question 6, the invitation lapses at your notice period (24 hours by
default) and the booking family is told. Both depend on the pricing answer.

**What the answers decide:**

- **The highest "skaters per lesson" a coach can set** (question 1). Until it's answered every
  lesson stays private. (ADR-026 P1)
- **How each skater's price is stamped**, and whether anyone is re-priced when a skater joins or
  leaves (questions 2 and 3). (ADR-026 P2, ADR-003, ADR-020)
- **Whether an invited skater must be approved first** (question 4). (ADR-026 P3, ADR-024)
- **What the booking family cancelling does** (question 5), and **when invitations lapse**
  (question 6). (ADR-026 P4, P5)

---

## 9. Skating membership numbers

**The scenario.** The sign-up notes say families must enter a USFSA or USA Hockey registration
number to sign up, and that a coach's own registration number would be their coach code, the
code families type to find them. Both numbers can change each season.

**Questions:**

1. Do all your skaters have a USFSA or USA Hockey number? What about adults skating for fun, or
   beginners in learn-to-skate?
2. Why do you need a skater's number? Insurance, competition and test eligibility, something
   else?
3. Do you check that a family's number is current each season? What happens if it has lapsed:
   would you still teach them?
4. Does each skater have their own number, or is it one per family?
5. Would you be comfortable with your own registration number being the code families use to
   find you? Is your number written anywhere public, like a certificate, rink website or coach
   directory?
6. Do you, or coaches you know, teach any skaters registered in Canada (Skate Canada, Hockey
   Canada)?

**What the answers decide:**

- **Whether a membership number is required at all, optional, or per skater**, and what happens
  when it expires (questions 1–4).
- **Whether a coach's registration number can safely be their coach code**, or the code stays a
  random BladeBook code with the registration number kept separately (question 5, together with
  the validation research in `Open-Pending.md` §2b).
- **Whether Canadian skaters and coaches are supported**, which a USFSA/USA Hockey requirement
  would rule out (question 6).

---

## 10. How many coaches one skater has

**The scenario.** Since ADR-025 a skater can have any number of coaches, and a family can
enter several coach codes when they sign up. No ceiling was set — the ADR assumes "a handful is
fine." Before the multi-coach screens are designed, it is worth knowing what the real number
is, because a design that reads well for two coaches may not for five.

**How it works today, for context:**

- One skater has **one ID** across every coach, and each coach approves the skater separately.
  A family can be approved by one coach and still waiting on another.
- Each coach sees **"Also coached by: Sam Ortiz"** on the skater's record — first and last name
  only, and only between approved links. Nothing else crosses between coaches.
- A family's contact or skater edit is copied out to **every** coach by a background job, so the
  work grows with the number of coaches.
- When a family books, BladeBook **warns** about a lesson that overlaps one with another coach
  but still lets them book — back-to-back lessons at the same rink are expected.

**Questions:**

1. How many coaches do your skaters usually work with at once? One, two, more?
3. What is the most you have seen one skater have at the same time?
4. Does it change through the season — more coaches in competition season than in the summer?
5. Do siblings in one family usually share a coach, or end up with different ones?
6. How often does a skater add or drop a coach?
7. Is seeing the other coaches' **names** useful to you, or would you rather not see them at
   all? Is there anything else about a skater's other coaching/coach you would actually want?
2. What are the different coaches for — figure skating and power skating, choreography,
   off-ice or strength, dance, a specialist for jumps or spins?

**What ADR-025 assumes, to test rather than assume:** no limit, because "a handful is fine."
If two is the normal case and four is rare, that is worth knowing before the screens are drawn.

**What the answers decide:**

- **Whether a cap on coaches per skater is set at all, and what it is.** None today. The
  per-coach fan-out and the "Also coached by" list both grow with the number. (ADR-025 Open;
  `Open-Pending.md` §2)
- **How the multi-coach screens are laid out** (questions 1, 3 and 5): the coach switcher,
  lessons and payments grouped by coach, and each skater's list of coaches. None of these are
  designed yet, and the right layout for two coaches differs from the right one for five.
  (ADR-025 decision 7; `Open-Pending.md` §2 to-do)
- **Whether "Also coached by" stays a plain list** or needs grouping or truncating, and
  whether it stays at all (question 7). It is a deliberate narrow exception to keeping coaches'
  data apart, and ADR-025 already says it can be dropped or made opt-in if a coach objects.
  (ADR-025 decision 4, "Revisit if")
- **How the clash warning should read when a skater has several coaches** (question 2) — whether
  naming the other coach per clash is enough, and whether frequent back-to-back lessons make the
  warning noise. (ADR-025 decision 5)
- **Whether adding and dropping coaches mid-season needs more than today's remove flow**
  (question 6), including what the family sees when one coach removes their skater while another
  keeps them. (ADR-025 Open; blocker #17)

---

## Already waiting on a coach

These came up earlier and are recorded in `Open-Pending.md` as needing coach input.

### 2. Being told about client cancellations

1. When a family cancels a lesson, do you want a text and email **every** time, or only when
   it is late — inside your notice period? (Coaches can opt in to a text for this in MVP.)

**Decides:** whether the cancellation notice to the coach has a threshold. Today it sends on
every cancellation. (ADR-009 Open; the note in `FeatureDecriptions/Email templates Needed:`
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
