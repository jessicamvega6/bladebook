Re-pricing Booked Lessons
(Created 2026-11-08 from the product rules in ADR-020, "Booked Lessons Follow the Coach's Current Price".
 The coach sees these changes on the schedule review page, described in Schedule Creater.md.)

What changes when a coach changes a price:
  *Decided by the owner, 2026-09-30.* When a coach changes the price on a schedule block, every upcoming lesson
  that block makes moves to the new price, following the notice-period rule below. The family is told.
  Past lessons never change. Neither does a lesson already marked paid or waived, even if it's in the future: its
  money question is settled. *Since 2026-10-13 (ADR-031) this is judged per skater: a paid or waived skater's lesson
  never changes, even when the other skater's place in a shared lesson is re-priced.*
  A skater's personal price is left alone. The coach set it on purpose, and a block's price change doesn't reach it.
  *(Phase 2 since 2026-10-13, ADR-003: MVP has no personal prices.)*
  Dates covered by a special schedule follow that special schedule's blocks. A change to the weekly schedule doesn't
  re-price them; a change to the special schedule does.
  A lesson the new schedule no longer has is cancelled instead (see cancelation.md). A lesson is never both
  cancelled and re-priced.
  *(from ADR-020 §1, moved 2026-11-08)*

Price increases wait for the notice period; decreases apply at once:
  *Decided by the owner, 2026-09-30.*

  | Direction | Which upcoming lessons are re-priced |
  |---|---|
  | **Increase** | Only lessons starting **later than the coach's cancellation notice period** from when the change is carried out. Lessons inside that window keep the old price. |
  | **Decrease** | **Every** upcoming lesson, including tomorrow's. |

  This always favours the family. A family can't cancel a lesson inside the notice period without the missed-lesson
  fee, so a price rise landing there is one they can't react to, and it isn't applied. A price cut only helps them,
  so there's no reason to hold it back.
  The coach is told on the review page which lessons an increase won't reach (see Schedule Creater.md).
  Kim's answer to Items to ask Kim About.md §1 question 4, "Move if they are outside the notice period", matches
  this rule for price increases.
  *(from ADR-020 §2 and its Status, moved 2026-11-08)*

The missed-lesson fee follows the same rules:
  *Decided by the owner, 2026-09-30.* A change to a block's missed-lesson fee moves upcoming lessons' fee the same
  way: increases only beyond the notice period, decreases always. The fee is 0 throughout MVP, so this only matters
  once the fee is charged in Phase 2. *(from ADR-020 §3, moved 2026-11-08)*

What the family is told:
  One message per family for each schedule change, listing what changed:
    An increase: the lessons affected and the new price.
    A decrease: the same, framed as good news, e.g. "Good news: 3 of your lessons are now $50."
    A change that also cancels lessons: one message covering both.
  Email carries the detail. The text message, for families who opted in, is a pointer to the email under ADR-007's
  rules: one 160-character text, the "<Coach name> via BladeBook:" prefix, no free text. New text-message templates
  for price changes, and for a change that both re-prices and cancels, are needed and must be length-tested
  (ADR-007 decision 7).
  *Note 2026-10-12 (ADR-007 amended): all text messages (SMS) to families are Phase 2. In MVP families are told by
  email only.*
  *(from ADR-020 §6 and its Status, moved 2026-11-08)*

Open questions:
  Changing a skater's personal price: whether that re-prices the skater's upcoming lessons under the rules above,
    and what shape the personal price takes (a fixed price, a percentage off, or an amount off). Also §5 of Items to
    ask Kim About.md. *Phase 2 since 2026-10-13 (ADR-003).*
  Changing the notice period itself: from Phase 2 a coach can edit their notice period (ADR-016). Whether booked
    lessons follow that change too is undecided.
  The text-message templates for price changes and for mixed changes (see "What the family is told").
  ~~Hand-edited lesson prices would be overwritten. A coach could edit one lesson's price by hand (ADR-003 decision
    2), and the next schedule save, even an unrelated one, would put the block's price back and tell the family.
    Either per-lesson editing goes (a personal price and *mark as waived* cover the cases), or hand-set prices are
    marked and never re-priced. Raised 2026-09-30; waiting on coach input, Items to ask Kim About.md §5. Must be
    settled before re-pricing is built.~~ *Settled 2026-10-13 by the owner (ADR-031): editing one lesson's price is
    removed. The price lives only on the lesson time, and each skater's share is worked out from it. A one-off is
    covered by *mark as waived*. Personal prices (already Phase 2) will be applied per skater when the share is
    worked out.*
  ~~The large-change threshold.~~ *Settled 2026-10-13; see Schedule Creater.md, "Big price change warning".*
  *(from ADR-020 Open, moved 2026-11-08)*
