# ADR-008: The Schedule Editor, and What Building It Changed

## Status

**Accepted** — 2026-08-23.

Supersedes:

- **ADR-003 decision 1** — the coach no longer sets a default lesson price at signup.
  Price is a field on the schedule form. `currency` *is* still captured at signup and
  stays on the coach profile.
- **ADR-003 decision 3a** — lesson duration is no longer "any positive value the coach
  chooses." It is a fixed menu: 30, 45, 60, 90, 120 minutes.
- **ADR-004 decision 4's second paragraph** — `defaultLessonMinutes` and
  `defaultPriceMinor` are removed from `COACH#…/PROFILE` entirely, rather than retained
  to prefill the editor.

Amends:

- **ADR-006 decision 2** — temporary schedules are still stored as one item per date, but
  are *entered* as a date range plus a pattern, and now carry a **header item** that gives
  the group identity, a name, and a range.

Unaffected and load-bearing: ADR-004 decisions **1** (availability is computed),
**2** (a booking is claimed by a conditional write), **3** (the default schedule is a
per-weekday list of blocks) and **5** (slot generation per block); ADR-006 decisions
**1** (no booking horizon), **4** (recurring lessons), **5** and **7** (cancellation
records and the mandatory preview).

Cancellation behaviour triggered from this editor is specified in
[ADR-009](ADR-009-cancellation.md).

**Amended — 2026-08-24.** A **block** gains an optional `blockName`, which amends ADR-004
decision 3's four-field block shape and decision 2 below, where the Name field was placed
on the schedule object only. See decision **2a**.

**Amended — 2026-09-29.** The form gains an **MF — missed-lesson fee** field, which
[ADR-015](ADR-015-late-cancellation-and-no-show-charges.md) decision 2 places in the
schedule builder but which decision 2 below never listed. It is shown from Phase 2; until
then every block stores `missedLessonFeeMinor = 0`.

**Amended — 2026-09-30.** Two open items settled by the owner. The mode is chosen from **two
dashboard buttons**, not a radio button on the form (decision 6a), and temporary mode gains a
**"No lessons (time off)"** option (decision 6b).

**Extended — 2026-10-06** by [ADR-026](ADR-026-shared-lessons-by-invitation.md): each block gains **`maxSkaters`** (*skaters per lesson*),
default 1. The editor allows only 1 until Kim sets the maximum. *Amended 2026-10-07 by ADR-026:
default 1, at most 2, a setting that may be raised.*

**Amended — 2026-10-08.** Kim's answer to `Items to ask Kim About.md` §7 (option **B**) settles **a booking that lands
between the coach's preview and save**. The preview reads a per-coach booking counter that
every booking increments; the save checks it. If it changed, the plan is recalculated and the
save **goes ahead without asking the coach**: any booking made since the preview that the change
cancels is cancelled like the rest, and its family gets a separate *"just booked"* email
(*"Coach updated their schedule just as you booked. Here are other open times."*). Slot holds
during preview (option D) are not built.

**Amended — 2026-10-09.** *Decided by the owner.* The *"just booked"* email is **Phase 2**. In MVP
the save still goes ahead without asking the coach (option B), and a booking made since the
preview that the change cancels gets the ordinary cancellation email. **No booking counter is
built in MVP:** it existed only to choose which email to send. When the email returns, the
likely mechanism is for the save to recalculate the plan and compare it with the preview's,
which needs no counter. **To be reconsidered if feedback supports that this is an issue.**

**Note — 2026-09-30.** [ADR-020](ADR-020-repricing-booked-lessons.md) extends decision 8: every
upcoming lesson follows a price edit (see the note under decision 8).

---

## Context

ADR-004 called the schedule editor *"the largest piece of MVP UI"* and ADR-006 roughly
doubled it again by adding a month calendar, a week view, and a preview step. Nothing
specified what any of it looked like.

That mattered more than a missing UI spec usually does, because several model decisions
had been made in the abstract with no interface to test them against — where price lives,
whether lesson duration is free-form, how a coach expresses a two-week camp. Designing the
editor moved three of them.

Two things in particular only became visible once the screen existed:

**The signup defaults were dead weight.** ADR-004 decision 4 kept `defaultLessonMinutes`
and `defaultPriceMinor` on the coach profile "only to prefill the schedule editor," while
insisting booking logic must never read them. That is a non-authoritative shadow copy of
authoritative data, sitting on the profile looking canonical — a trap for whoever writes
pricing code next. Once price and length became fields on the form itself, the defaults
had no job left.

