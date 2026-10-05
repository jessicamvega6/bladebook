# Items to Ask Kim About

**Started:** 2026-09-30
**Purpose:** Questions only a working coach can answer. Each one is holding up a decision in
the design. Plain-language questions first; what each answer decides is underneath, for
recording afterwards.

---

## 1. How often do prices and schedules change, and how far ahead do families book?

**The scenario.** A coach's weekly schedule (days and times) may stay the same for months
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

**Decides:** the floor for how long cancellation records are kept before they expire from the
live system and move to the archive. (ADR-006, ADR-009, ADR-017)

### 4. Reminders about unpaid lessons

1. If a lesson is still marked unpaid, after how long would you want a reminder — a week, a
   month, longer?
2. Weekly on Monday morning — is that a good time to get it?
3. If you ignore it, should it remind you again, or once is enough?

**Decides:** the threshold, cadence and repeat of the weekly unpaid-lesson email to the coach.
The job is switched off until the threshold is set. (ADR-018)
