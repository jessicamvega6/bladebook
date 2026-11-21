# Batch 11: Shared lessons

**Built:** 2026-11-13 · merged by PR #38 · back to the [implementation plan](../implementation-plan.md)

This file is a finished record, kept as it was written at the time. What's still open lives in the root
`README.md` (gaps and shortcuts) and `AI/implementation-plan.md` (what's left to build). A section number such as §4
or §6 below means the plan as it was then: its conflicts (§4) and decisions (§6) are now in `AI/plan-history.md`,
and §7 meant these batch logs.

## The plan, as written before it was built

From the plan's batch table. Struck-out text is what was first planned; the text after it is what changed.

~~Shared lessons: share code (issued by `consumer-family-sync`, G-17), sharing at booking (G-21), invite, accept, leave, and the hourly deadline sweep (`sched-deadline-sweep`). Also B4 from Batch 9 (a shared series offers only *Cancel all future lessons*), and S11's deleted invitation becomes reachable (coded in Batch 5)~~ **Done** (2026-11-13; §7). Its emails are SC-18 (Batch 13)

**Held back by:** — (B2, B3, B4, B7, B8, B10 and B11 ruled). The gate-test rows are a listed shortcut until they pass on real AWS, as in Batch 4 (owner, 2026-11-12)

## Log

The full list, with what closes each one, is in the root `README.md`.

- **Rulings applied:** B2 (answer by whichever comes first, the start of the notice period or 7 days after the leave); B3
  (one card per series, *Keep all remaining dates*, *Cancel all remaining dates* with its confirmation, and a choice per
  date); B4 (while any lesson still to come is shared, joined or invited, the change page offers only *Cancel all future
  lessons*, and the server refuses the other two); B7 (the invitation page lists every clash); B8 (*expired* and
  *Cancelled, no answer* come from the clock, before the sweep runs); B10 (a share is the price divided by the skaters,
  odd cents to the earliest; no page says "half"); B11 (*Go ahead* / *Decline*); S11 (the coach's cancel deletes an
  unanswered invited seat with no record, and a later answer gets "no longer available").
- **Closed:** G-17 (share codes, issued by `consumer-family-sync` and shown on Profile with *Copy*); G-21 (sharing at
  booking: the share box, the share-check, invitations and siblings).
- **Shortcuts:** SC-16 `consumer-invite`'s copies written in-process; SC-17 the hourly sweep on a local timer, with a
  local-only button; SC-18 no shared-lesson emails (Batch 13); SC-19 the share-check's access-log line goes to the
  application log. SC-8 widened (share codes); G-26 widened (the shared-lesson attributes and writes).
- **Settled while building (owner may override):**
  - **A name with fewer than 3 letters A–Z** gets its share code's prefix padded with `X` (`JOX-…`).
  - **The invited seat isn't part of the inviting family's series** (no `recurrenceId`), nor is a sibling's: the invited
    family cancels its dates one by one, and only the booking family can change or stop the series. Stopping a shared
    series cancels each date by the shared rules, so the other family is asked about each.
  - **The inviting family's seat records `invitedStudentId`**, so its cancel can end an unanswered invitation without
    reading the other family's seat; the invited seat records `invitedByName`, the inviting family's name for the invitation
    page. Neither is in ADR-MASTER §7's list.
  - **A kept lesson is marked `freedPlace`** on the staying family's seat, which is how My bookings knows to offer *Invite
    a skater* (the family can't read the lesson time's history). A freed place takes another family's skater or a sibling.
  - **`seatsTaken` counts every place held, an invitation included; `shareCount` counts only skaters splitting the
    price.** The family's lesson-time read now names `maxSkaters` (only to say *shareable*) and `seatsTaken` (G-26).
  - **The coach's lines and Payments use the lesson time's `shareCount` and `joinOrder`**, as the family's pages do, so a
    late leaver's partner is still charged their share on both sides. Lesson times from before Batch 11 fall back to the
    booked seats.
  - **The coach's calendar names only skaters who have joined**: an invitation still unanswered isn't shown, as the design
    draws it. Every booked skater is named, *"Ava P. & Mia C."*.
  - **An invitation's ID is derived from the booking request's key**, so a retry makes the same invitation; a freed place's
    invitation gets a new one.
  - **The share-check answers `{ displayName, onCoachRoster }` only**; the page knows its own skaters' codes, so adding a
    sibling makes no call. A sibling not yet accepted, the skater's own code, and a code of the wrong shape are refused on
    the page and again by the server.
  - **Declining and answering need the skater still `ACTIVE` with the coach** (`requireActive`, ADR-MASTER §8); otherwise
    the page says *"This lesson is no longer available."*
  - **The invitation page lives at `#/invite/<inviteId>`**, the link the invitation email will carry (Batch 13). Home lists
    open invitations with *See the invitation*. After the sweep ends one, the link says it's no longer available.
  - **The staying family's "Cancel, no charge"** is one change batch for all the dates answered, each date its own
    transaction, re-checked first; dates that had gone are reported.
  - **A leave's line records the leaver's share of the price**; the missed-lesson fee is still Phase 2.
- **Found while building:** the shared `Dialog` moved focus back to its first control whenever its parent re-rendered with a
  new close handler, so typing in a field inside a pop-up (the share box) jumped away. It now focuses once, when it opens.
- **Checked in the running app (APIs on :8094 and :8095; table `bladebook-b11check`):** a coach saves a week that takes 2
  skaters → two families sign up and are approved → each skater has a share code → the share-check answers *"Mia C."*, on
  the roster, with no ID; an unknown code is a 404 → the booking page marks the time shareable → booking Ava with Mia's
  code sends the invitation; Ava's lesson is $50 and *waiting for their family*; the coach's calendar names Ava only →
  the Chens see the invitation, $25 of $50, from Sarah Park for Ava P. → *Go ahead*: both pay $25 and the calendar names
  both → Mia's family cancels in time: the Parks are asked, answer by the start of the notice period, still $25 → *Keep*:
  $50 and a freed place; a lesson tomorrow cancelled the same way is a late leave and the Parks keep $25 unasked → the
  local sweep runs. The flows the clock decides (expiry, no answer) are in `ShareServiceTest`. **Not checked in a browser**;
  the pages are covered by their tests.