**The temp header could not stay dissolved.** ADR-006 decision 2 deliberately removed the
ranged temp item so that resolution would be a single lookup at a single key. But three
separate things this editor does — naming a schedule, validating a new temp against
existing ones, and telling the coach how long a schedule will run — all need a temp to be
an addressable object with a start and an end. The header comes back, in a form that keeps
what ADR-006 bought.

---

## Decision

### 1. Signup captures currency; the schedule form captures price and length

`COACH#<coachId>/PROFILE` keeps `currency` (**USD** or **CAD** for MVP) and
`paymentInstructions`. `defaultLessonMinutes` and `defaultPriceMinor` are **removed**.

Nothing on the coach record is a lesson-pricing input any more. The block is the only
place a price or a duration lives, which is what ADR-004 decision 4 wanted and what the
retained defaults quietly undermined.

*Currency is stamped onto each booking alongside `priceMinor` (ADR-003, amended
2026-08-20), so a coach who later changes currency cannot reinterpret historical amounts.*

### 2. The form

| Field | Control | Shown for |
|---|---|---|
| **Name** | Free text, optional | Both |
| **SOD** — start of day | Dropdown, 12:00am–11:45pm in 15-minute steps | Both |
| **EOD** — end of day | Dropdown, 12:00am–11:45pm in 15-minute steps | Both |
| **LL** — lesson length | Dropdown: 30, 45, 60, 90, 120 minutes | Both |
| **LC** — lesson cost | Amount, in the coach's signup currency | Both |
| **MF** — missed-lesson fee | Amount, in the coach's signup currency; `0` means no charge. Hint: *"charged for a no-show or a cancellation inside your notice period."* *Added 2026-09-29 as LF — late fee; renamed 2026-09-30; shown from Phase 2* | Both |
| **Days** | Seven checkboxes, Sun–Sat. **Mandatory** | Default only |
| **SD / ED** — start and end date | Date pickers | Temp only |

The meridiem is encoded in the SOD/EOD dropdown entries themselves; there is no separate
am/pm control.

**MF is per tab, like LC**, so each block carries its own fee beside its own price (ADR-015
decision 2). It is hidden in MVP rather than shown and ignored: a fee field that collects
nothing invites a coach to believe it does. Every block written in MVP stores
`missedLessonFeeMinor = 0`, which ADR-015 already defines as "no charge", so turning the field on in
Phase 2 needs no migration.

**Name is stored, not applied.** It is written onto the schedule object it creates — the
default item, or the temp header from decision 7. Saving a named schedule for *reuse* is
Phase 2; this ADR only stores the label.

### 2a. Blocks carry an optional name

A block becomes `{ seq, blockName?, startTime, endTime, lessonMinutes, priceMinor, missedLessonFeeMinor }` (`missedLessonFeeMinor` added 2026-08-30 by ADR-015 decision 2; `0` means no charge). This is a genuine
model change: ADR-004 decision 3 defined a block as four fields, and decision 2 above placed
the only Name field on the schedule object.

**The reason is validation legibility.** Decision 8 rejects a save when two blocks overlap
on the same day, and that message is the coach's only guide to fixing it. *"Monday: Morning
ice and Afternoon power hours overlap"* is actionable; *"Block 1 and Block 2 overlap"* makes
her count tabs to work out what she did. The schedule-level name cannot serve this — a coach
has exactly one default schedule and never chooses between defaults, while she switches
between blocks constantly. The model named the thing with one instance and left the things
with many unnamed.

**The name is optional; a block's label is not.** Every surface that must refer to a block —
validation messages, the tab strip, cancellation records — renders the name when set, and
otherwise falls back to its **position**: `Block 1`, `Block 2`, `Block 3`. So the guarantee
that makes decision 8 usable never depends on the coach having typed anything, and a
one-block schedule needs no naming ceremony at all.

A **derived descriptor** — `6:00–11:30 · 30 min · $50` — was considered for the fallback and
rejected. It is self-describing, but it is *unstable*: it changes as the coach edits the
block, so the thing she is working on renames itself under her while she types, and a
warning she read a moment ago no longer matches what is on screen. A positional label holds
still.

