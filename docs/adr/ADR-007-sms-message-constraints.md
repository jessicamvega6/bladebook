# ADR-007: SMS Message Constraints

## Status

**Accepted** — 2026-08-17.

Amends **ADR-003 decision 7**, which states that the payment reminder carries the
amount owed "plus the coach's `paymentInstructions`." That describes the **email**. The
SMS cannot carry payment instructions and does not.

Governs every SMS path in the system: the day-of reminder (§6.2), the payment reminder
(§6.3), and the cancellation digest (ADR-006 decision 6). It constrains **form**, not
frequency — ADR-002 decision 7 (one reminder per lesson) and ADR-006 decision 6 (one
cancellation message per client per batch) are unchanged.

**Amended — 2026-09-30.** Two open questions settled by the owner. **Opt-in belongs to the
phone number** (decision 8a), which resolves the per-student/per-client inconsistency. **Every
message is prefixed `<Coach name> via BladeBook:`** rather than `BladeBook:` (decision 5a),
which changes decision 6's worst-case lengths and decision 8's template.

**Amended — 2026-10-12.** *Decided by the owner.* **All SMS to clients is Phase 2**: the day-of
reminder, the payment reminder, the cancellation digest, shared-lesson invitation texts
(ADR-026) and the price-change texts (ADR-020). In MVP every client gets email only, and the
client's `smsOptIn` and its opt-in confirmation (decision 8) wait for Phase 2. **The one SMS path
in MVP is the coach's own late-cancellation text** (decision 5b; `smsCancellationAlerts`,
ADR-009 decision 9, ADR-016). Decisions 1–4, 7 and 9 apply to it unchanged, and decision 8's
opt-in confirmation is sent to the coach's `phone` when they first tick it. The rest of this ADR
stands as the design for Phase 2.

---

## Context

SMS is opt-in (per phone number, since 2026-09-30 — decision 8a) over SNS at ~$0.01–0.02 per message, gated on 10DLC
registration. Nothing until now has said what an SMS may *contain*, and three separate
paths send them. Two of those interpolate content with no length ceiling at all:

- **`paymentInstructions`** (ADR-003 decision 6) is free text a coach types — e-transfer
  details, a Venmo handle, a paragraph about cash at the rink. Unbounded by design, and
  explicitly so: "the system does not need to model any of it."
- **The cancellation digest** (ADR-006 decision 6) lists every lesson one client lost in
  a batch — six lessons in that ADR's worked example, and there is no bound on it.

A message longer than one segment is split by the carrier and billed per segment. The
split point is not under our control, segment ordering is not guaranteed on every
carrier, and a reassembly failure shows the client half a message with no indication
that it is half.

---

## Decision

### 1. Every SMS is one segment — 160 characters, enforced in code

Checked before `sns:Publish`, not by convention and not by review. A message that would
exceed 160 characters is a defect, not a longer message.

**One message is exempt** — the opt-in confirmation, decision 8. Every other path in
the system sends exactly one segment.

### 2. GSM-7 only — otherwise the limit is 70, not 160

160 characters is the segment size for the **GSM-7** alphabet. A **single** character
outside it switches the entire message to **UCS-2**, and the per-segment limit drops to
**70** — less than half. A character budget without a character-set restriction is
therefore meaningless.

Every realistic way this happens is invisible in a code review:

- a typographic apostrophe `’` (U+2019) instead of `'` — the normal result of drafting a
  template in a word processor, a design doc, or a chat window
- an em dash `—` instead of `-`
- an accented letter in a real name: `José`, `Chloé`, `Zoë`
- any emoji

There is a second trap *inside* GSM-7: characters in its **extension table** —
`[ ] { } \ ~ ^ |` and `€` — each count as **two**. A template using square brackets
spends double without looking like it does.

**Rule:** transliterate to GSM-7 (`’`→`'`, `—`→`-`, `é`→`e`) before counting, count
extension-table characters as two, and reject anything that still does not fit rather
than sending it.

### 3. The SMS is a pointer; the email is the record

160 GSM-7 characters cannot hold a lesson list or a set of payment instructions, so the
SMS does not try. It states what happened and directs the client to the email — which
is unconstrained, and which every client always receives (§9: email is universal, SMS
is opt-in layered on top). No client depends on SMS for information that only exists
there.

### 4. User-authored free text is never interpolated into an SMS

`paymentInstructions` must never appear in one. It is unbounded, user-authored, carries
no character-set guarantee, and ADR-003 already treats it as PII-adjacent and requires
escaping on the email path. No truncation of it is both safe and useful — half a
payment instruction is worse than none at all, because it looks complete.

Coach and student **names** are user-authored too, but they are short and necessary, so
they are handled by decision 5 rather than excluded.

### 5. Variable fields are budgeted and truncated deterministically

Each template is a fixed skeleton plus per-field character budgets, set so the worst
case fits. A field over its budget truncates at a defined point with a single `.`
marker. A long student name never pushes a message into a second segment.

### 5a. The prefix names the coach: `<Coach name> via BladeBook:`

