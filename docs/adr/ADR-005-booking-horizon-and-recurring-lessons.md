# ADR-005: Booking Horizon, Temporary Schedule Activation, and Deferred Recurring Lessons

## Status

**Largely superseded by [ADR-006](ADR-006-open-booking-recurring-lessons-and-cancellation.md)**
— 2026-08-15. Decisions **1** (7-day booking horizon), **3** (the horizon as the bound
on a schedule change's blast radius) and **4** (recurring lessons deferred to Phase 2)
are all replaced: there is no horizon, and recurring lessons are MVP. Decision **2** (a
temporary schedule is resolved by the date being booked, not by today) survives, and
becomes trivially true once overrides are keyed by date. The Open question "rolling
daily or weekly batch?" is answered: neither.

**Accepted** — 2026-07-31.

Amends (does not supersede):
- ADR-004 decision **3**, which stated the resolution rule for temporary schedules
  but not when one takes effect.
- ADR-004 decision **6**, whose rebooking blast radius was unbounded.

ADR-004 decisions **1**, **2**, **3a**, **4** and **5** are unaffected.

---

## Context

ADR-004 established that availability is computed from a default weekly pattern plus
bounded temporary overrides. Two things were left unstated, and they turn out to be
the same question:

**When does a temporary schedule start affecting what clients see?** ADR-004 says
"if a temporary schedule covers `D`, it wins" — which is a rule about the date being
booked, not about the moment of activation. A coach saving a two-week override three
weeks out reasonably expects nothing to happen today.

**How far into the future can a schedule change do damage?** ADR-004 decision 6
releases every booking the new pattern cannot produce. With no limit on how far
ahead clients can book, one save could release months of lessons and send an
unbounded pile of email.

The owner has since specified a **7-day booking horizon**, and asked that recurring
lessons — which interact with the horizon directly — be specified but deferred.

---

## Decision

### 1. Clients can book at most 7 days ahead

A rolling window: today through today + 7 days, in the coach's IANA timezone
(ADR-001 decision 4). Availability outside that window is not returned, regardless of
what pattern would apply there.

The horizon is enforced **server-side at booking creation**, not only by hiding dates
in the UI. A `POST` for a date beyond the horizon is rejected.

For MVP, clients book each week for the week ahead. There is no way to reserve a
standing time — see decision 4.

### 2. A temporary schedule is resolved by the date being booked, not by today

A temp carries `startDate` and `endDate`, **both inclusive**. The pattern in effect
for a date `D` is the temp whose window contains `D`, otherwise the default.

This satisfies "the temp applies starting on its start date" — dates before
`startDate` keep the default, and today's schedule is untouched unless `startDate` is
today. What it *also* does is govern dates inside the window as soon as they enter the
horizon.

**Why not make the temp dormant until today reaches `startDate`:** a temp starting in
three days has dates 3 through 7 already visible and bookable. Rendering those under
the default would let clients book lessons the system already knows the temp is going
to destroy — then release them days later. Resolving by target date means a temp's
window is never bookable under a pattern that won't hold.

### 3. The horizon bounds the blast radius of a schedule change

ADR-004 decision 6 stays exactly as written — the rebooking pass is triggered by the
schedule write, via `ScheduleChanged`. The horizon adds a guarantee it did not have:

| Change affects | Bookings that can exist there | Result |
|---|---|---|
| Only dates more than 7 days out | None | Zero conflicts, zero emails; the consumer no-ops |
| Dates inside the horizon | At most 7 days' worth | Bounded conflict set, resolved at save time |

Two consequences follow:

- **No scheduled activation job is needed.** A dormant-until-`startDate` model would
  have required a daily sweep to catch bookings invalidated at activation, and would
  have surfaced the fallout days after the coach made the decision. Date-based
  resolution plus a 7-day horizon removes the need for either.
- **A coach who plans more than a week ahead never destroys anything.** Schedule
  changes are free when they land outside the horizon, which is the common case for
  vacations and seasonal changes.

### 4. Recurring lessons are Phase 2

**MVP behavior: clients sign up each week.** There is no standing booking, no
auto-booking, and no start-of-week email. The only scheduled jobs remain the two in
`architecture.md` §8.

The design below is recorded so Phase 2 does not restart from nothing. **None of it
is built for MVP.**

#### 4a. Design sketch — recurring lessons (not built)

A recurrence is a **standing intent**, not a booking:

```jsonc
// PK = COACH#<coachId>   SK = RECURRING#<WEEKDAY>#<startTime>
{ "studentId": "s7", "clientId": "c3", "startedOn": "2026-08-03" }
```

It holds a weekday and a start time and nothing else. No price and no duration —
those come from whichever block generates that slot at the moment it is materialized,
and are stamped onto the booking then, per ADR-003 decision 2.

**Materialization.** As the horizon rolls forward, a scheduled Lambda queries
`SK begins_with RECURRING#` for each coach, resolves the pattern in effect for each
newly-opened date, and writes ordinary `BOOKING#<date>#<startTime>` items using
ADR-004 decision 2's conditional put. After that point they are indistinguishable from
lessons a client booked by hand.

**Ordering is the load-bearing constraint.** The recurring writes must land *before*
the newly-opened dates become visible to clients, or an ad-hoc client races a
recurring client for the same slot and wins. The job advances the horizon as its final
step.

**Email.** A start-of-week digest of that week's auto-booked lessons. Day-of reminders
need no change at all — by then these are ordinary bookings, and
`sched-day-reminder`'s `Query(GSI2PK = DATE#today)` picks them up unmodified.

**Recurring intents are immune to schedule changes.** They are not bookings, so
ADR-004 decision 6 never sees them. A coach changing their default or adding a temp
does not disturb them; each week they simply resolve against whatever pattern is in
effect when that week opens.

**This probably changes what the horizon means.** A start-of-week digest only makes
sense if the window opens a week at a time, which is a weekly batch rather than the
rolling daily window in decision 1. Under a batch, the bookable range breathes between
7 and 14 days depending on the day of the week. Unresolved — see Open.

---

## Model changes to `architecture.md`

**Added:** a booking horizon (7 days), constraining both availability reads and booking
creation.

**Changed:** access pattern 4 ("list a coach's availability for a date range") clamps
the requested range to the horizon, on top of ADR-004's change making it a bookings
query plus pattern expansion.

**Unchanged for MVP:** no new items, no new Lambdas, no new events, no new scheduled
jobs.

**Phase 2 would add:** the `RECURRING#` item, a materialization job that also advances
the horizon, and a weekly digest email.

---

## Consequences

**Easier.** Schedule-change conflicts are bounded at 7 days instead of unbounded, and
in the common case the `ScheduleChanged` consumer finds nothing to do. Temporary
schedules need no activation machinery. MVP adds no infrastructure.

**Harder — and this is a product cost, not a technical one.** A coach cannot publish a
season of availability, and families cannot book a month out. For a coach whose clients
plan ahead, a 7-day window is a plausible first complaint, and recurring lessons are
what would make it tolerable. Deferring them to Phase 2 means MVP asks every family to
re-book weekly, including the ones who have had the same Wednesday slot for two years.

The horizon must be enforced in the API, not just the UI, or it is not a constraint.

---

## Open

- **Rolling daily or weekly batch?** MVP is rolling (`today` … `today + 7`) because it
  is the simpler thing and nothing depends on the distinction yet. Recurring lessons
  likely force a weekly batch. Decide at the start of Phase 2 — it changes what "the
  horizon" means, not just how it is computed.
- **Should a coach see what a schedule change will release, before saving?** Today they
  find out from the emails their clients receive. Inside the horizon this matters;
  outside it there is nothing to show.
- **Can a coach book outside the horizon on a client's behalf?** Assumed yes eventually.
  Not specified.
- **Phase 2, carried forward unanswered:**
  - What happens when a recurring lesson cannot be placed — coach on vacation, or a temp
    moved that weekday's hours? Silent skip, email the client, notify the coach?
    This fires every time a coach takes a week off, so it is not an edge case.
  - Who creates the recurrence: a client checking "repeat weekly" at booking time, or the
    coach designating a standing student? Determines who can end it, and touches ADR-002.
  - Can a client skip a single week without ending the arrangement? Needs a way to cancel
    one materialized booking while keeping the intent, and overlaps Gap 3 (cancellation).

---

## Revisit if

- Coaches ask to publish further ahead — camps, seasons, tryout blocks — which would make
  the horizon a per-coach setting rather than a constant.
- Recurring lessons are picked up, per decision 4.
- A cancellation or no-show policy needs a lead time longer than the horizon itself.
