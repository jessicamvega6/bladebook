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

Unaffected and load-bearing: ~~ADR-004 decisions **1** (availability is computed),
**2** (a booking is claimed by a conditional write),~~ *(replaced by ADR-031 decisions 1 and 4,
2026-10-13: lesson times are stored, and a booking is a transaction on the lesson time)*
ADR-004 decisions **3** (the default schedule is a
per-weekday list of blocks) and **5** (slot generation per block); ADR-006 decisions
~~**1** (no booking horizon),~~ *(replaced by ADR-031 decision 3, 2026-10-13: a server-checked
booking window of about 3 months)* **4** (recurring lessons), **5** and **7** (cancellation
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

**Amended — 2026-09-30.** Two open items settled by the owner: how the mode is chosen
(decision 6a) and a time-off option for temporary mode (decision 6b). Both are product rules,
moved to the feature files on 2026-11-08; 6b's storage rule stays here.

**Extended — 2026-10-06** by [ADR-026](ADR-026-shared-lessons-by-invitation.md): each block gains **`maxSkaters`** (*skaters per lesson*),
default 1. The editor allows only 1 until Kim sets the maximum. *Amended 2026-10-07 by ADR-026:
default 1, at most 2, a setting that may be raised.*

**Amended — 2026-10-08.** Kim's answer to `Items to ask Kim About.md` §7 (option **B**) settles **a booking that lands
between the coach's preview and save**: the save goes ahead without asking the coach (product
rule — see `FeatureDecriptions/Schedule Creater.md`, "A family books during the review"). The
preview reads a per-coach booking counter that every booking increments; the save checks it.
If it changed, the plan is recalculated and the save goes ahead; any booking made since the
preview that the change cancels is cancelled like the rest, and the counter chooses a separate
*"just booked"* email. Slot holds during preview (option D) are not built.

**Amended — 2026-10-09.** *Decided by the owner.* The *"just booked"* email is **Phase 2** (product
rule — same feature-file section). **No booking counter is
built in MVP:** it existed only to choose which email to send. When the email returns, the
likely mechanism is for the save to recalculate the plan and compare it with the preview's,
which needs no counter.

**Note — 2026-09-30.** [ADR-020](ADR-020-repricing-booked-lessons.md) extends decision 8: every
upcoming lesson follows a price edit (see the note under decision 8).

**Amended — 2026-10-13.** *Decided by the owner.* [ADR-031](ADR-031-lessons-and-seats.md)
changes what a save does underneath, not what the coach sees:
- **A new warning (ADR-031 decision 13).** An odd-cents split warning in the editor; a warning,
  not a validation failure, so it never blocks the save (product rule and wording — see
  `FeatureDecriptions/Schedule Creater.md`, "Skaters per lesson").
- **A save rewrites stored lesson times (ADR-031 decision 11).** Bookable times are now stored
  `LESSON#` records made from the schedule. The preview compares the lesson times the old and
  new schedules produce, and sorts each into add, remove, cancel or re-price. The batch then
  rewrites them in the background — up to a year of them.
- **Every lesson time records the `scheduleVersion` that made it.** A booking and a save both
  change the same lesson-time record, so a booking can no longer land on a time the save
  removed.


**Amended — 2026-11-08.** *Decided by the owner, settling conflict S5 in the implementation plan
(`design/harbor/coach/schedule.html`).* The block Name field always shows, in a temporary
schedule too (product rule — see `FeatureDecriptions/Schedule Creater.md`, "Block names"). No
model change: temp blocks already carry `blockName`. The name stays optional, HTML-escaped and
capped at 40 characters.

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
2026-08-20), so a coach who later changes currency cannot reinterpret historical amounts.* *Revised
2026-10-13: on the lesson time since ADR-031.*

### 2. The form

