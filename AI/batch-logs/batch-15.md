# Batch 15: Family profile: Add a skater and Add a coach

**Built:** 2026-11-12 · merged by PR #30 · back to the [implementation plan](../implementation-plan.md)

This file is a finished record, kept as it was written at the time. What's still open lives in the root
`README.md` (gaps and shortcuts) and `AI/implementation-plan.md` (what's left to build). A section number such as §4
or §6 below means the plan as it was then: its conflicts (§4) and decisions (§6) are now in `AI/plan-history.md`,
and §7 meant these batch logs.

## The plan, as written before it was built

From the plan's batch table. Struck-out text is what was first planned; the text after it is what changed.

~~Family profile: *Add a skater*, with "None of my coaches yet", and *Add a coach* (A9; ADR-025 decision 2 and item k)~~ **Done** (PR #30). G-18 closed 2026-11-13: the design was redrawn to list approved coaches only, as built

## Log

The full list, with what closes each one, is in the root `README.md`.

- **Rulings applied:** A9 option (b): *Add a skater* always asks which coaches and allows *None of my coaches yet*;
  a skater with no coach has only the `SKATER#` item, no link and no `STUDENT#` record, so no coach is asked about
  them; *Add a coach* links each chosen skater, each waiting for that coach alone (ADR-025 d2, item k).
- **Closed:** G-18, narrowed to the one place the website differs from the design (below).
- **Settled while building (owner may override):**
  - **Which coaches? lists approved coaches only.** The family is given a coach's ID only once that coach has approved
    one of its skaters (ADR-MASTER §16), and the server accepts only those IDs, so a made-up or guessed ID is refused.
    A coach still waiting is reached through *None of my coaches yet*, then *Add a coach* with their code; the form
    says so. The design listed every coach; it was redrawn to match on 2026-11-13 (owner).
  - **An added skater is under 18** (the design's hint: an adult signs up for their own account), and someone who
    skates themselves isn't offered *Add a skater*.
  - **A name already on the account is refused** (*"Ava Park is already on your account."*, any capitals), so a
    double tap doesn't make two skaters.
  - **Limits:** 20 skaters on an account, 10 coaches (sign-up's limit).
  - **Add a coach** resolves the code on the server, skips skaters already with that coach (waiting or approved), and
    refuses only when none are left (*"Those skaters are already with Coach Dana."*). The website marks those skaters
    by matching the coach's name, as the code lookup gives no ID.
  - **Wording:** the profile's wrong-code message is the design's *"Check it with the coach who gave it to you"*, not
    sign-up's *"Check it with your coach"*.
- **Checked in the running app (APIs; table `bladebook-b9check`):** Lily added for an approved coach waits for her;
  Max added with no coach has none and no coach sees him; *Add a coach* with Coach Ben's code puts Max on Ben's
  Students page alone, the family isn't marked waiting, and Ben's ID isn't given out.
