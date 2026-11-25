# Spec: Shared-lesson roster join through the consent link (Phase 2)

**Status:** Draft — 2026-11-16. **Blocked:** review gap G16 must be answered before this is built
(see Open questions 1).
**Sources:** ADR-033 (Status, Context, decisions 1–7, Revisit if); ADR-026 (decision 5 steps 2–5,
"How an `AWAITING_COACH` invitation closes", decision 5a, Tests), kept as the Phase 2 record;
ADR-031 (decisions 2, 5, 6, 7, 10, 12, 14), the parts marked "Phase 2 since ADR-033"; ADR-002 and
ADR-025 (amendments of 2026-10-07); ADR-016 (decisions 7a and 8); ADR-MASTER §8, §13 and §24;
`FeatureDecriptions/Schedule lesson split` ("Invitation", "Phase 2: an invitation waiting on the
coach"); `FeatureDecriptions/Email templates Needed:` ("Phase 2 — the consent-link roster join");
`docs/Open-Pending.md` §2a
**Depends on:** Minimum Viable Product (MVP) shared lessons (share codes, invited seats, the invited family's signed-in confirm
page, `consumer-invite`, `sched-deadline-sweep` and GSI4 (global secondary index 4, deadlines)); MVP
coach approval of `PENDING` skaters; for the text versions only, Phase 2 text messages (SMS, Short Message Service) to families
**Out of scope:** recording and telling the invited family when the coach cancels a lesson with an
unanswered invitation (a separate Phase 2 item, ADR-MASTER §24); the parts of the 2026-10-07 to
2026-10-13 design that were struck and replaced (`pendingJoins`, `invitedStudentId`, `INVITE#` copies,
the nightly sweep, `inviteStatus`, re-stamping shares, the "room" check), which are not part of this
feature

## Summary

In MVP a family can share a lesson only with a skater the coach has already accepted; a skater new to
the coach must sign up with the coach's code first. This feature brings back the designed route that
lets the booking family invite a skater who isn't the coach's student yet: the invited family's email
doubles as a consent link, confirming it puts the skater on the coach's list as `PENDING` with their
place held (`AWAITING_COACH`), and the coach's Accept joins them to the lesson. A warning, banners and
an hourly-swept set of deadlines make sure nothing waits forever. It was designed, then moved to Phase
2 by ADR-033 (2026-10-20), to return if signing up with the coach code first proves a burden.

## Assumed in every example

- Now is Monday 16 November 2026, 10:00, in the coach's time zone.
- Coach Dana (she/her) has a notice period (`requiredNoticeHours`) of 24 hours. Her Tuesday 16:00
  block allows 2 skaters (`maxSkaters = 2`) and costs $50.
- Family A, the Lee family, has Ava L., `ACTIVE` with Coach Dana.
- Family B, the Ruiz family, has a BladeBook account and a skater Mia R., share code `MIA-4K7QX`. Mia
  has no `STUDENT#` record with Coach Dana.
- The lesson is Tuesday 24 November 2026 at 16:00 (`LESSON#2026-11-24#16:00`).
- G16 has been answered (Open questions 1); nothing below depends on how.

## 1. Inviting a skater new to the coach

**1.1 The booking goes ahead with Mia's place held**
- **Given** Family A is booking Tuesday 24 November at 16:00 for Ava
- **And** they enter the share code `MIA-4K7QX`, which belongs to Mia, who isn't Coach Dana's student
- **When** Family A books
- **Then** the lesson time becomes `BOOKED` with `seatsTaken = 2` and `shareCount = 1`
- **And** Ava's seat is `BOOKED`
- **And** an invited seat for Mia is stored, `seatStatus = INVITED`, with Mia's display name,
  `inviteId` and `invitedByClientId` = Family A, and no `clientId`
- **And** Family A pays the full $50 until Mia joins
*(source: ADR-026 decision 5, "The rule underneath" (Phase 2 record); ADR-031 decisions 5 and 7;
`Schedule lesson split`, "Price")*

**1.2 Family B is emailed the consent-link invitation**
- **Given** Family A's booking in 1.1 has put Mia's invited seat
- **When** `consumer-invite` sends the invitation
- **Then** Family B receives the consent-link version, which says in substance: "Coach Dana needs to
  accept you first. By following the link below you agree to be added to Coach Dana's roster of
  students, and Mia will join the lesson on Tue 24 Nov at 4:00 once Coach Dana accepts."
- **And** the link only opens a page that needs Family B to sign in; opening it does nothing on its own
*(source: ADR-026 decision 5 steps 2–3; `Schedule lesson split`, "Invitation", Phase 2 record;
`Email templates Needed:`, "Invitation to share a lesson, consent-link version")*

**1.3 The confirm page shows Mia's clashes**
- **Given** Mia has a lesson with Coach Sam on Tuesday 24 November 2026 at 16:00
- **When** Family B signs in and opens the invitation's confirm page
- **Then** the page shows that clash before they choose
- **And** the buttons are "Go ahead" and "Decline"
*(source: ADR-026 decision 5 step 3; ADR-025 amendment 2026-10-07; `Schedule lesson split`,
"Invitation")*

## 2. Family B goes ahead

**2.1 Going ahead puts Mia on the coach's list and her seat waits for the coach**
- **Given** Family B is on the confirm page for Tuesday 24 November
- **When** Family B taps "Go ahead"
- **Then** Mia becomes `PENDING` with Coach Dana, with Family B's contact details, exactly as if Family B
  had entered Coach Dana's code at sign-up
- **And** Mia's seat goes `INVITED → AWAITING_COACH` with `clientId` = Family B
- **And** the seat carries a `WARN` deadline (`dueKind = WARN`) in GSI4
- **And** `shareCount` stays 1, so Family A still pays $50
*(source: ADR-026 decision 5 step 5; ADR-031 decisions 5, 6, 7 and 12; ADR-002 and ADR-025 amendments
of 2026-10-07)*

**2.2 The accept is checked against Family B's own family, not the coach's list**
- **Given** Mia isn't `ACTIVE` with Coach Dana, so the ordinary link check can't issue a linked skater
- **When** Family B goes ahead
- **Then** the write is allowed only if Mia is in Family B's own family, the seat has no `clientId`, is
  `INVITED`, and names Mia
*(source: ADR-031 decision 5, "for a skater new to the coach, the check that the skater is in their own
family" (Phase 2 record); ADR-033 decision 3 removed this alternative for MVP)*

**2.3 Family A can no longer withdraw**
- **Given** Mia's seat is `AWAITING_COACH`
- **When** Family A tries to withdraw the invitation
- **Then** the withdrawal is refused: withdrawing is allowed only while the seat is `INVITED`
*(source: ADR-031 decision 5, "Withdrawing is allowed only while the seat is `INVITED`")*

## 3. The coach's answer

**3.1 The coach's Accept joins Mia to the lesson**
- **Given** Mia is `PENDING` with Coach Dana and her seat for Tuesday 24 November is `AWAITING_COACH`
- **When** Coach Dana accepts Mia on Friday 20 November at 12:00
- **Then** in the same request Mia becomes `ACTIVE` and her seat goes `AWAITING_COACH → BOOKED`
- **And** the lesson time's `shareCount` becomes 2 and `joinOrder` lists Ava then Mia, so each family's
  share is $25
- **And** Family B gets the booking confirmation for the seat, and both families get the "joined" email
*(source: ADR-031 decisions 6, 7 and 14; ADR-026 decision 5 step 5; ADR-MASTER §8, "Who sends what";
§13)*

**3.2 A series joins lesson by lesson**
- **Given** Family A booked Tuesdays at 16:00 from 24 November to 15 December 2026 and invited Mia to all
  four dates
- **And** Family B went ahead, so all four seats were `AWAITING_COACH`
- **And** the 24 November lesson started before Coach Dana acted, so that seat has ended `EXPIRED` (4.1)
- **When** Coach Dana accepts Mia on Wednesday 25 November at 09:00
- **Then** Mia's seats for 1, 8 and 15 December become `BOOKED`
- **And** nothing is written for 24 November
*(source: ADR-031 decision 6, "A series joins lesson by lesson"; ADR-026 decision 5, "A recurring
booking shares every lesson in the series")*

**3.3 An Accept after the lesson has started writes nothing for it**
- **Given** Mia's seat for Tuesday 24 November is still `AWAITING_COACH` at 16:20, before the hourly
  sweep has run
- **When** Coach Dana accepts Mia at 16:20
- **Then** Mia becomes `ACTIVE`, but nothing is written to that lesson
- **And** Family B is told the lesson was no longer available ("Shared lesson no longer available after
  the coach's Accept")
*(source: ADR-026 decision 5 step 5 and Tests, "A coach accepting after the lesson has started writes
nothing, and Family B is told"; `Email templates Needed:`, Phase 2 section)*

**3.4 The coach declines Mia**
- **Given** Mia's seat for Tuesday 24 November is `AWAITING_COACH`
- **When** Coach Dana declines Mia
- **Then** Mia's seat moves to `SEATEND#` as `DECLINED`, `seatsTaken` drops to 1, and the lesson stays
  private at $50 for Family A
- **And** Family A gets "Shared lesson, invited skater not accepted", which says the "no" was the coach's
- **And** Family B gets the ordinary "Pending student declined" email
*(source: ADR-026 decision 5, "How an `AWAITING_COACH` invitation closes"; ADR-031 decision 6;
`Email templates Needed:`, Phase 2 section)*

## 4. When the coach doesn't act

**4.1 The invitation expires when the lesson starts**
- **Given** Mia's seat for Tuesday 24 November is still `AWAITING_COACH` at 16:00
- **When** the hourly sweep runs at 16:00 and finds the `EXPIRE` deadline due
- **Then** the seat moves to `SEATEND#` as `EXPIRED`, `seatsTaken` drops to 1, and the lesson goes
  ahead private at $50
- **And** Family B is emailed at once: "This lesson has expired. Please reach out to Coach Dana to be
  accepted onto her roster for any future shared lessons. Reply to this email to reach Coach Dana."
- **And** that email doesn't print Coach Dana's phone or email, and its `Reply-To` is her
  `businessEmail`
- **And** Family A gets "Shared lesson, invited skater not accepted"
*(source: ADR-026 decision 5a, "It closes invitations whose lesson has started" and "Family B's email
when the lesson expires"; ADR-016 decisions 7a and 8; ADR-031 decision 12; `Schedule lesson split`,
Phase 2 section)*

**4.2 Screens show expired without waiting for the sweep**
- **Given** Mia's seat is still `AWAITING_COACH` at 16:05 because the sweep hasn't run yet
- **When** either family opens My bookings at 16:05
- **Then** the invitation shows as expired
*(source: ADR-031 decision 12, "Screens work out *expired* ... from the time itself"; ADR-026 decision
5a)*

## 5. The warning and the banners

**5.1 The warning goes at the 9pm run before it's due**
- **Given** Mia's seat for Tuesday 24 November 16:00 is `AWAITING_COACH`, so its warning is due no later
  than 24 hours plus the 24-hour notice period before the lesson: Sunday 22 November, 16:00
- **When** the sweep runs at 21:00 on Saturday 21 November
- **Then** the warning is sent: both families are emailed "Coach Dana hasn't accepted Mia for the shared
  lesson on Tue 24 Nov at 4:00. If she doesn't, the lesson goes ahead as a private lesson."
- **And** Coach Dana is emailed that a shared lesson on Tue 24 Nov at 4:00 is waiting for her to accept
  Mia, with a link to her pending list
- **And** the seat's `WARN` deadline is replaced by its `EXPIRE` deadline, so the warning isn't sent
  twice
*(source: ADR-026 decision 5a, "The warning" and "It sends early, never late"; ADR-031 decision 12;
`Schedule lesson split`, "Phase 2: an invitation waiting on the coach")*

**5.2 The warning is never sent at night**
- **Given** the same warning as 5.1
- **When** the sweep runs at 02:00 on Sunday 22 November
- **Then** no warning is sent; it waits for the 9pm run before it's due
*(source: ADR-031 decision 12, "The warning waits for a friendly hour"; ADR-026 decision 5a)*

**5.3 A late confirmation sends the warning at once**
- **Given** Family B goes ahead at 11:00 on Sunday 22 November, so the warning (due 16:00 that day) falls
  due before the next 9pm run
- **When** Mia's seat becomes `AWAITING_COACH`
- **Then** the warning is sent at once, not at 21:00
*(source: ADR-026 decision 5a, "Late confirmations"; ADR-031 decision 12, "A late confirmation")*

**5.4 The banners show from the warning time**
- **Given** the warning time for Tuesday 24 November has passed and Coach Dana hasn't accepted or
  declined Mia
- **When** each family opens their Home page
- **Then** Family A sees a red banner: "Coach Dana hasn't confirmed Mia for your shared lesson on Tue 24
  Nov at 4:00. Unless she does, it will go ahead as a private lesson, charged at the booking's own
  price."
- **And** Family B sees a red banner: "Coach Dana hasn't accepted Mia yet. If she doesn't before the
  lesson, Mia won't join the Tue 24 Nov 4:00 lesson."
*(source: ADR-026 decision 5a, "The banner"; `Schedule lesson split`, "Phase 2: an invitation waiting on
the coach")*

**5.5 The banners go once the coach answers**
- **Given** the banners in 5.4 are showing
- **When** Coach Dana accepts Mia
- **Then** neither family's Home page shows the banner the next time it loads; nothing was stored for it
*(source: ADR-026 decision 5a, "The banner": worked out on page load from `seatStatus` (or
`partnerStatus`) and the lesson time)*

## 6. Family A cancels first

**6.1 Family A's cancel leaves Mia's seat alone and records `INVITER_LEFT`**
- **Given** Mia's seat for Tuesday 24 November is `AWAITING_COACH`
- **When** Family A cancels Ava's lesson on Friday 20 November at 12:00
- **Then** Ava's seat moves to a `CANCELLED#` line and `seatsTaken` drops to 1
- **And** Mia's seat isn't touched
- **And** the lesson time records an `INVITER_LEFT` deadline, due at once, naming Mia's seat
*(source: ADR-031 decisions 5 and 12, option B, revised 2026-10-13: the deadline sits on the lesson
time; ADR-026 decision 5, revised 2026-10-13)*

**6.2 The sweep ends the invitation and tells Family B**
- **Given** the lesson time carries the `INVITER_LEFT` deadline from 6.1
- **When** the hourly sweep runs at 13:00
- **Then** Mia's seat moves to `SEATEND#` as `WITHDRAWN` and the lesson time goes back to `OPEN`
- **And** `consumer-invite` emails Family B that the lesson was cancelled
*(source: ADR-031 decisions 5, 6 and 12; ADR-026 decision 5, revised 2026-10-13)*

**6.3 After Mia has joined, Family A's cancel is an ordinary leave**
- **Given** Coach Dana accepted Mia and her seat is `BOOKED` (3.1)
- **When** Family A cancels Ava's lesson on Friday 20 November at 12:00, outside the notice period
- **Then** it is an ordinary in-time leave of a shared lesson: Ava's seat moves to a `CANCELLED#` line
  and the lesson time records a pending leave for Family B to answer
*(source: ADR-033 decision 4; ADR-031 decision 8)*

## 7. Siblings and freed places

**7.1 A sibling the coach hasn't accepted waits for the coach**
- **Given** Family A's second skater, Leo L., is `PENDING` with Coach Dana
- **When** Family A books Tuesday 24 November at 16:00 for Ava and adds Leo as a sibling
- **Then** Leo's seat is created `AWAITING_COACH`, with no invitation and no confirmation
- **And** Coach Dana's Accept of Leo turns it into `BOOKED`, as in 3.1
*(source: ADR-031 decision 5, "Siblings" (Phase 2 record); ADR-026 decision 5, "A sibling is added
directly")*

**7.2 A freed place can be offered to a skater new to the coach**
- **Given** Family A kept Tuesday 24 November at the full price after another skater left, so it is a
  freed place
- **When** Family A uses "Invite a skater" with `MIA-4K7QX`
- **Then** Mia's invited seat holds the place for that one lesson only, and Mia goes through the same
  steps: Family B goes ahead, Coach Dana approves Mia, Mia joins
*(source: ADR-031 decision 10, "is approved by the coach if new" (Phase 2 record); `Schedule lesson
split`, "A freed place")*

## 8. Rules that must always hold

- **The coach accepts a skater before any lesson is booked for them.** An `AWAITING_COACH` seat holds
  the place but isn't paying: it isn't counted in `shareCount` and has no GSI2 keys, so it gets no
  day-of reminder. *(ADR-026 decision 5; ADR-031 decisions 7 and 14)*
- **`seatStatus` is `INVITED | AWAITING_COACH | BOOKED | CHECKED_IN | NO_SHOW`; `dueKind` is `WARN |
  EXPIRE | ANSWER | INVITER_LEFT`.** `WARN` and `EXPIRE` sit on the invited seat; `ANSWER` and
  `INVITER_LEFT` on the lesson time. *(ADR-031 decisions 2 and 12, Phase 2 record)*
- **No family writes another family's records**, except answering an invitation addressed to their own
  skater. An `AWAITING_COACH` seat is the invited family's; only they, the coach or the sweep can end it.
  *(ADR-031 Status, revised 2026-10-13; decision 5)*
- **The coach's Accept and decline are the coach's own writes**, in `api-coach` under the coach's own
  partition; no function gains a database permission. *(ADR-026 Consequences; ADR-031 decision 5)*
- **Clashes are shown on the confirm page and never re-checked at join time.** *(ADR-026 decision 5)*
- **The invited place can't be lost to "full"**: it is held from booking. *(ADR-031 decision 6)*
- **Opening an emailed link does nothing on its own**; every answer needs the family signed in.
  *(ADR-026 decision 5 step 3)*
- **Families who have opted in to texts** also get a text pointing to the invitation and the warning
  emails, once family SMS exists (Phase 2). *(ADR-026 decision 5 step 2; `Schedule lesson split`, "The
  warning")*
- **The sweep re-checks every record before acting** and is safe to run twice. *(ADR-031 decision 12)*

## Open questions

1. **Blocker — review gap G16.** With a free coach account, a free family account and a child's share
   code (which never changes and is passed between families by design), a stranger could send a family a
   BladeBook-branded "join Coach X's roster" email; if they confirmed, the coach's approval screen would
   show the guardian's name and email and the skater's registration number. It must be answered before
   this returns, for example by letting families rotate share codes and saying plainly in the email that
   this is a coach they don't have yet. Note that share codes were ruled never to change (ADR-026,
   amended 2026-10-13), so rotation would reverse that ruling. (ADR-033 Context and decision 7;
   ADR-MASTER §24; `docs/Open-Pending.md` §2a)
2. **What happens to the share-check and the booking's `ConditionCheckItem`** (ADR-033 decisions 2 and
   2a), which refuse any invitee not `ACTIVE` with the coach. Both were added after this design; how
   they change to let a new skater through is not stated.
3. **Does the link check (ADR-024) get back its "skater in the caller's own family" alternative** for
   this accept? ADR-033 decision 3 removed it for MVP.
4. **One email per invitation, or per lesson?** Since 2026-11-13 (G-38) every shared-lesson email lists
   every date it covers; the Phase 2 warning was designed "for each lesson". Whether the warning, the
   expiry email and the coach's email are grouped is not stated.
5. **Which time zone "9pm" is in** for the warning's run: the coach's, or each recipient's. Not stated.
6. **What the coach's pending list shows** about the shared lesson waiting on her Accept. The design
   page for it was removed on 2026-10-20 (`Schedule lesson split`, "Designs revisited").
7. **The coach cancels a lesson whose invited seat is `AWAITING_COACH`.** MVP deletes an `INVITED` seat
   with no record; the Phase 2 item to record it covers `INVITED` only. Not stated for `AWAITING_COACH`.
8. **What happens to Mia's place on the coach's list** when the invitation expires or is withdrawn:
   does she stay `PENDING` with Coach Dana? Implied by the expiry email but not stated.
