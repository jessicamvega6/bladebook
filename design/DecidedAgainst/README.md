# Decided against

Work that was explored and rejected. Kept because the reasoning is often worth
re-reading, and because a rejected option is cheap to revive and expensive to
rebuild from nothing.

Live and still-undecided work lives one level up in `design/`.

---

## Schedule creator — the five that lost to Habit

Six builds of the coach's schedule creator were made from one brief, each rendering
the same state: Tab 1 as Mon/Wed/Fri mornings at 30 min/$50, Tab 2 as Monday
afternoons at 60 min/$80. **Habit won** and is the basis of
`design/schedule-creator-poc.html`.

| File | Direction | Why it lost |
|---|---|---|
| `SchedTimeline.dc.html` | **Timeline — split read/edit.** Composite week grid as read-only verification, with a separate interactive canvas below it for the active tab alone. | The only build that dissolved the composite-vs-active tension rather than accepting it. Lost on ergonomics: you cannot fix what you see where you see it — spotting an unwanted 8:00am in the grid means switching tabs first. |
| `SchedWeek.dc.html` | **Ice Ledger — the week is the output.** Every tab rendered as one repeating week, active tab lit, others solid-but-cooler. | Dropped its own width-encodes-duration idea to get 44px targets, so the grid no longer mapped to a real clock. Third design to abandon proportional time. |
| `SchedGuided.dc.html` | **Interview — staged 1-2-3.** Days → hours → length/price, with the optional name collapsed behind a dashed row. | Progressive disclosure earned its keep here far better than it did on the client screen. Lost on the composite preview weakening the active-block signal, which it named itself. |
| `SchedRink.dc.html` | **Rink Dawn — gold is the active tab.** Composite preview with an explicit All/This toggle, week strip in micro-bars. | To get 44px hit targets it showed one day deeply and the rest of the week as summary bars — a real loss of overview on a screen whose whole output is a week. |
| `SchedSpec.dc.html` | **Spec — literal control build.** Built strictly from `Schedule Creater.md`, plainest option wherever the spec was silent. | Never a candidate. It was the control, and it did its job: see below. |

### What this exercise produced, which outlived all five

- **All five independently chose a composite preview** over active-tab-only, and four
  added an explicit "All blocks / This block only" toggle without being asked.
- **The control build showed why it matters.** Read literally, each tab owns its own
  calendar — so while Tab 2 is active the coach cannot see Tab 1's Monday mornings at
  all, yet validation exists precisely because tabs can collide on a day. Active-only
  makes a Monday overlap invisible until Next rejects it.
- **Three independently reported the same cost:** showing every block makes the block
  you are *editing* a minority of the pixels, weakest on exactly the busy patterns
  where it matters most.
- The control also caught an unwritten gap: the time dropdowns span 12:00am–11:45pm,
  but nothing says what window the *calendar* shows. It chose 6am–8pm, which silently
  cuts off a coach with a 5am ice slot.

---

## Booking flow, step 2 — the six that lost to Timeline

**Step 2 of the client booking flow** — pick a day, *pick your times*, confirm, done.
Six treatments of that one screen were built across two rounds, all rendering the same
Monday: 30-minute lessons at $50, a two-hour midday gap, 60-minute at $80 from 3pm.
**Timeline — the measured strip** won.

