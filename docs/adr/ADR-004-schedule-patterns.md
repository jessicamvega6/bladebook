# ADR-004: Schedule Patterns, Computed Availability, and Pattern-Bound Pricing

## Status

**Accepted** — 2026-07-29.

Supersedes:
- `architecture.md` §4/§5's `AVAILABILITY_SLOT` entity and §6.1's slot-claim
  transaction.
- ADR-003 decisions **1** (price on the coach), **3a** (duration on the coach) and
  **3b** (duration changes apply to slots created after the change).

ADR-003 decisions **2** (price stamped at booking creation) and **4–7** (payment
tracking) are unaffected and are load-bearing here.

Amended by ADR-005, which adds a 7-day booking horizon, states when a temporary
schedule takes effect (decision 3), and bounds decision 6's blast radius.

**Partially superseded by [ADR-006](ADR-006-open-booking-recurring-lessons-and-cancellation.md)**
— 2026-08-15. Decision **3a** (single-day blackout as a one-day temporary schedule) and
decision **6** (schedule changes trigger rebooking) are replaced: temporary schedules
become per-date override items, so blackouts need no special case, and conflicting
bookings are cancelled with a durable notified record rather than restatused to
`NEEDS_REBOOKING`. Decision **3** is amended — the default schedule keeps its
per-weekday block map, temporary schedules do not. Decisions **1**, **2**, **4** and
**5** stand unchanged and are load-bearing in ADR-006.

**Further amended by [ADR-008](ADR-008-schedule-editor.md)** — 2026-08-23. Decision
**4**'s retention of `defaultLessonMinutes` and `defaultPriceMinor` on the coach profile
"only to prefill the schedule editor" is withdrawn — both fields are removed, because
price and lesson length are now captured on the schedule form itself. The rest of decision
4 (price and length belong to the block) is unchanged and is what ADR-008 implements.

This ADR's open question *"can a coach edit or cancel a single lesson without touching the
pattern?"* is answered by [ADR-009](ADR-009-cancellation.md): yes, and cancelling never
changes the schedule.

**Superseded in part — 2026-10-13.** *Decided by the owner.*
[ADR-031](ADR-031-lessons-and-seats.md) replaces decisions **1** and **2**. Open times are now
**stored** as lesson-time records (`LESSON#<date>#<startTime>`) made from the schedule, and a
booking is one transaction per date on that lesson time plus a seat for each skater. Decisions
**3**, **4** and **5** still describe the schedule and how it expands into lesson times. Every
behaviour rule still holds unless ADR-031 says otherwise.

---

## Context

Earlier ADRs treated lesson length and price as coach-level settings, and
`architecture.md` treated availability as a set of individually published slot
records. Both were wrong about how a coach actually works.

A coach defines a **recurring weekly pattern** — days, a start and end time for the
day, a lesson length, a price — and occasionally replaces it for a bounded period.
Slots are a consequence of that pattern, not the thing the coach manages.

Worked example from the owner:

- **Default:** Mon/Wed/Fri, 30-minute lessons, 06:00–20:00.
- **Temporary:** Mon–Sat, 60-minute lessons, 12:00–17:00, for a stated number of
  days or weeks, after which the default resumes.

Under the old model, activating that temporary pattern means deleting ~84 open slot
records and writing ~36 new ones, then reversing it two weeks later — while never
touching a booked slot. Nothing about that regeneration is safe or necessary.

---

## Decision

### 1. Availability is computed, not stored

~~There are no `AVAILABILITY_SLOT` items. Open availability for a date range is
derived at read time:~~ *Replaced by ADR-031 decision 1 (2026-10-13): open times are stored as
`LESSON#` lesson-time items, and availability is one range query on them.*

```
candidate slots  =  pattern in effect on each date, expanded into start times
open slots       =  candidate slots  −  bookings that already exist in that range
```

