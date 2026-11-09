Lesson Pricing
(Written 2026-11-08 from the product rules in ADR-003. How prices are stored is in ADR-003 and ADR-031.)

BladeBook never moves money. It tells a family what they owe and lets the coach record that it arrived
(see Coach Payment Section on Dashboard.md).

Price is per lesson:
  One booking, one price. Two lessons cost twice as much whether they are back-to-back or morning and
  afternoon.
  Duration does not multiply the price. A coach sets a lesson length and a lesson price as two independent
  settings; a 30-minute lesson and a 300-minute lesson both cost whatever that coach's price is. If a coach
  wants a longer lesson to cost more, they change both settings together.
  *(from ADR-003 §3, moved 2026-11-08)*
  *Note: since ADR-008 (2026-08-23), length and price are both set per block on the schedule form, so a
  coach can offer 30-minute and 60-minute lessons at different prices without changing a setting. See
  Schedule Creater.md.*

Personal prices (Phase 2):
  *Decided by the owner, 2026-10-13.* Personal prices move to Phase 2. In MVP every skater pays the
  schedule's price; a personal price isn't set or shown, and the coach's Students list has no price column.
  The shape of a personal price or discount (Kim's list §5) is decided with Phase 2.
  *(from ADR-003 Status, amended 2026-10-13, moved 2026-11-08)*

Currency:
  *Settled 2026-08-30.* Two values, US dollars (USD) and Canadian dollars (CAD), defaulting to USD.
  The coach picks at sign-up. Changing it later is Phase 2.
  *(from ADR-003 Open, moved 2026-11-08)*

What is owed (for reference; the rules live in their own ADRs and feature files):
  A cancelled lesson is never billed (ADR-009, 2026-08-23).
  A no-show is owed, charged under the same rule as a late cancellation (ADR-015, settled 2026-08-30).
  A shared lesson's one price is split evenly among its booked skaters, with odd cents going one each to
  the earliest-joined skaters (ADR-031 decision 7, 2026-10-13).
  A one-off price change for one lesson isn't offered; the coach marks the lesson waived instead (owner,
  2026-10-13, ADR-031).