*Decided by the owner, 2026-09-30.* A client knows their coach, not the software, so the
message leads with the coach. "via BladeBook" keeps the program identifiable, which carrier
vetting for the 10-digit long code (10DLC) campaign expects.

The coach's name is user-authored and variable-length — exactly the field decision 5 exists
to control:

- **The name is the coach's `firstName` and `lastName`**, budgeted at **20 characters** and
  truncated by decision 5's rule when longer.
- **It is transliterated to GSM-7** before counting (decision 2), so an accented name cannot
  flip the whole message to the 70-character encoding.
- The prefix therefore costs up to 36 characters where `BladeBook: ` cost 11 — **25 more** in
  the worst case, applied to every template below.

### 6. Per-path message specs

*Amended 2026-09-30:* every template now opens with `<coach> via BladeBook:` (decision 5a).
The table below is the original record; the current worst cases, with a 20-character coach
name, are **88** (day-of reminder), **115** (payment reminder) and **105** (cancellation
digest). The tightest now spends 72% of the budget — less headroom than before, still inside
one segment.

| Path | Template | Worst case |
|---|---|---|
| Day-of reminder (§6.2) | `BladeBook: <student> has a lesson today at <time>.` | **63** |
| Payment reminder (§6.3) | `BladeBook: $<amount> due for <student>'s lesson on <date>. See email to pay.` | **90** |
| Cancellation digest (ADR-006 d6) | `BladeBook: <n> of your lessons <from>-<to> were cancelled by your coach. See email.` | **80** |

Measured against a 21-character student name (`Christopher-Alexander`) and a
three-figure amount. The tightest path spends 56% of the budget, which is deliberate
headroom — see Consequences.

### 7. Length and encoding are unit-tested per template

One test per template, asserting GSM-7 cleanliness and length at worst-case field
values. This is cheap and it is the only way the constraint holds, because both failure
modes are silent: an over-length message still sends, and a UCS-2 message still sends.
The bill and the client's screen are the only other places you would find out.

### 5b. A coach-directed template

*Added 2026-09-30.* The coach can opt in to a text when a family cancels ([ADR-009](ADR-009-cancellation.md)
decision 9). *Amended 2026-10-09: late cancellations only — inside `requiredNoticeHours` (ADR-009).* That text goes **to** the coach, so it opens `BladeBook:`, not decision 5a's
`<Coach name> via BladeBook:`:

`BladeBook: <student> cancelled <day> <date> <time>. See email.`

A batch cancelling several lessons reads *"<student> cancelled <n> lessons from <date>. See
email."* Both need decision 7's length test; with a 21-character student name the first is
about 65 characters. Decision 8a's rule — consent belongs to the phone number — applies to
the coach's number too.

### 8a. Opt-in belongs to the phone number

*Decided by the owner, 2026-09-30.* Consent is given by whoever holds the phone, so the phone
number is what opts in — not a student, and not an account as such.

In the model that means **`smsOptIn` lives on the client profile**, beside `clientPhone`,
because a client has exactly one phone number. ADR-002 decision 4 already makes
`CLIENT#…/PROFILE` the source of truth and copies the flag onto each student for the
notification path. So a parent with two children opts in once and both children's messages
reach that phone; nothing is chosen per child. `architecture.md`'s earlier "per-student
opt-in" wording described the copy, not the choice, and is corrected.

Decision 8's one-confirmation-per-number rule already followed this reading.

### 8. The opt-in confirmation message is the one exception to the length limit

Sent **once**, when a client's `smsOptIn` transitions false → true. It carries the
compliance payload — program identity, message frequency, rate disclosure, HELP and
STOP — so that the three recurring templates do not have to.

**It is exempt from decision 1** and is expected to run to two segments. *Amended
2026-09-30:* it now opens with the decision 5a prefix instead of naming the coach mid-sentence
— `<coach> via BladeBook: You are subscribed to lesson alerts. Msg frequency varies…` — which
comes out slightly shorter than the original below, at most about 230 characters. Still two
segments. The original:

```
BladeBook: You are subscribed to lesson alerts from Coach <coachName>. Msg frequency
varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel.
Terms: <termsUrl> Privacy: <privacyUrl>
```

216 characters with an ordinary coach name, 235 with a long one — two segments either
way. Note that **concatenated GSM-7 segments hold 153 characters, not 160**: seven bytes
of each segment go to the concatenation header. Two segments is therefore a 306-character
ceiling, which leaves real headroom.

**Exempt from decision 1 only.** Decisions 2 (GSM-7), 4 (no user-authored free text) and
5 (budgeted variable fields) all still apply. UCS-2 would double the segment count and
mangle the disclosure; `paymentInstructions` has no more business here than anywhere
else; and the coach's name is a variable field budgeted like any other.

**One message per phone number, not per student.** Consent attaches to the number, and
ADR-002 decision 4 makes `CLIENT#…/PROFILE` the source of truth for `smsOptIn`. A client
enabling SMS with two children receives one confirmation, not two.

