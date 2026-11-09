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

 *Moved from ADR-003 on 2026-11-08:*
 *Amended 2026-10-09, decided by the owner 2026-10-07 from talking with Kim:* the coach chooses how the client
   paid on the payment dashboard. ~~The options are the payment handles the coach has filled in on their profile
   (ADR-016 decision 7), plus Other. A coach with only a Cashapp handle sees Cashapp and Other; a coach with no
   handles sees only Other.~~ *Replaced by the later 2026-10-12 ruling below.* There is no free text: a payment that matches no handle is Other.
 *Amended 2026-10-12, decided by the owner:* Cash is not a fixed option. It's a payment type the coach turns on
   at sign-up or on their profile, and it appears in the list only when it's on. No other types are added;
   cheques and Interac e-transfer are Other. How-paid is optional when marking a lesson paid, editable afterwards,
   and seen only by the coach. A waived lesson has none.
 *Amended 2026-10-12, later, decided by the owner:* the how-paid options are the payment types the coach has
   switched on, plus Other. Each type has its own switch (ADR-016 decision 7, amended the same day), which
   replaces "Show my payment handles". *Ruled by the owner 2026-11-09.* The options are the types switched on, plus Other: a coach with only Cashapp
   switched on sees Cashapp and Other; a coach with none switched on sees only Other.
 *(from ADR-003 Status and §4 amendments of 2026-10-09 and 2026-10-12, moved 2026-11-08)*

Waiving a lesson:
 *Amended 2026-08-30.* A coach can forgive a charge — illness, a family emergency, a rink closure — and the
   dashboard gets a "mark as waived" action alongside "mark as paid". Waiving decides that money was never owed;
   it is not a refund.
 *(from ADR-003 §4, amendment 2026-08-30, moved 2026-11-08)*

Currency:
 Changing currency is Phase 2. Once it is allowed, a coach who moves from US dollars (USD) to Canadian dollars
   (CAD) has outstanding lessons in both, and the dashboard must show each lesson in its own currency and must
   not add a mixed list into a single total.
 *(from ADR-003 Open, "Currency", moved 2026-11-08)*

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
 