~~One in-memory expansion plus one `Query` for the coach's bookings over the range
(`PK = COACH#<coachId>`, `SK between BOOKING#<from> and BOOKING#<to>`).~~ *Replaced by ADR-031
decision 1 (2026-10-13): one `Query` on `SK between LESSON#<from> and LESSON#<to>`.*

**Consequences that fall out for free:**

- ~~A schedule change writes **one item**. There is nothing to regenerate, no stale
  open slots, and no possibility of deleting a booked one by accident.~~ *Replaced by ADR-031
  decision 11 (2026-10-13): a schedule save also rewrites the stored lesson times in the
  background; a booked one is cancelled only through the preview.*
- "A change only affects lessons that are not already booked" is true by
  construction. Bookings are independent records that carry their own time,
  duration and price; nothing recomputes them.
- ~~Switching to a temporary pattern and back is two writes, not ~240.~~ *Replaced by ADR-031
  decision 11 (2026-10-13): it is two schedule writes plus the lesson-time rewrites they cause.*

### 2. A booking is claimed by a conditional write on the booking itself

`PK = COACH#<coachId>`, `SK = BOOKING#<date>#<startTime>`, written with
`attribute_not_exists(SK)`.

~~The booking item **is** the lock. Two clients racing for the same start time both
attempt the same key; one succeeds, the other gets a condition failure and is shown
refreshed availability. This replaces §6.1's `TransactWriteItems` — which existed
only to flip a slot record to `BOOKED` — with a single conditional `PutItem`. It is
simpler, cheaper, and equally concurrency-safe.~~ *Replaced by ADR-031 decision 4 (2026-10-13):
the lesson time is the lock. One transaction per date updates it from `OPEN` to `BOOKED` and
puts the skater's `SEAT#` item; of two racing families, one succeeds.*

`slotId` is removed from the model. A slot's identity is `(date, startTime)`, which
is exactly what the sort key encodes. *Still true under ADR-031 (2026-10-13): the key is now
`LESSON#<date>#<startTime>`.*

### 3. A schedule is a per-weekday list of blocks

A day is **not** one window. Each weekday holds an ordered list of **blocks**, and
each block carries its own start, end, lesson length and price:

```jsonc
// PK = COACH#<coachId>   SK = SCHEDULE#DEFAULT
{
  "days": {
    "MON": [
      { "startTime": "06:00", "endTime": "11:30", "lessonMinutes": 30, "priceMinor": 5000 },
      { "startTime": "13:30", "endTime": "15:00", "lessonMinutes": 30, "priceMinor": 5000 },
      { "startTime": "15:00", "endTime": "17:00", "lessonMinutes": 60, "priceMinor": 8000 }
    ],
    "TUE": [ /* ... */ ],
    "SUN": []          // no blocks = no lessons that day
  }
}
```

**Breaks are not modelled — they are the gaps between blocks.** The lunch hour in
the example above exists because nothing is scheduled from 11:30 to 13:30. The coach
does not declare a break; they decline to declare a block. This removes the need for
any break, gap or exclusion concept in the model.

**`daysOfWeek` is gone too.** A day with an empty block list has no availability,
which expresses "no lessons on Sunday" without a second mechanism.

| Item | PK | SK | Attributes |
|---|---|---|---|
| Default schedule | `COACH#<coachId>` | `SCHEDULE#DEFAULT` | `days` (weekday → blocks) |
| Temporary schedule | `COACH#<coachId>` | `SCHEDULE#TEMP#<startDate>` | `endDate`, `days` |

Block times are local wall-clock in the coach's IANA timezone (ADR-001 decision 4).

A whole schedule is **one item**, not one per weekday. Seven days of a handful of
blocks each is a few kilobytes — far inside DynamoDB's 400 KB item limit — so a
schedule is read in a single `GetItem` and updated atomically.

**Validation at write time:** blocks within a day must not overlap; abutting is
allowed (15:00 ending as 15:00 begins); `endTime` must be after `startTime`.