| File | Direction | Why it lost |
|---|---|---|
| `Habit.dc.html` | **Your usual first.** Opens with "your usual Monday 9:30 is held" — designed for the returning family, since most bookings are repetition rather than exploration. | Strongest idea of the four. Lost on its own named risk: pre-selecting makes a decision on the client's behalf, so a family who came specifically to *change* their Monday must notice and undo something first. |
| `WeekAtOnce.dc.html` | **Ice Ledger — the whole week.** Time runs left-to-right on one shared clock, days stacked as lanes, block width encoding lesson length. | Hit the same wall as the winner from a different angle — width-encodes-duration forced 44px blocks carrying only a start time, with price and length exiled to a caption bar. Desktop-native shape that does not survive a phone. |
| `Guided.dc.html` | **Interview, not inventory.** A three-step wizard: how long → roughly when → which exact times. | Progressive disclosure earns its keep when options overwhelm or the user is undecided. Here most people know their time and are re-booking, so it taxes the common case to help the rare one. |
| `Day.dc.html` | **Grouped by lesson type.** Slots rendered from the expanded availability list with a header only where duration or price changes, so the midday gap needed no handling — there was simply nothing to draw. | The safest of the six and correct on every rule. Lost to Timeline on ambition: it states the shape of the day in words and headers where the measured strip states it in space. |
| `DayGrid.dc.html` | **Uniform time grid** — the literal reading of the written spec: one interval from the coach's first lesson to their last, every row a time range. | Right for an ordinary single-length day, which is most days. Fails the mixed day: it draws rows through the midday gap, splits a 60-minute afternoon into 30-minute rows that do not exist, and shows the wrong price on the ones that do. |
| `RinkSide.dc.html` | **Rink Dawn.** Pre-dawn ice palette where the only warm colour in the interface is reserved for *your* selected times. | The best single idea in the set — selection unmissable without a badge or border. Lost on contrast: the dark palette pushed "Taken" and the unbookable gaps to the floor of comfortable legibility, with no light mode for a bright rink lobby. |

**The finding that outlived them:** Timeline and Ice Ledger independently discovered that
making duration spatially literal squeezes the 30-minute slots too narrow to label.
Timeline rotates its text 90°; Ice Ledger moved price and length off the blocks entirely.
That problem is inherited by the chosen design and is still open.

---

## Forest — the first shipped theme, replaced by Harbor

Moved here 2026-10-01, when the owner chose **Harbor** (`design/harbor/`) as the BladeBook
theme. Everything in `forest-theme/` was drawn in Forest.

| File | What it was |
|---|---|
| `theme-forest.md` | The Forest spec: one green family split by lightness, a 34-token contract, every pair measured. |
| `canvas.json` + the 40 `*.dc.html` screens | The whole design set as it stood on 2026-09-30: client booking and sign-up, coach sign-up, schedule creator, dashboard and time off, week view, payments, lessons, profile, and the rinkside app. `canvas.json` opens them as a canvas; its paths are relative, so it still works from this folder. |
| `schedule-creator-poc.html` | The interactive schedule-creator proof of concept (the Habit direction), with the live theme switcher. |
| `bladebook-booking-page.html` | The early client booking page. |

**Why it lost:** five whole-product directions were built from one shared component set
(`design/redesign/`), and Harbor was chosen. It is the friendliest of the five for families,
with teal and coral on sand and pill controls, while staying restrained: one primary, one accent.

**What carried over:** every screen's content and flow. The redesign rebuilt all 41 screens
rather than inventing new ones, and its notes record each improvement (for example the
vertical booking timeline, larger rinkside targets, and review screens that lead with the impact).

**Where the Harbor versions are:** coach website pages in `design/harbor/coach/`, as static
pages and a clickable demo. Client and rinkside screens in `design/redesign/option-5-harbor.html`.

---

## Themes

| File | What it was | Why it is here |
|---|---|---|
| `theme-highcontrast.md` | **Rink Light** — built for worst-case legibility: spruce green for the block being edited, cobalt for commit, and a hard luminance ladder (0.10 / 0.43 / 0.71 / 0.92) across the four slot states so the week grid survived glare and greyscale. Eleven of twelve text pairs cleared AAA; lowest measured anywhere 5.91:1. | Dropped by the owner, 2026-08-25. Known weakness: `--action` and `--edit` sat only 1.30:1 apart in luminance, because both had to be dark enough to carry white text at AAA. |
| `contrast-check-highcontrast.py` | Its measurement script — a dependency-free oklch → sRGB → WCAG contrast tool. | Moved with its theme. Still runs, and is reusable if a future palette needs measuring. |

---

## Not here, and deliberately so

Two decisions are **still open**, so their alternatives stay in `design/`:

- **Lesson selection** — five directions (Timeline, Habit, Ice Ledger, Interview, Rink
  Dawn). Never chosen; the screen still has to be designed.
- **Day view** — `Day.dc.html` (grouped by lesson type) versus `DayGrid.dc.html` (the
  literal uniform time grid). Never chosen.

Unresolved is not the same as rejected. Neither belongs in this folder yet.
