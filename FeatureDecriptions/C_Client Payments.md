Client Payments (Phase 2)
(Written 2026-10-12 from the Harbor design: design/harbor/client/static/payments.html)

Phase 2. Not in the first release. Home links to it with a "Phase 2" tag.

BladeBook doesn't take payments. The family pays the coach directly and the coach marks the lesson paid
(see Coach Payment Section on Dashboard.md). This page only shows what the coach hasn't marked paid yet.

*To-do (owner, 2026-10-13; ADR-025 m): group everything on this page by coach.* A family with several coaches
pays each one directly, possibly in different currencies, so each coach gets their own section (not marked paid,
how to pay, notice period) and there is no total across coaches. The current design still adds them together.
Coaches may use different currencies (USD and CAD).
*(from ADR-025, amendment 2026-10-13, item m, and decision 7, moved 2026-11-08)*

Banner at the top: "Coming in Phase 2", and that payment goes straight to the coach.

Figures across the top:
  Not marked paid: the total, and how many lessons.
  Skaters: how many approved skaters the family has, by first name.
  Notice period: the coach's notice period in hours, with "Late cancels may be charged".

Not marked paid table:
  Every past lesson the coach hasn't marked paid: skater, day and time, attendance, amount.
  When there are none: "All paid. Nothing is waiting to be marked paid."

Unpaid history:
  *Decided by the owner, 2026-10-12.* Unpaid history is coach-only in MVP; showing it to the family is Phase 2.
  If families should see their own arrears, that is a client-app view (this page) plus a decision about whether
  the payment reminder email mentions earlier unpaid lessons.
  *(from ADR-003 Status and Open, moved 2026-11-08)*

How to pay the coach:
  The coach's payment instructions from their profile.
  The payment types the coach has switched on: Cash, and their Cash App, Venmo and PayPal handles
  (one switch per type, ADR-016 d7, 2026-10-12).