**Resolution for a date `D`:** if a temporary schedule covers `D`, it wins;
otherwise the default applies. **Overlapping temporary schedules are rejected at
write time** — with two overlapping overrides there is no non-arbitrary winner, and
a coach who wants a different pattern should replace the existing override rather
than layer one on top.

The default is stored as a single current item, not a version history. Bookings
carry their own time, duration and price, so no historical pattern is needed to
interpret them correctly.

### 3a. A single-day blackout is a one-day temporary schedule

A coach who is ill on one Wednesday writes a temporary schedule with
`startDate = endDate = that date` and an empty `days` map. No separate blackout
concept is required. (Limitation: this collides with the overlap rule if another
temporary schedule already covers that date — see Open.)

### 4. Price and lesson length belong to the block

`lessonMinutes` and `priceMinor` sit on each **block**, not on the coach and not on
the schedule as a whole. This supersedes ADR-003 decision 1.

That is what makes the owner's requirements expressible: a temporary pattern with
60-minute lessons carries its own price, *and* a single day can mix a 30-minute
morning at one price with a 60-minute afternoon at another. Length and price are
always set together, because they are fields of the same block.

`COACH#<coachId>/PROFILE` retains `defaultLessonMinutes` and `defaultPriceMinor` from
signup, used **only to prefill the schedule editor**. Booking logic never reads them;
the block is authoritative.

Resolution when a booking is created:

```
booking.priceMinor  ←  student.priceMinorOverride            (if set)
                    ←  priceMinor of the block that generated the slot
```

**ADR-003 decision 2 (stamping) becomes essential rather than merely prudent.**
With price living on a pattern that varies by date, resolving price lazily at email
time would quote whichever pattern happened to be active *when the reminder sent*,
not when the lesson was booked. Stamping at creation is what makes the amount
stable.

`STUDENT.priceMinorOverride` survives from ADR-003 and still wins over the pattern. *Phase 2 since
2026-10-13 (ADR-003): MVP sets no override.*

### 5. Slot generation, per block

`lessonMinutes` is any positive integer. Within a block, slots are generated
back-to-back from `startTime`:

```
slots = floor((end − start) / lessonMinutes)
```

Any remainder is discarded — a lesson must fit entirely inside its block. A
06:00–11:30 block at 30 minutes yields exactly 11 lessons; the same block at
90 minutes yields 3 and drops the trailing 30 minutes.

Because length is per block, a coach can offer different lesson lengths on the same
day simply by declaring two blocks. There is no restriction to one length per day or
per pattern.

### 6. Schedule changes trigger rebooking, not cancellation

When a schedule is created or changed, any existing booking that the new pattern
cannot produce is **in conflict**. A booking conflicts unless the pattern in effect
on its date generates a slot with exactly its start time and duration.

Examples: a Tuesday booking when the new pattern has no Tuesday; an 06:15 booking
when the new pattern starts at 12:00; a 30-minute booking under a 60-minute pattern.

Flow:

1. The schedule write emits **`ScheduleChanged`** onto the EventBridge bus, carrying
   the coach and the affected date range.
2. A new consumer Lambda queries that coach's bookings in the range, re-evaluates
   each against the new pattern, and sets conflicting bookings to
   `bookingStatus = NEEDS_REBOOKING`.
3. That releases the time — the conditional-write lock in decision 2 is keyed on
   the booking's existence, so a released booking must be **deleted or re-keyed**,
   not merely restatused, for the time to become bookable again. The consumer
   deletes the booking and writes a `REBOOK#<date>#<startTime>` record under the
   client so the client app can show "this lesson needs rebooking."
4. The consumer emails each affected client: the lesson that was lost, and a link to
   book a new one.

This is deliberately **not** an automatic move. The system does not guess which of
the new slots a family can make.