*The field table, its controls and the MF field's hint and visibility moved to
`FeatureDecriptions/Schedule Creater.md` (the field list, "MF" and "The form as ADR-008 decision 2
listed it") on 2026-11-08 — product content, not an architecture decision.* What the model
takes from the form:

- **Name** (optional) on the schedule; **SOD/EOD, LL, LC, MF** per block entry, becoming each block's
  `startTime`, `endTime`, `lessonMinutes`, `priceMinor`, `missedLessonFeeMinor`; **Days** for the
  default only; **SD/ED** for a temp only.
- **MF is per block entry, like LC**, so each block carries its own fee beside its own price (ADR-015
  decision 2). The field is hidden in MVP (product rule — see the feature file, "MF"). Every block
  written in MVP stores `missedLessonFeeMinor = 0`, which ADR-015 already defines as "no
  charge", so turning the field on in Phase 2 needs no migration.

**Name is stored, not applied.** It is written onto the schedule object it creates — the
default item, or the temp header from decision 7. Saving a named schedule for *reuse* is
Phase 2; this ADR only stores the label.

### 2a. Blocks carry an optional name

A block becomes `{ seq, blockName?, startTime, endTime, lessonMinutes, priceMinor, missedLessonFeeMinor }` (`missedLessonFeeMinor` added 2026-08-30 by ADR-015 decision 2; `0` means no charge). This is a genuine
model change: ADR-004 decision 3 defined a block as four fields, and decision 2 above placed
the only Name field on the schedule object.

**The reason is validation legibility.** Decision 8's overlap message must name blocks the
coach can recognise, and every block must have a stable label — its name, or else `Block <n>`
(product rule and its reasoning, including the rejected derived descriptor — see
`FeatureDecriptions/Schedule Creater.md`, "Block names"). The model named the thing with one
instance (the schedule) and left the things with many (blocks) unnamed; this fixes that.

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

**Overlap messages append the time range** (wording — see the feature file, "Block names"), so
**no uniqueness rule on `blockName`** is enforced: two blocks with the same name are still told
apart by their hours.

**The name is coach-only and never reaches a client.** The booking page groups slots by the
derived `30 minutes · $50`, never by block name (ADR-006 decision 3). Keeping user-authored
free text off client-facing surfaces keeps the escaping surface small. (The product reason —
the name means nothing to a parent — is in the feature file.)

**Handling follows ADR-003 decision 6's precedent for `paymentInstructions`:** HTML-escape
on render, and cap the length. 40 characters fits "Afternoon power hours" and is short
enough that a pasted paragraph cannot break a block card.

Blocks in temporary schedules carry the field too — a block is a block, so a temp has a name
on its header and one per block. *(When the editor shows the block Name field is a product
rule, amended 2026-11-08 — see the feature file, "Block names".)*

### 3. A block entry is a block template

*Language updated 2026-11-09 to match the Harbor design (owner): the editor has a Blocks list, not tabs, and every time in a block starts switched on.*

The editor lists the coach's block entries (the design's Blocks list). Each entry holds one
(SOD, EOD, LL, LC) set, and each entry produces **one block per day it applies to**:

- **Default mode** — a block on each checked weekday.
- **Temp mode** — a block on every date from SD to ED.

Block entries compose into ADR-004 decision 3's `days` map. Two entries both covering Monday give
Monday two blocks, which is how a coach gets 30-minute mornings at one price and 60-minute
afternoons at another — the case ADR-004 decision 4 exists to serve.

**Adding and deleting block entries.** *Moved to `FeatureDecriptions/Schedule Creater.md` (the
blocks section) on 2026-11-08 — product content, not an architecture decision.* A save always
carries at least one block entry.

### 4. Switching a time off splits a block

*Language updated 2026-11-09 to match the Harbor design (owner): the editor has a Blocks list, not tabs, and every time in a block starts switched on.*

How a new block is filled in and how a tap switches a time on or off are UI behaviour (*moved to
`FeatureDecriptions/Schedule Creater.md`, the calendar and slot-click sections, on 2026-11-08 —
product content, not an architecture decision*). What matters to the model is what a set of
times left on becomes.

**Every contiguous run of times left on becomes one block.** Every time in a block starts on.
Switching 7:00 off in a 6:00–8:00 half-hour run yields two blocks — 6:00–7:00 and 7:30–8:00. This needs no new
model concept, because ADR-004 decision 3 already said breaks are the gaps between blocks:
*"the coach does not declare a break; they decline to declare a block."*

Each block always divides evenly by its own LL, since it is a run of equal-length slots.
Switching alternate times off simply produces more blocks, which costs nothing at a few kilobytes
per schedule.

**Switching every time off produces zero blocks**, which is how the form expresses "no
lessons." See Open — this works but is not obvious. *Superseded as the way to take time off
by decision 6b (2026-09-30); switching times off still works for trimming a day.*

### 5. Lesson length is a fixed menu

30, 45, 60, 90, 120 (product rule and its reasoning — see `FeatureDecriptions/Schedule
Creater.md`, "LL"). This **supersedes ADR-003 decision 3a**, which specified any positive
integer and explicitly rejected a preset list.

The reversal is deliberate, and it removes a validation surface and makes slot rendering
predictable. `lessonMinutes` remains an integer in the stored model, so the constraint is
entirely in the UI and relaxing it later costs nothing but a control change.

### 6. Default and temp are distinct modes, chosen before entry

They take different inputs (default: Days, no dates; temp: SD/ED, no Days), so the coach
chooses the mode before entry (product rule — see `FeatureDecriptions/Schedule Creater.md`, the
section on reaching the editors). The save request therefore names its mode **explicitly**
rather than having it inferred at save time from which fields happen to be populated.

### 6a. Two dashboard buttons choose the mode

*Moved to `FeatureDecriptions/Schedule Creater.md` (the section on reaching the editors) on
2026-11-08 — product content, not an architecture decision.* (Decided by the owner,
2026-09-30.)

### 6b. Time off is one choice, not a form to empty

*Decided by the owner, 2026-09-30.* Time off is a choice of its own in the temporary mode,
with only a name and dates (product rule, the overlap and preview behaviour, and planned
versus unplanned absence — see `FeatureDecriptions/C_Coach Time Off.md`).

