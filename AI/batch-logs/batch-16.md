# Batch 16: Coach Profile → Visibility & texts

**Built:** 2026-11-12 · merged by PR #31 · back to the [implementation plan](../implementation-plan.md)

This file is a finished record, kept as it was written at the time. What's still open lives in the root
`README.md` (gaps and shortcuts) and `AI/implementation-plan.md` (what's left to build). A section number such as §4
or §6 below means the plan as it was then: its conflicts (§4) and decisions (§6) are now in `AI/plan-history.md`,
and §7 meant these batch logs.

## The plan, as written before it was built

From the plan's batch table. Struck-out text is what was first planned; the text after it is what changed.

~~Coach Profile → *Visibility & texts*: show my phone to families, show my business email to families (ADR-MASTER §4, "What families see"; A3)~~ **Done** (PR #31)

**Held back by:** The *Text me on late cancellations* switch still waits on ADR-007 d8 (§3)

## Log

The full list, with what closes each one, is in the root `README.md`.

- **Rulings applied:** A3 (ADR-MASTER §4, "What families see"): the phone and the business email are each the coach's
  choice, both off to start, and only families the coach has approved see them (enforced since Batch 3).
- **Closed:** G-3's two contact switches. Left in G-3: the texts switch, which waits on ADR-007 d8.
- **Settled while building (owner may override):**
  - **A switch can't show what isn't there:** *"Add your phone number under Details first."* and *"Your business
    email isn’t confirmed yet. Use the link we emailed you first."*, each by its switch.
  - **The texts card is shown** as the design draws it, with the switch off and disabled and *"Texts aren’t set up
    yet. Until they are, you get the email."* (marked "Not in the design").
  - **Payment types** are listed read-only, with their handles, linking to the Payments tab, as the design does.
- **Checked in the running app (APIs; table `bladebook-b9check`):** an approved family saw no phone or email; the
  coach switched both on; the family then saw both.