*Ordering note:* the email fires after the new schedule is committed, per the
owner's requirement — which the event-driven design gives for free, since
`ScheduleChanged` is derived from the committed write (§6, change-data-capture).

---

## Model changes to `architecture.md`

**Removed:** `AVAILABILITY_SLOT` entity; `slotId` everywhere; `Coach.slotDurationOptions`.

**Added:** `SCHEDULE#DEFAULT` and `SCHEDULE#TEMP#<startDate>` items;
`ScheduleChanged` event and its consumer; `NEEDS_REBOOKING` handling.

**Changed:** ~~access pattern 4 ("list a coach's availability for a date range") is no
longer a table query — it is a bookings query plus pattern expansion. Booking sort
key becomes `BOOKING#<date>#<startTime>`.~~ *Replaced by ADR-031 decisions 1 and 2 (2026-10-13):
access pattern 4 is a range query on stored `LESSON#` items; each skater's place is a
`SEAT#<date>#<startTime>#<studentId>` item.*

---

## Consequences

**Easier.** Schedule changes are one write. Temporary patterns cost nothing to apply
or expire — an override simply stops matching dates once past its `endDate`, with no
cleanup job. ~~Booking gets simpler than the original design (conditional put versus
transaction). No slot table to keep consistent with anything.~~ *Replaced by ADR-031 decision 1
(2026-10-13): lesson times are stored again and kept about 15 months ahead by the nightly
`sched-lesson-roller` job; booking is a transaction on the lesson time.*

**Harder.** ~~Availability becomes application logic rather than a stored fact, so~~
*ADR-031 (2026-10-13): availability is a stored fact again, but* block expansion needs real unit tests: DST boundaries, a block that does not divide
evenly by `lessonMinutes`, abutting blocks, an override starting mid-week. There is
now a seventh Lambda (the `ScheduleChanged` consumer) and a booking status that only
it produces.

**The schedule editor is the largest piece of MVP UI.** A per-weekday, multi-block
editor with per-block length and price is substantially more work than "pick your
hours," and it is the surface a coach judges the product by. Feature #2 in §10 should
be re-estimated accordingly.

---

## Open

- ~~Blackouts during an active temporary schedule.~~ **Settled by the owner, 2026-09-30:**
  neither. An unplanned day off — illness, an emergency — is a **cancellation**, not a
  schedule change: [ADR-009](ADR-009-cancellation.md)'s *cancel this day*, holding the freed
  slots so families cannot rebook them, with the temporary schedule left untouched. A
  **planned** change inside a temporary schedule, such as shortening a camp, is an edit of
  that schedule ([ADR-008](ADR-008-schedule-editor.md) decision 7a). Overlapping temporary
  schedules stay rejected (ADR-008 decision 8).
- ~~Does a rebooking email offer specific alternatives, or just a link to~~ **Settled by the owner, 2026-08-15:** the email states the lesson was cancelled and carries a link to availability, not specific alternatives.
- ~~What happens to a `NEEDS_REBOOKING` lesson nobody rebooks? No expiry, no~~ **Moot.** `NEEDS_REBOOKING` no longer exists; ADR-006 replaced it with cancellation records.
- ~~Can a coach edit or cancel a single lesson without touching the pattern? Very~~ **Settled by [ADR-009](ADR-009-cancellation.md) decision 5** — a coach cancels one lesson, one day or one week, each choosing release-or-hold.

---

## Revisit if

- A coach needs recurring exceptions richer than blocks express — "first Monday of
  the month," alternating weeks — which blocks and bounded overrides cannot state.
- ~~Availability computation shows up as a latency or cost problem, which would mean
  materializing a short rolling window of slots as a cache. Unlikely at this scale.~~ *Done
  differently by ADR-031 decision 1 (2026-10-13): lesson times are stored, for locking rather
  than speed.*
- Recurring or package bookings arrive (§10 Phase 2) — a standing weekly booking
  interacts with pattern changes in ways decision 6 does not cover.
