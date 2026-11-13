Coach Schedule Hub
(Written 2026-10-12 from the Harbor design: design/harbor/coach/static/schedule-hub.html)

The landing page of the Schedule section ("Your schedule"). Reached from Schedule in the main navigation.
The editors it leads to are described in Schedule Creater.md and C_Coach Time Off.md.

Two ways in:
  Edit weekly schedule: the coach's normal week, which repeats until they change it. The card shows the
    days it runs, how many blocks it has and how many lessons a week. Opens the weekly editor.
  Add time off or a special schedule: for a set range of dates, e.g. vacation, a tournament, a camp or
    holiday hours. Opens the "What's different about these dates?" choice (see C_Coach Time Off.md).

No schedule yet:
  *Settled by the owner, 2026-08-30:* for the coach, an empty schedule is a task, not a status, so their own view
  prompts them to build a schedule. (Families see an all-grey calendar with a line saying the coach hasn't posted
  any times yet; see Bookings:.) *(from ADR-008 Open, moved 2026-11-08)*

Time off and special schedules:
  Every upcoming one, with its name, whether it's a special schedule or time off ("No lessons"), its dates,
  and an Edit button.
  *Built 2026-11-12 (Batch 6): Edit shows on a special schedule only, as the design draws it.*
  *Decided by the owner 2026-11-12: time off gets Edit too (implementation plan, Batch 21). Changing its dates goes
    through the same review page, which lists only the dates added or removed, so families hear only about lessons
    that actually change. Not in the Harbor design yet.*

Deleting time off or a special schedule:
  *Added by the owner, 2026-11-12. Not in the Harbor design.*
  Every one in the list has a Delete button, time off and special schedules alike.
  Delete opens the same review page as any schedule change (see Schedule Creater.md), titled
  "Delete <name> · <dates>":
    Time off: "families can book these dates again". The weekly schedule's times come back on those
      dates, so nothing is cancelled.
    Special schedule: "your weekly schedule applies to these dates again". Lessons the special schedule
      made that the weekly schedule doesn't are cancelled; lessons whose price differs are re-priced, by
      the usual rules (Re-pricing Booked Lessons.md). The review lists them and the families emailed.
  Nothing is deleted until the coach accepts. Deleting needs a sign-in from the last 15 minutes, like any
    schedule save. After accepting, the save status page follows (C_Coach Schedule Save Status.md).
  A deleted one is gone: there's no undo. The coach adds it again if it was a mistake.
  Past dates of one that has already started (a camp under way) aren't changed: past lessons are never
    cancelled or re-priced.
  *Phase 2 note (owner, 2026-11-12):* if Kim says coaches are likely to add the wrong special schedule
    (Items to ask Kim About.md §14), take out the automatic emailing of families after a schedule change,
    so a mistake and its fix don't email families twice. The coach would review and send the emails instead.

Booked lessons coming up:
  The upcoming booked lessons: skater, date and time, length and price.
  Note: changes are checked against these before anything is saved. A change that would cancel or
  re-price any of them is shown on the review page first (see Schedule Creater.md).