**The number is a stored sequence, not a position.** Each block gains a `seq`, assigned once
when it is created and never changed. Numbers are **not** reused and survivors are **not**
renumbered: delete Block 1 and Block 2 from a schedule of three and what remains is still
`Block 3`; add another and it is `Block 4`. The next number is one above the highest `seq`
in that schedule, and the counter is per schedule — the default and each temp number their
own blocks from 1.

Positional numbering was implemented first and was wrong for the same reason the derived
descriptor was: it is unstable. Deleting Block 1 would renumber Block 3 to Block 2, so an
overlap warning the coach read a moment earlier would now name a different block — the exact
failure this decision exists to prevent. A label that changes when you delete something
*else* is worse than one that changes when you edit the thing itself.

The one edge this leaves: deleting the highest-numbered block and immediately creating
another reuses that number, since the next value is derived from the maximum rather than
from a stored counter. Storing a counter on the schedule item would close it, at the cost of
a field that exists only to name things. Not worth it — the window is a single edit and the
warning re-renders live — but it is a real, if small, gap in "numbers are never reused."

**Overlap messages append the time range**, whether or not a name is set: *"Monday: Morning
ice (6–11:30 AM) and Block 2 (10 AM–5 PM) overlap in time."* An overlap is a complaint about
times, so the times are what locate it — and this removes any need for a uniqueness rule on
names, since two blocks a coach has called "Morning" are still told apart by their hours.

**The name is coach-only and never reaches a client.** The booking page groups slots by the
derived `30 minutes · $50`, never by block name (ADR-006 decision 3). Two reasons: "Morning
ice" is a coach's private label and means nothing to a parent, and keeping user-authored
free text off client-facing surfaces keeps the escaping surface small.

**Handling follows ADR-003 decision 6's precedent for `paymentInstructions`:** HTML-escape
on render, and cap the length. 40 characters fits "Afternoon power hours" and is short
enough that a pasted paragraph cannot break a block card.

Blocks in temporary schedules carry the field too — a block is a block. Note that this puts
two names on a temp: one on the header ("August Camp") and one per block ("Camp ice"). For
the common single-block temp that is redundant, so the editor should not ask for a block
name until a second block exists.

### 3. A tab is a block template

The calendar view carries tabs. Each tab holds one (SOD, EOD, LL, LC) set, and each tab
produces **one block per day it applies to**:

- **Default mode** — a block on each checked weekday.
- **Temp mode** — a block on every date from SD to ED.

Tabs compose into ADR-004 decision 3's `days` map. Two tabs both covering Monday give
Monday two blocks, which is how a coach gets 30-minute mornings at one price and 60-minute
afternoons at another — the case ADR-004 decision 4 exists to serve.

**Tab mechanics.** The view opens with one tab and a `+` button. `+` adds a tab and clears
SOD, EOD, LL and Days for it. Each tab carries an `✕` that deletes it. The sole remaining
tab has no `✕` — it appears once a second tab exists, and disappears again if the count
returns to one. At least one tab must exist for **Next** to enable.

### 4. Deselecting a slot splits a block

Entering SOD and LL populates the calendar with back-to-back slots from SOD, running to
EOD, or to **7:00pm** if EOD is blank. 7pm is a prefill, not a ceiling — the coach extends
past it by setting EOD, or by selecting further slots directly.

Clicking a slot toggles it. If LL is unset when the coach clicks, the slot is 30 minutes
and LL is set to 30.

**Every contiguous run of selected slots becomes one block.** Deselecting 7:00 from a
6:00–8:00 half-hour run yields two blocks — 6:00–7:00 and 7:30–8:00. This needs no new
model concept, because ADR-004 decision 3 already said breaks are the gaps between blocks:
*"the coach does not declare a break; they decline to declare a block."*

Each block always divides evenly by its own LL, since it is a run of equal-length slots.
Alternating selections simply produce more blocks, which costs nothing at a few kilobytes
per schedule.

**Deselecting every slot produces zero blocks**, which is how the form expresses "no
lessons." See Open — this works but is not obvious. *Superseded as the way to take time off
by decision 6b (2026-09-30); deselecting slots still works for trimming a day.*

### 5. Lesson length is a fixed menu

30, 45, 60, 90, 120. This **supersedes ADR-003 decision 3a**, which specified any positive
integer and explicitly rejected a preset list.