**Time off is stored exactly as the form would have stored it**: a temp header, plus one
date item per day with an empty `blocks` list — ADR-006's "no lessons that day". It needs no
new model concept. Everything downstream is unchanged: overlap with an existing temp is
rejected by decision 8's check, and the preview and cancellation run the ordinary
schedule-change path. An unplanned absence is a cancellation (ADR-009), not a schedule write.

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
| **Date items** | ~~Availability, booking, conflict detection~~ *Making lesson times and the schedule-change diff (ADR-031 decisions 1 and 11, 2026-10-13)* | **Correctness** — one key, one lookup, no arbitration |
| **Header** | Schedule list, naming, "runs 7 days", delete-as-a-unit, overlap validation | **Management** |

Nothing on the booking path reads the header. That is what makes the duplication
tolerable: a stale or missing header can misname or mis-range a listing, but it can never
let a client book something they should not, because ~~availability resolves from date items
alone.~~ *availability reads only the stored lesson times, which are made from date items and
the default alone (ADR-031 decision 1, 2026-10-13).* ADR-006 decision 2's single-lookup rule survives intact.

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

**Validation** — if any check fails, nothing is written (what the coach is told, and the
settled 2026-09-30 rule that an overlap is rejected, never warned-and-allowed — see
`FeatureDecriptions/Schedule Creater.md`, "Checks before review"):

- No two block entries may produce overlapping blocks on the same day. Abutting is fine — 15:00
  ending as 15:00 begins (ADR-004 decision 3).
- A new temp's date range is checked against existing temp headers for date and time
  overlap (access pattern 18).
- *Added 2026-10-13 by [ADR-031](ADR-031-lessons-and-seats.md) decision 13:* the odd-cents
  split is a **warning, not a failure**; it never blocks the write.

**Preview** — with validation clean, the coach is shown a preview before anything is written
(its contents, including ADR-020's re-pricing lines and large-change warning — see
`FeatureDecriptions/Schedule Creater.md`, "What the review page shows" and "Big price change
warning"). **The preview covers default changes as well as temporary ones.** This is the
correction that matters most: a default-pattern change is the *more* dangerous of the two,
because the default governs every date without an override, and with ~~no booking horizon
and~~ 12-month recurrences behind it (ADR-006 decisions 1 and 4) a single save can reach a year
out. *ADR-031 decision 3 (2026-10-13): single picks are now held to a 3-month window, but a
series can still run 12 months.* A temp change is bounded by its own range.

**Nothing is cancelled until the coach accepts.** The preview and the consumer that
performs the cancellation must share one conflict implementation in `core/` — ADR-001's
framework-free core exists so a rule like this has exactly one definition, and two copies
would drift into a preview that under-reports. *ADR-031 decision 11 (2026-10-13): that one
implementation now diffs the lesson times the old and new schedules produce.*

The preview remains advisory: a client can book between preview and save, so the
authoritative record of what was destroyed is always the batch written by the consumer
(ADR-006 decision 5), never the number the coach was shown. *Amended 2026-10-08: the save now
checks a per-coach booking counter (see Status).* *Amended 2026-10-09: no counter in MVP; the save
simply goes ahead (see Status).* *Amended 2026-10-13 by ADR-031 decision 11: a booking made
after the preview on a time the save removes becomes a cancel line in the same batch, with the
ordinary email. Because both write the same lesson-time record, a booking can no longer land
on a time after the save has removed it.*

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
days fall out of block entries with no extra concept. Breaks, blackouts and irregular days are all
the same mechanism — times switched off — rather than three features. Temps are nameable,
listable and deletable as units again.

**Harder.** Two items now describe one temporary schedule and must be written together and
kept consistent; the failure is cosmetic rather than dangerous, but it is real. The editor
is a genuinely large piece of UI: a multi-block form, a live-populating calendar, per-time
on/off switching, two modes with different fields, a validation pass, and a preview-and-accept
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
- ~~A coach with no schedule at all.~~ **Settled by the owner, 2026-08-30.** *Moved to
  `FeatureDecriptions/Bookings:` (the family's empty calendar) and
  `FeatureDecriptions/C_Coach Schedule Hub.md` ("No schedule yet") on 2026-11-08 — product
  content, not an architecture decision.* No new component or item is needed: an empty
  schedule renders as the ordinary calendar with no lesson times.

---

## Revisit if

- A coach needs a lesson length outside the menu. The stored model already permits it.
- Coaches ask for named reusable templates in earnest — that is the Phase-2 half of the
  Name field, and it is the point at which a saved-but-not-applied schedule needs its own
  item type.
- The editor's block-entry model proves too coarse for a coach whose week genuinely differs day
  to day, since an entry applies one time range across every day it covers.
- Temps routinely run long enough to exceed the 100-item transaction limit, which would
  make chunked writes and their partial-failure behaviour a first-class concern rather than
  an edge case.
