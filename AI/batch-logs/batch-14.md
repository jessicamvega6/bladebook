# Batch 14: Business-email confirmation

**Built:** 2026-11-16 · merged by PR #50 · back to the [implementation plan](../implementation-plan.md)

This file is a finished record, kept as it was written at the time. What's still open lives in the root
`README.md` (gaps and shortcuts) and `AI/implementation-plan.md` (what's left to build). A section number such as §4
or §6 below means the plan as it was then: its conflicts (§4) and decisions (§6) are now in `AI/plan-history.md`,
and §7 meant these batch logs.

## The plan, as written before it was built

From the plan's batch table. Struck-out text is what was first planned; the text after it is what changed.

**Done** (branch `feature/batch-14-business-email`, 2026-11-16; §7). Business-email confirmation: BladeBook's own email with a link to a page where the coach, signed in, clicks Confirm; Resend gives a new link; the `CODE#` item is written on confirmation (ADR-016, A2; `architecture.md` §6.13). Also Profile → Business email, the address list, *Resend link* and *Change address* (G-1, G-2). Replaces Batch 1's local stand-in (SC-2). Opened G-40 (the confirm page isn't drawn) and G-41 (when a confirmed address takes over), both ruled by the owner 2026-11-16 and closed

**Held back by:** — (owner, 2026-11-12: a random token that works once and lasts 3 days, kept as a hash on the coach profile; the coach signs in to confirm; ADR-016 amended)

## Log

The full list, with what closes each one, is in the root `README.md`.

- **Rulings applied:** the owner's 2026-11-12 rulings on ADR-016: a random token that works **once** and lasts **3 days**;
  *Resend* issues a new one and the old one stops working; each waiting address is kept on the coach's own profile
  (`pendingBusinessEmails`: address → `tokenHash`, `expiresAt`); only the token's Secure Hash Algorithm (SHA-256) hash is
  stored; **the coach signs in to confirm**, through `api-coach` like every coach route. A2 (families can't reach a new
  coach, and the code doesn't work, until a different address is confirmed; `CODE#` is written on confirmation).
- **Built:** `core`: `BusinessEmails` (the list: login email, other confirmed addresses, waiting addresses with their
  links; add, resend, remove, choose, find, confirm) and `LinkToken` (32 random bytes, base64url; SHA-256 hash; constant-time
  compare). `CoachProfileService` adds, resends, removes, chooses, checks and confirms, and sends the
  `business-email-confirmation` email through the Batch 13 `Mailer` (the SES template's name plus its data: `coachFirst`,
  `newEmail`, `confirmUrl`, `expiresAt` in the coach's zone). `CoachRepository.saveBusinessEmails` writes the list under a
  version, and writes `CODE#` in the same transaction when a new coach's first address is confirmed. `api-coach`:
  `POST /api/coach/profile/business-email` (add; `replaces` for sign-up step 4's *Change address*), `PUT` (choose),
  `/resend`, `/remove`, `/check` and `/confirm`; the profile lists the addresses (`emails`). `web`: Profile → Business
  email (design `profile-email`), the confirm page (`#/confirm-email/<token>`), and *Resend link* · *Change address* ·
  *Use my login email instead* on sign-up step 4 and on the *not working yet* banner (Today, Profile → Details).
- **Closed:** G-1, G-2 and SC-2 (the local *I've clicked the link* route and button are gone).
- **Shortcuts:** none new. The email goes to `api-coach`'s outbox (SC-21) until SES (Batch 17).
- **Gaps:** ~~G-40 the confirm page has no Harbor design (built from sign-up step 4's card)~~ *G-40 ruled 2026-11-16 by the owner: the built page is fine as it is, a page of its own under the Profile tab; no design needed*; ~~G-41 the design has a confirmed
  address wait to be chosen and saved, the ADR makes it the business email on confirmation (built as the ADR says; needs
  the owner).~~ *G-41 ruled 2026-11-16 by the owner: keep the ADR's behaviour, as built (a confirmed address takes over
  at once). The Harbor design's choose-and-Save step after confirming is superseded.*
- **Settled while building (owner may override):**
  - **Confirming makes the address the business email at once** (ADR-MASTER §4, `architecture.md` §6.13), on sign-up and
    on the profile; the address it replaces stays on the list as *Confirmed* and can be chosen again with Save (G-41).
  - **The other confirmed addresses are kept** as `confirmedBusinessEmails` on the profile (not in the ADRs; the list is
    product, `FeatureDecriptions/C_Coach Profile.md`). Changes to the list go through `businessEmailsVersion`, a counter the
    save is conditioned on, so a link can't be used twice and two tabs can't both change the list.
  - **The link is `<site>/coach/#/confirm-email/<token>`.** The token is in the address's hash, so it never reaches a
    server log; the page sends it in the request body. Opening the page only asks `/check` which address it's for; nothing
    changes until *Confirm*. A link opened while signed out comes back to its page after sign-in.
  - **One message for every refused link** (used, replaced by Resend, more than 3 days old, removed, or another coach's):
    *"This link doesn't work any more. It may have been used already, replaced by a newer link, or be more than 3 days
    old."*, with *Go to Business email* to send a new one. A 409.
  - **Resend waits a minute** after the last link (*"We sent a link a moment ago…"*), so a double click or a script can't
    flood an inbox; **ten addresses at most** besides the login email.
  - **An email that can't be sent** leaves the address and its link saved and says *"We saved the address but couldn't
    send its email. Try Resend link in a minute."*
  - **Sign-up step 4's *Change address*** (*accepted by the owner, 2026-11-16*) opens a box on the same page; the new address replaces the waiting one (whose link
    stops working). The design sends the coach back to step 3, whose answers are already saved by then. The step also looks
    again when its tab gets focus, so a link confirmed on the phone moves sign-up on to *You're all set*.
  - **The sign-up step bar fits a phone** (*owner, 2026-11-16*): at 760px and under it shows the dots with only the current
    step named (the other names stay for screen readers), and the lines between dots shrink. It used to scroll sideways, with
    the current step cut off at 390px. Changed in the Harbor design (`coach/app.css`, `client/app.css`, rebuilt) and in
    `web/src/coach/coach.css` and `web/src/family/family.css`.
  - **The banner's *Change address*** opens Profile → Business email, as designed. *Use my login email instead* leaves the
    waiting address on the list, still confirmable.
  - **A waiting row shows *Resend link*** where the design has *I've clicked the link* (the demo's stand-in), with when the
    link stops working (*"The link works until Thu, Nov 19 at 2:15 PM."*) or *"The link has expired. Resend it to get a new
    one."*
  - **An address left waiting by Batch 1's stand-in** (`pendingBusinessEmail`) reads as one whose link has expired; Resend
    sends it a real link, and the old attribute is removed on the next save.
  - **The email goes straight from `api-coach`** when the address is added or resent (as `architecture.md` §6.11 draws), not
    through the stream; its sender is *BladeBook* with no Reply-To, to the new address.
- **Checked in the running app (APIs on :8098 and :8099, Vite on :5188; table `bladebook-b14check`):** a coach signs up with
  a different business email → `api-coach`'s outbox has *business-email-confirmation* to that address, from *BladeBook*, no
  Reply-To, link `http://localhost:5188/coach/#/confirm-email/…`, *"Thu, Nov 19 at 11:11 AM"* → opening the link shows
  *Confirm your business email* and changes nothing (code still not working) → *Confirm* → *Business email confirmed*, *"Your
  coach code works now"*, and the `CODE#` item is in the table → the same link again: *This link doesn't work any more* → on
  the profile, a new address; Resend at once refused (409), two minutes on (stored time moved back) a new link, the old one
  refused on check and confirm, the new one accepted → its stored expiry moved past: refused → resent and confirmed: it
  became the business email → Change address back: the login email chosen, then the first address → a second coach opens
  their link signed out, signs in on the stand-in, and lands back on the confirm page; Today shows the banner with *Resend
  link · Change address · Use my login email instead*. Headless Chrome at 1280px and 390px: sign-up step 4, the confirm page
  (asking, confirmed, refused), Profile → Business email, and Today's banner; no sideways scroll on any. **Not checked:** a
  real inbox or SES rendering (SC-21); the 3 days were stood in for by moving the stored expiry.