The reversal is deliberate. A menu covers essentially every coach, removes a validation
surface, and makes the calendar's slot rendering predictable. The cost is a coach who
wants something outside the list — 20-minute tots' lessons, say — having no path at all.
`lessonMinutes` remains an integer in the stored model, so the constraint is entirely in
the UI and relaxing it later costs nothing but a control change.

### 6. Default and temp are distinct modes, chosen before entry

They no longer take the same inputs: default requires Days and has no dates, temp requires
SD/ED and does not show Days. The coach therefore has to know which one they are creating
before they start filling anything in, so the mode is **selected explicitly** rather than
inferred at save time from which fields happen to be populated.

*Whether that selection is a pair of radio buttons at the top of the form or two separate
entry points is a presentation question — see Open.*

### 6a. Two dashboard buttons choose the mode

*Decided by the owner, 2026-09-30.* The coach website's dashboard offers two separate
entry points instead of a radio button at the top of one form:

- **Edit weekly schedule** — the default. Days are mandatory; there are no dates.
- **Add time off or a special schedule** — a temporary schedule. Start and end dates; no days.

They lead to different forms — different fields, different validation, different preview
wording — so choosing first, from a button that names the job, is clearer than switching a
radio button on a form that then rearranges itself. The coach dashboard notes already list
separate *Create Default Schedule* and *Temporary Schedule* buttons; this names them for what
a coach is trying to do. `FeatureDecriptions/Schedule Creater.md`'s radio button is superseded.

### 6b. Time off is one choice, not a form to empty

*Decided by the owner, 2026-09-30.* Time off — vacation, illness known in advance, a
tournament — is the most common temporary schedule a coach creates, far more common than a
camp. So *Add time off or a special schedule* opens with a choice:

- **No lessons (time off)** — the coach gives a name (optional, e.g. "Vacation"), a start
  date and an end date, and nothing else. The time, lesson-length, cost and fee fields and the
  slot calendar are hidden.
- **Special schedule** — the full tabbed form, as decisions 2–4 describe, for a camp or
  holiday hours.

**Time off is stored exactly as the form would have stored it**: a temp header, plus one
date item per day with an empty `blocks` list — ADR-006's "no lessons that day". It needs no
new model concept. Everything downstream is unchanged:

- **Overlap with an existing temp is rejected**, with decision 8's explanation — time off
  inside a camp is done by editing the camp, or, for a single day, by ADR-009's *cancel this
  day*.
- **The preview lists every booking on those dates**, which will be cancelled, and the
  families emailed. There is no release-or-hold question: the slots no longer exist, so
  nothing can be rebooked into them.

**Planned versus unplanned.** Time off changes the schedule, so the slots disappear from
the booking page. That is right for time off known in advance. For a same-day absence —
illness on the morning, a family emergency — the coach uses ADR-009's *cancel this day* or
*this week* with **hold**, which cancels the lessons without editing the schedule.

### 7. Temporary schedules get a header

```jsonc
// PK = COACH#<coachId>
{ "SK": "SCHEDULE#TEMP#<tempId>",
  "scheduleName": "August Camp",
  "startDate": "2026-08-19",
  "endDate": "2026-08-25" }

{ "SK": "SCHEDULE#DATE#2026-08-19", "tempId": "<tempId>", "blocks": [ /* … */ ] }
// … one per date through 2026-08-25
```

**The split in responsibility is the whole point:**

| | Read by | Concern |
|---|---|---|
| **Date items** | Availability, booking, conflict detection | **Correctness** — one key, one lookup, no arbitration |
| **Header** | Schedule list, naming, "runs 7 days", delete-as-a-unit, overlap validation | **Management** |

Nothing on the booking path reads the header. That is what makes the duplication
tolerable: a stale or missing header can misname or mis-range a listing, but it can never
let a client book something they should not, because availability resolves from date items
alone. ADR-006 decision 2's single-lookup rule survives intact.

**ADR-004's overlap-rejection rule stays dead.** It existed because two ranges covering one
date had no non-arbitrary winner — a correctness problem. Header overlap is only ever a
*validation message* (decision 8), because resolution is still one date, one key.

**Write date items first, header last.** A crash between them leaves date items with no
header: they still resolve correctly, they are merely ungrouped in the UI. Header-first
would leave a header claiming dates that do not exist, which is the lying-metadata case.

