# Spec: Rink selection in the schedule builder (Phase 2)

**Status:** Draft — 2026-11-16
**Sources:** ADR-MASTER §6 ("Shape") and §24; ADR-031 decision 1 (`iceType` on the lesson time);
ADR-030 (decision 6, Revisit if); `FeatureDecriptions/Schedule Creater.md` ("(R) Rink", "(IT) Ice
Type", "Checks before review"); `FeatureDecriptions/Bookings:` ("More than one coach");
`docs/Open-Pending.md` §4; `docs/Q_Rink-Fees.md` (question 20); `docs/architecture.md` §10
**Depends on:** Minimum Viable Product (MVP) schedule editor with the per-block ice type
**Out of scope:** rink fees and their calculation (Phase 2, undecided: `docs/Q_Rink-Fees.md`, ADR-030
decision 8); travel time between rinks in the clash check (Phase 3); scheduling in more than one time
zone (Phase 2, ADR-MASTER §24)

## Summary

In Phase 1 every block in the schedule builder is at Pelham Civic Center (PCC), and the rink can't be
changed. In Phase 2 the coach picks each block's rink from a dropdown of the rinks BladeBook has ice
types for, so a coach who teaches at more than one rink can schedule all of them. The rink decides
which ice types the block offers.

## Assumed in every example

- BladeBook has ice-type lists for two rinks: PCC (Birmingham Figure Skating Club (BFSC) freestyle ice,
  Stick and Puck (S&P) ice, public ice) and a second rink, called "Second Rink" here, with its own list.
  The real second rink is not named in the sources.
- Coach Dana is editing her weekly schedule.

## 1. Phase 1, for reference

**1.1 The rink is fixed to PCC**
- **Given** Phase 1 is running
- **When** Coach Dana adds a block
- **Then** the block's rink shows PCC and can't be changed
- **And** the ice-type dropdown lists PCC's ice types
*(source: `Schedule Creater.md`, "(R) Rink": "Phase 1: fixed to Pelham Civic Center (PCC) and not
selectable"; ADR-MASTER §6, "Shape")*

## 2. Choosing a rink

**2.1 The rink dropdown lists the rinks BladeBook has ice types for**
- **Given** Phase 2 is running
- **When** Coach Dana opens a block's rink dropdown
- **Then** it lists PCC and Second Rink, and no other rink
*(source: `Schedule Creater.md`, "(R) Rink": "Phase 2: a dropdown of the rinks BladeBook has ice types
for"; `docs/architecture.md` §10)*

**2.2 The rink decides which ice types are listed**
- **Given** a block's rink is Second Rink
- **When** Coach Dana opens that block's ice-type dropdown
- **Then** it lists Second Rink's ice types only, not PCC's
*(source: `Schedule Creater.md`, "(R) Rink": "Decides which ice types are listed"; "(IT) Ice Type": "A
dropdown of the ice types for the tab's rink")*

**2.3 Each block has its own rink**
- **Given** Coach Dana's Monday has a block 06:00–09:00 at PCC
- **When** she adds a Monday block 15:00–18:00 at Second Rink
- **Then** Monday has two blocks, one at each rink
*(source: `Schedule Creater.md`, "(R) Rink": "Per tab, because a coach can work at more than one rink";
"Tab" means a block)*

**2.4 Blocks at different rinks still can't overlap**
- **Given** Coach Dana's Monday has a block 06:00–09:00 at PCC
- **When** she adds a Monday block 08:00–10:00 at Second Rink
- **Then** the editor shows the overlap, naming both blocks, the day and their hours, and Review
  changes stays disabled until it's fixed
*(source: ADR-MASTER §6, "Validation: blocks in one day don't overlap"; `Schedule Creater.md`, "Checks
before review" and "Design: overlapping blocks are caught in the editor")*

**2.5 Blocks at different rinks may touch**
- **Given** Coach Dana's Monday has a block 06:00–09:00 at PCC
- **When** she adds a Monday block 09:00–11:00 at Second Rink
- **Then** the editor accepts both blocks
*(source: ADR-MASTER §6, "touching is fine"; `Schedule Creater.md`, "Blocks that only touch are fine")*

## 3. Ice type

**3.1 A block can't be saved without an ice type**
- **Given** a block at Second Rink has no ice type picked
- **When** Coach Dana tries to review her changes
- **Then** the schedule can't be saved until she picks one of Second Rink's ice types
*(source: `Schedule Creater.md`, "(IT) Ice Type": "Required"; ADR-MASTER §6, "`iceType` is required per
block"; `docs/Open-Pending.md` §4)*

**3.2 Coaches can't add their own ice types**
- **Given** Coach Dana wants an ice type Second Rink's list doesn't have
- **When** she opens the ice-type dropdown
- **Then** she can only pick from the list; there is no way to type a new one
*(source: `Schedule Creater.md`, "(IT) Ice Type": "Each rink's list is maintained by the BladeBook owner
and added to as BladeBook reaches new rinks; coaches don't create their own")*

**3.3 The ice type is stamped on each lesson time**
- **Given** Coach Dana saves a Monday 15:00–18:00 block at Second Rink with one of its ice types
- **When** lesson times are made from it
- **Then** each `LESSON#` item carries that `iceType`
*(source: ADR-031 decision 1; ADR-MASTER §7, "Lesson times")*

## 4. What families see

**4.1 Families never see the ice type**
- **Given** a Monday 15:00 lesson time at Second Rink is `OPEN`
- **When** a family views Monday on the booking page
- **Then** the time shows its start and end, length and price, and no ice type
*(source: ADR-MASTER §6, "`iceType` ... never shown to families"; `Schedule Creater.md`, "(IT) Ice
Type": "Not shown to families")*

**4.2 Back-to-back lessons at different rinks don't clash**
- **Given** Mia has a lesson with Coach Sam at PCC on Monday 23 November 2026, 14:00–15:00
- **When** her family picks Coach Dana's 15:00 lesson at Second Rink that day
- **Then** no clash warning is shown, because lessons that only touch don't clash
*(source: `FeatureDecriptions/Bookings:`, "More than one coach": "Only overlapping times clash; lessons
that only touch don't. Travel time between rinks is Phase 3")*

## 5. Rules that must always hold

- Every block has a rink and an ice type from that rink's list. *(`Schedule Creater.md`, "(R) Rink",
  "(IT) Ice Type")*
- Rink ice-type lists are maintained by BladeBook, never by coaches. *(`Schedule Creater.md`)*
- Rink terms (for the Phase 2 rink fees) are developer-maintained configuration and not
  coach-editable. *(ADR-030 decision 6)*
- `iceType` is stamped on the lesson time, so a later schedule change doesn't alter past lessons'
  ice type. *(ADR-031 decision 1; `docs/Open-Pending.md` §4)*

## Open questions

1. **What does a coach at a rink with no ice-type list do?** Ice type is required, so such a coach
   can't save a schedule. Is there a fallback (a generic list), or does the owner add the rink before
   the coach can start? (`docs/Open-Pending.md` §4)
2. **Is the rink stamped on each lesson time** (as `iceType` is)? The rink-fee calculation needs the
   rink, the ice type, the sport and the length; the block shape has `iceType` but no rink field.
   (`docs/Q_Rink-Fees.md` question 20; ADR-030 "Revisit if")
3. **Do families see which rink a lesson is at** on the booking pages, My bookings and emails? Not
   stated; only the ice type and block name are ruled family-hidden.
4. **What happens to a block whose rink is removed from BladeBook's list**, or whose ice type is
   removed from a rink's list? Not stated.
5. **Is the sport (figure skating or hockey) set on the coach or on each block?** (`docs/Q_Rink-Fees.md`
   question 20)
6. **A rink in another time zone.** Lesson times are always in the coach's time zone; multi-timezone
   scheduling is a separate Phase 2 item. Whether rink selection is limited to rinks in the coach's
   time zone is not stated.
7. **What is the default rink on a new block** once there is more than one? Not stated.
