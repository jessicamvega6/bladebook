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

- [ ]

## Family app

- [ ] Home page: add padding to the bottom of the **Today** and **Coming up** cards
  (`web/src/family/pages/Home.tsx`).
- [ ] My bookings: remove the **Shared lesson** badge from a lesson once the original invitee
  has left it, so it's no longer shared.

## Rinkside app

- [ ]

## Shared / everywhere

- [ ]

## Code tidy-ups

- [ ] `CoachRepository` and `ScheduleRepository` each keep a private copy of the one-line
  `s(String)` helper (wraps a string as a DynamoDB string value). Every repository written
  since Batch 3 uses the shared `FamilyItems.s(...)` instead. Switch these two over and delete
  their copies (`CoachRepository.java:254`, `ScheduleRepository.java:432`).