`TransactWriteItems` caps at 100 items, so a temp longer than ~99 days cannot be a single
transaction and must be chunked — which is exactly why the ordering above matters.

**Deleting a temp** deletes its header and the date items it names. Deleting a *date item*
restores the default for that date; writing one with empty `blocks` means no lessons. Those
remain different states (ADR-006 decision 2) and the editor must not conflate them.

### 7a. Editing an existing temporary schedule

*Decided by the owner, 2026-08-25.* A coach opens a temp from the schedule list, changes
its dates or its blocks, and saves.

**Save is delete-then-rewrite, scoped by `tempId`:**

```
DELETE every SCHEDULE#DATE# item WHERE tempId = <this temp>
THEN    write one item per date in the new range
THEN    update the header's name / startDate / endDate
```

**This is why the header's `tempId` back-reference earns its place.** Without it there is no
way to ask "which dates belong to this temp," and editing would have to diff two ranges and
hope nothing else had touched those dates in between.

**Shrinking a range needs no special handling.** Aug 19–25 becomes Aug 19–22: the delete
removes all seven date items, the rewrite lays down four, and 23–25 simply never come back.
No orphan-detection pass, no cleanup job. A diff-based save would have needed one and would
have been the place a bug lived.

**The cost is that per-date edits inside the temp are lost on save.** A coach who deselected
a few slots on Aug 21 and then extends the range to Aug 27 loses those deselections, because
Aug 21's item is deleted and rewritten from the form. Diffing would have preserved them, at
the price of a rule that is much harder to state and to verify. Worth revisiting if coaches
report losing per-day work; not worth pre-empting.

**Bookings are handled exactly as any other schedule change** — no special case. The save
emits `ScheduleChanged`, decision 8's preview computes the conflict set before anything is
written, and ADR-009 decision 5's consumer cancels and notifies after the coach accepts. A
temp edit is a schedule save that happens to be scoped to a date range.

### 8. Next runs validation, then an impact preview, then requires acceptance

**Validation** — if any of these fail, the coach is shown a message describing the problem
and nothing is written:

- No two tabs may produce overlapping blocks on the same day. Abutting is fine — 15:00
  ending as 15:00 begins (ADR-004 decision 3).
- A new temp's date range is checked against existing temp headers for date and time
  overlap.

  *Settled 2026-09-30 by the owner:* **an overlap is rejected, never warned-and-allowed, and
  the message says exactly what to do.** It names the existing temp, the dates they share and
  the way out — for example: *"This overlaps **August Camp** (Aug 19–25) on Aug 21–22. Edit
  August Camp to change those days, or choose dates outside it."* Editing a temp is decision
  7a. A one-day absence during a temp — a sick day inside a camp — is not a schedule change
  at all: it is ADR-009's *cancel this day*.

**Preview** — with validation clean, the coach is shown the schedule for confirmation,
plus:

- **Every booking the change will cancel** — for **both** default and temporary schedules.
  This is the correction that matters most: a default-pattern change is the *more*
  dangerous of the two, because the default governs every date without an override, and
  with no booking horizon and 12-month recurrences behind it (ADR-006 decisions 1 and 4) a
  single save can reach a year out. A temp change is bounded by its own range.
- **How long the schedule will run** — for a temp, until its end date; for the default,
  indefinitely.
- **A statement that accepting will send cancellation emails to affected clients.**
- *Added 2026-09-30 by [ADR-020](ADR-020-repricing-booked-lessons.md):* **every upcoming lesson
  the change will re-price**, with the old and new amount; **which lessons an increase will not
  reach** because they fall inside the coach's notice period; and, for a large price change, a
  **warning at the top of the preview** that the coach must tick to acknowledge before Accept
  enables.

**Nothing is cancelled until the coach accepts.** The preview and the consumer that
performs the cancellation must share one conflict implementation in `core/` — ADR-001's
framework-free core exists so a rule like this has exactly one definition, and two copies
would drift into a preview that under-reports.

The preview remains advisory: a client can book between preview and save, so the
authoritative record of what was destroyed is always the batch written by the consumer
(ADR-006 decision 5), never the number the coach was shown. *Amended 2026-10-08: the save now
checks a per-coach booking counter (see Status).* *Amended 2026-10-09: no counter in MVP; the save
simply goes ahead (see Status).*