**This is what resolves the compliance question the recurring templates raised.** Neither
the TCPA nor any state mini-TCPA requires opt-out text in the body of every message; the
requirement that bites is carrier and CTIA expectation, enforced through 10DLC campaign
vetting, and it is satisfied at the point of opt-in where there is no length pressure —
rather than by spending ~25 characters of every reminder forever. *This is an
engineering reading of the requirement, not a legal opinion; it belongs on the
pre-launch legal review §7 already mandates.*

### 9. Check the opt-out list before publishing, and record suppression as its own state

SNS honours `STOP` itself and maintains a per-account opt-out list, so the *honouring*
obligation is met at the platform layer. The trap is what happens next: publishing to an
opted-out number does not raise an error. A naive implementation records `SENT` for a
message that was never delivered and never could be.

So **call `CheckIfPhoneNumberIsOptedOut` before `sns:Publish`.** If the number is opted
out, do not publish, and record `SUPPRESSED`.

This adds a fourth value to ADR-006 decision 5's notification state:
`PENDING` | `SENT` | `FAILED` | `SUPPRESSED`.

**`SUPPRESSED` is not a failure.** It is the client's own choice, correctly honoured, and
the email — which every client receives regardless — still went. It is recorded
separately because it means something operationally different: `FAILED` means we tried
and could not reach them, `SUPPRESSED` means we were not permitted to try. A coach
chasing an unacknowledged cancellation needs to know which.

**On discovering suppression, set `smsOptIn = false`** on the client profile and fan out
to their students per ADR-002 decision 4. The client texted STOP to their carrier; SNS
knows and our record does not. Left unsynchronized, the coach's UI claims a client
receives texts when they do not, and every subsequent send repeats the same discovery.

The extra API call per SMS is negligible at this volume and needs no caching.

---

## Consequences

**Easier.** SMS cost is deterministic: one opt-in student, one event, one message, one
segment. No fragmentation, no reassembly failures, no surprise on the invoice. The rule
is mechanically checkable rather than a judgment call at each new template. The one
multi-segment message is sent once per client for the life of the account, so the
exemption in decision 8 costs approximately nothing.

**Compliance is concentrated in one place.** The disclosure obligations live in a single
message with no length pressure, rather than being smeared across three templates that
each have 160 characters to work with. There is one string to get right, and one string
to hand to a reviewer.

**Harder.** ADR-003 decision 7's promise that the payment reminder carries the coach's
payment instructions now holds only for email. A client who opted into SMS and does not
read email will not receive instructions — mitigated, but not eliminated, by email
always being sent.

**The headroom is real but it is not large.** The tightest template uses 90 of 160
characters. That absorbs longer names and larger amounts; it does not absorb a template
that tries to become informative. Any future message richer than a pointer will not
fit, and that is the intended pressure.

---

## Open

- *Phase 2 (2026-10-12): client SMS deferred.* **Templates for price changes** ([ADR-020](ADR-020-repricing-booked-lessons.md), 2026-09-30):
  an increase, a decrease ("good news") and a batch mixing price changes with cancellations.
  Each is a pointer to the email under decisions 1–5, and needs its decision-7 length test.
- *Scoped 2026-10-12: in MVP this and the next item concern the coach's opt-in only.*
  **Does the confirmation message alone satisfy the carrier**, or does a recurring
  program also need periodic re-disclosure? Decision 8 assumes once is enough for
  transactional traffic. This is the specific question to put to the 10DLC campaign
  registration, and the answer arrives from carrier vetting rather than from a statute.
- **`START` / `UNSTOP` is asymmetric.** Decision 9 flips `smsOptIn` to false when
  suppression is discovered, but a client who later texts `START` is re-enabled at the
  carrier while our record still says false — they would have to re-enable in the app.
  Acceptable, and currently unexplained anywhere in the UI.
- ~~Per-student or per-client opt-in?~~ **Settled 2026-09-30: per phone number** — stored on
  the client profile, which has one phone. See decision 8a.
- ~~Should the prefix be `BladeBook:` or the coach's name?~~ **Settled 2026-09-30:
  `<Coach name> via BladeBook:`** — see decision 5a.
- *Phase 2 (2026-10-12): client SMS deferred.* **A client who opts into SMS but whose email bounces** currently gets nothing usable,
  since the SMS only points at the email. Interacts with ADR-006's `FAILED` notification
  state, which records the bounce but triggers nothing.

---

## Revisit if

- SNS or 10DLC pricing changes such that multi-segment messages stop mattering
  financially. The fragmentation and ordering arguments survive the cost argument, so
  this would loosen decision 1 rather than delete it.
- A path genuinely needs to carry more than a pointer.
- Rich messaging (RCS) or a push channel arrives, at which point this ADR governs only
  the SMS fallback.
- Coaches operate where GSM-7 cannot represent client names — any non-Latin script makes
  decision 2's transliteration lossy to the point of being wrong, and the honest answer
  there is UCS-2 with a 70-character budget, not a mangled name.
