SMS Messages
(Written 2026-11-08 from the message wording in ADR-007. The length limit, character set, tests and opt-out
handling are technical rules and stay in ADR-007.)

Every text message (SMS, short message service) is one short message of at most 160 plain characters. A text
only says what happened and points to the email; the email is the full record and every family always gets it.
A text never includes anything the coach typed, such as payment instructions.

What is sent in MVP:
  *Decided by the owner, 2026-10-12.* All texts to families are Phase 2: the day-of reminder, the payment
  reminder, the cancellation digest, shared-lesson invitation texts and the price-change texts. In MVP every
  family gets email only, and the family's "texts on" choice and its opt-in confirmation wait for Phase 2.
  The one text in MVP is the coach's own late-cancellation text (below). Its opt-in confirmation is sent to the
  coach's phone when they first tick it.
  *(from ADR-007 Status, amended 2026-10-12; the scope rule is also kept in the ADR because it decides which
  send paths exist)*

Prefix:
  *Decided by the owner, 2026-09-30.* Every text to a family opens with "<Coach name> via BladeBook:" rather
  than "BladeBook:". A family knows their coach, not the software, so the message leads with the coach.
  The name is the coach's first and last name. A long name is shortened (the limit is in ADR-007 decision 5a).
  *(from ADR-007 §5a, moved 2026-11-08)*

Texts to families (Phase 2):
  *Amended 2026-09-30:* every text now opens with "<coach> via BladeBook:" (see Prefix). The wording below is
  the original record, written with the old "BladeBook:" prefix.
    Day-of reminder:      BladeBook: <student> has a lesson today at <time>.
    Payment reminder:     BladeBook: $<amount> due for <student>'s lesson on <date>. See email to pay.
    Cancellation digest:  BladeBook: <n> of your lessons <from>-<to> were cancelled by your coach. See email.
  The payment reminder text states the amount and points at the email; the payment instructions are only in
  the email (ADR-007 amends ADR-003 decision 7, 2026-08-17). A family who turned texts on and doesn't read email
  won't see the instructions.
  *(from ADR-007 §6 and Consequences, moved 2026-11-08)*

  Price changes (Phase 2, 2026-10-12: family texts deferred). Texts are needed for a price increase, a decrease
  ("good news") and a batch mixing price changes with cancellations (ADR-020, 2026-09-30). Each points to the
  email. Wording not yet written.
  *(from ADR-007 Open, moved 2026-11-08)*

Text to the coach — a family cancelled late (MVP):
  *Added 2026-09-30.* The coach can opt in to a text when a family cancels (ADR-009 decision 9).
  *Amended 2026-10-09: late cancellations only — inside the coach's notice period (ADR-009).*
  It goes to the coach, so it opens "BladeBook:", not "<Coach name> via BladeBook:":
    BladeBook: <student> cancelled <day> <date> <time>. See email.
  When one cancellation covers several lessons:
    <student> cancelled <n> lessons from <date>. See email.
  *(from ADR-007 §5b, moved 2026-11-08)*

Opt-in confirmation:
  Sent once per phone number, when texts are first turned on. It carries the legal wording — who is sending,
  how often, that message and data rates may apply, and how to reply HELP or STOP — so the other texts don't
  have to. It is the one text allowed to run to two parts.
  *Amended 2026-09-30:* it opens with the prefix instead of naming the coach mid-sentence:
    <coach> via BladeBook: You are subscribed to lesson alerts. Msg frequency varies...
  The original:
    BladeBook: You are subscribed to lesson alerts from Coach <coachName>. Msg frequency
    varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel.
    Terms: <termsUrl> Privacy: <privacyUrl>
  *(from ADR-007 §8, moved 2026-11-08)*
