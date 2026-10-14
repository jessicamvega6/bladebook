Coach Payment Section on Dashboard
*Updated 2026-10-12 to match the Harbor design. The design is the source of truth.*

shows a list of students who had lessons by date range. Makes the coach select a date range before the list appears. 
The coach will need the following abilities:
 To mark the lesson as paid. 
 To send a payment reminder. phase 2
 to mark a payment as waived.
 to filter by unpaid *(Design: an Unpaid / All switch.)*
 *Design: to undo a paid or waived lesson back to unpaid.*
 To record how the client paid (added 2026-10-07 from talking with Kim). The coach enters this.
   *Design: payments-mark-paid.html; how they paid shows under each Paid badge and can be changed.*

How the client paid:
 The options come from the payment types on the coach's profile, plus "Other". There is no free text.
 Only the payment types on the coach's profile are listed, plus Cash if the coach turned on "I accept cash".
 e.g. a coach with only a Cashapp handle sees Cashapp and Other.
 Optional when marking paid, editable afterwards, and seen only by the coach. A waived lesson has none.
 *(Decided 2026-10-12, ADR-003 d4.)*

 Open questions are tracked in docs/Open-Pending.md §3.

*Design (payments-empty.html, payments.html, payments-all.html):*
  From and To dates come first; nothing is listed until both are set.
  Figures: unpaid total, no-shows (and how much of that is unpaid), lessons not recorded (with a link to Lessons),
  and paid total.
  Table: skater and family, lesson day and time, attendance, amount, payment status, and Waive and Mark paid (or Undo).
  A lesson with no attendance recorded is highlighted.
  A no-show shows the full lesson price until it's marked paid or waived. Upcoming lessons aren't listed until they've
  happened. Amounts are in the coach's currency.
  "Send reminders" button, disabled and tagged Phase 2.
  *Added 2026-10-13 (ADR-031 decisions 7 and 14):* in a shared lesson each skater has their own row, with their own
  share of the price, attendance and payment status. Marking one skater paid or waived doesn't change the other.
 
