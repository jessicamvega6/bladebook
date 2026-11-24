# BladeBook — Polish List

**Purpose:** Small things noticed while using the app that should change: wording, layout,
spacing, colours, button labels, ordering. One line per item. Anything that turns out to need a
real decision moves to `Open-Pending.md`; anything that needs a coach's view goes to
`Items to ask Kim About.md`.

**How to add an item:** put it under the app it's in, and say what bothers you. Add what you'd
prefer if you know.

**When it's done:** strike it through and add *Done <date>* (and the batch or pull request).

---

## Coach app

- [ ] Schedule, **Your teaching week**: remove "no dates, just the shape of your week" from the
  line under the heading, leaving "Repeats every week." (`web/src/coach/pages/Schedule.tsx:501`).
- [ ] **New feature:** Schedule: let the coach delete their normal (weekly) schedule. Doing so
  removes every lesson time from the calendar except the dates covered by a special schedule.
  Special schedules and time off can already be deleted one by one; the weekly schedule
  can't (`web/src/coach/pages/Schedule.tsx:128`). Booked lessons in the removed times: treat
  it like any other schedule change and reuse what exists today, i.e. the same review
  (`ChangeReview`, from `previewWeekly` with no blocks), cancellations, schedule-change emails
  and save status as editing the weekly schedule (owner, 2026-11-23).

## Family app

- [ ] Book page: remove the **Taller = longer lesson** note from the legend
  (`web/src/family/pages/Book.tsx:452`).
- [ ] Log in page: add more space between the **Password** field, the **Forgot/change password**
  link and the **Log in** button; they sit too close together (`web/src/family/pages/Login.tsx:62`).
- [ ] Home page: add padding to the bottom of the **Today** and **Coming up** cards
  (`web/src/family/pages/Home.tsx`).
- [ ] My bookings: remove the **Shared lesson** badge from a lesson once the original invitee
  has left it, so it's no longer shown as "shared" as it is a private lesson now.
- [ ] Home page, **Today** card: remove any text about upcoming lessons (e.g. "Next: Sully, Wed,
  Nov 18 at 5am" under "No lessons today"). The Today card is only about what's happening
  today; upcoming lessons belong in **Coming up** (`web/src/family/pages/Home.tsx:144`).
- [ ] Profile, **Your coaches**: the dashed border around **Add a coach** is wonky. The dots
  are missing from the bottom-left and bottom-right corners (`web/src/family/pages/Profile.tsx`).
- [ ] Profile, **Add a coach**: if the code entered belongs to a coach this family is already
  with, say so plainly (a duplicate message, e.g. "You're already with Coach Kim"). Today it
  only shows "Already Coach Kim's student" beside each skater, which is easy to miss
  (`web/src/family/pages/Profile.tsx:275`).
- [ ] Profile: make the **Add a skater** and **Add a coach** buttons more distinct. Right now
  they're plain dashed add-rows that blend into the cards (`Profile.tsx:162`, `Profile.tsx:237`).
- [ ] Profile: move the **Save** button for the family's details (name, email, mobile) up to
  that part of the form. It currently sits at the very bottom beside **Log out**, far from the
  fields it saves (`Profile.tsx:135`).

## Rinkside app

- [ ]

## Shared / everywhere

- [ ] **New feature:** sign-up pages, coach and family: let the password be shown, not just
  dots, so people can check what they typed. Family sign-up has **Password** and
  **Confirm password**; coach sign-up has **Password** only
  (`web/src/coach/pages/SignIn.tsx:239`, `web/src/family/pages/Signup.tsx:260`).
- [ ] Change any text that says **No ice** to **Not available**. In the app today that's the
  day label on the family **Book** page for a day with no lesson times
  (`web/src/family/pages/Book.tsx:403`); the designs under `design/harbor/` and
  `FeatureDecriptions/Bookings` say it too. Leave "has no ice type" alone: that's a schedule
  error about a block with no ice type picked, not a day without lessons.

## Code tidy-ups

- [ ] `CoachRepository` and `ScheduleRepository` each keep a private copy of the one-line
  `s(String)` helper (wraps a string as a DynamoDB string value). Every repository written
  since Batch 3 uses the shared `FamilyItems.s(...)` instead. Switch these two over and delete
  their copies (`CoachRepository.java:254`, `ScheduleRepository.java:432`).