---

## Model changes to `architecture.md`

**Removed:** `Coach.defaultLessonMinutes`, `Coach.defaultPriceMinor`.

**Added:** `SCHEDULE#TEMP#<tempId>` header items (`scheduleName`, `startDate`, `endDate`);
`tempId` on `SCHEDULE#DATE#` items; a `scheduleName` attribute on `SCHEDULE#DEFAULT`.

**Changed:** `lessonMinutes` is constrained to {30, 45, 60, 90, 120} at the UI layer;
the schedule preview covers default changes as well as temporary ones.

**Access patterns added to §5:**

| # | Query | Served by |
|---|---|---|
| 17 | List a coach's temporary schedules | Main table, `begins_with(SK, "SCHEDULE#TEMP#")` |
| 18 | Find temps overlapping a candidate date range | Pattern 17, filtered on `startDate`/`endDate` |

---

## Consequences

**Easier.** Nothing on the coach profile pretends to be pricing policy any more, so the
"someone reads `defaultPriceMinor` because it is right there" bug cannot happen. Multi-block
days fall out of tabs with no extra concept. Breaks, blackouts and irregular days are all
the same mechanism — deselected slots — rather than three features. Temps are nameable,
listable and deletable as units again.

**Harder.** Two items now describe one temporary schedule and must be written together and
kept consistent; the failure is cosmetic rather than dangerous, but it is real. The editor
is a genuinely large piece of UI: a multi-tab form, a live-populating calendar, per-slot
toggling, two modes with different fields, a validation pass, and a preview-and-accept
step. ADR-004 flagged this as the surface a coach judges the product by, and it has grown
since.

**A fixed lesson-length menu is a product constraint with no technical basis.** It is
recorded here as a deliberate reversal so that reversing it back is a control change, not
an archaeology exercise.

---

## Open

- ~~How the mode is presented.~~ **Settled 2026-09-30: two dashboard buttons** — decision 6a.
- ~~Expressing "no lessons" is possible but obscure.~~ **Settled 2026-09-30: a "No lessons
  (time off)" option** — decision 6b.
- ~~Overlapping temp ranges: reject or warn?~~ **Settled 2026-09-30: reject, with an
  explanation** — see decision 8.
- ~~Editing an existing temp.~~ **Settled 2026-08-25** — see decision 7a. Save is
  delete-then-rewrite scoped by `tempId`, so a shrinking range cleans itself up. Known cost:
  per-date slot deselections inside the temp do not survive a save.
- **Applying a saved schedule** is Phase 2. Whether a saved template is a third item type
  or just a header that is not currently in effect is unresolved, and it determines whether
  "save" and "apply" are one action or two.
- ~~A coach with no schedule at all.~~ **Settled by the owner, 2026-08-30:** the client sees
  the ordinary **monthly calendar with every day in `--stage` `#CCCCCC`**, and clicking
  through to a day gives the ordinary day view with no time blocks to select.
  
  **No empty-state screen is built.** The empty state is the normal rendering repeated — the
  grey already means "no lessons" for a single day, so a coach who has never set up is just
  every day at once. That is the cheapest possible answer and it needs no new component.
  
  **But grey alone is ambiguous, and one line of copy is still required.** `--stage` is
  defined in the Forest theme as *the day is not part of the working week* — a deliberate
  choice by the coach. An all-grey month is therefore pixel-identical to a coach who teaches
  nothing on purpose, and a client who just registered with a coach code will read it as the
  app being broken or the coach being fully booked. The calendar needs a line distinguishing
  *this coach has not posted any times yet* from *this coach does not teach these days*.
  The coach's own view of the same emptiness needs the opposite thing: a prompt to build a
  schedule, since for them it is a task and not a status.

---

## Revisit if

- A coach needs a lesson length outside the menu. The stored model already permits it.
- Coaches ask for named reusable templates in earnest — that is the Phase-2 half of the
  Name field, and it is the point at which a saved-but-not-applied schedule needs its own
  item type.
- The editor's tab model proves too coarse for a coach whose week genuinely differs day to
  day, since a tab applies one time range across every day it covers.
- Temps routinely run long enough to exceed the 100-item transaction limit, which would
  make chunked writes and their partial-failure behaviour a first-class concern rather than
  an edge case.
