# ADR-016: Coach Signup

## Status

**Accepted** — 2026-09-22. Closes `architecture.md` §11's longest-standing open thread,
*"How does a coach account come to exist?"*, open since 2026-08-25 and deferred once.

Source: `FeatureDecriptions/Coach Sign Up`, with `Coach App` and `Client Sign Up` as the
surfaces it has to interlock with.

**Amended — 2026-09-29.** Decision 2's profile gains `requiredNoticeHours`, which
[ADR-015](ADR-015-late-cancellation-and-no-show-charges.md) decision 3 places on the coach
profile and this ADR's table omitted. It defaults to 24 and is not editable until Phase 2.

**Amended — 2026-10-01.** Decision **7a**'s *"never to a `PENDING` family"* is now also
enforced by the database: a client session tagged `linkStatus = PENDING` cannot read
anything in the coach's partition, contact details and payment handles included
([ADR-022](ADR-022-client-isolation-at-the-database.md) decision 6). The per-field display
switches stay in code.

**Amended — 2026-10-01.** The `CODE#` item now carries the coach's first and last name and
`profilePhotoKey`, so the client sign-up code screen can show them before the family has an
account, without reading this profile (ADR-022 decision 7). A rename or photo change updates
the `CODE#` item too. How that screen fetches the photo waits on decision 5's photo bucket.

**Amended — 2026-10-05.** Decision **5**'s profile photo is **deferred to Phase 2** by the
owner. MVP has no photo upload, no photo bucket and no resize step; `profilePhotoKey` stays
in the schema and in the `CODE#` item's attribute allowlist but is never set until Phase 2,
so every screen takes decision 5's "no photo uploaded" path. *Decided by the owner, same day:*
where a photo would appear, including the family's code-entry screen, MVP shows the coach's
**initials** in a circle.

**Note — 2026-10-09.** [ADR-003](ADR-003-lesson-pricing-and-payment.md) decision 4 (amended) uses
decision 7's handles as the options for **how the client paid**, plus *Other*.

**Amended — 2026-10-12.** *Decided by the owner.* Decision **7** gains a fourth payment type,
**Cash** (`acceptsCash`, a yes/no the coach sets at sign-up or on the profile). Cash has no
handle, so it's a switch rather than a field. It feeds ADR-003 decision 4's how-paid options.
`paymentInstructions` still covers cheques, Interac e-transfer and anything else.

**Amended — 2026-10-12, later.** *Decided by the owner.* **One switch per payment type.** Cash,
Cash App, Venmo and PayPal each have their own on/off switch, set at sign-up and changed any time
on the profile: `acceptsCash`, `acceptsCashapp`, `acceptsVenmo`, `acceptsPaypal`, all off by
default. A type that has a handle needs it filled in before it can be switched on. A type
switched **on** is a how-paid option (ADR-003 decision 4) **and** is shown to the coach's
confirmed families wherever decision 7a shows payment details. Switching a type off removes it
from both. Past bookings keep their `paidVia`. This **replaces** `displayPaymentTypesToClients`
(*Show my payment handles*) in decisions 7 and 7a. Example: a coach who signs up with Cash and
Venmo, then adds PayPal and drops Venmo, switches PayPal on and Venmo off on the profile.
Switching a type off keeps its handle, so switching it back on needs no retyping. **Switching
Cash App, Venmo or PayPal back on asks the coach to verify that the kept handle is still
correct** before it takes effect. Cash has no handle, so it switches straight back on.

**Amended — 2026-10-13.** *Decided by the owner through the Harbor design, which is the source of
truth (`design/harbor/coach`, sign-up step 4 and Profile → Business email).* **A business email
that differs from the login email must be confirmed by a link before it is used.** Until then,
families' replies go to the address already in use: the login email at sign-up, or the current
business email when the coach changes it on the profile. The aim is that a typo can't send
every family's replies to a stranger. Decision 8 is unchanged: `Reply-To` is always
`businessEmail`. But `businessEmail` only ever holds a **confirmed** address (or the login email,
which decision 4 already verifies).
- **At sign-up**, step 3 offers *Use my login email* or *Use a different email*. A different
  address gets a link on step 4, with *Resend link*, *Change address* and *Use my login email
  instead*.
- **On the profile**, the coach keeps a list of addresses and picks one. *Use a new address*
  sends a link, and the address can't be picked until it's confirmed. Any address except the
  current one and the login email can be removed.
- **BladeBook sends the link**, not Cognito, because Cognito verifies only the login email.
  It is a new email template (`FeatureDecriptions/Email templates Needed:`).
- *Open:* how the link is built and how long it lasts. Like ADR-026's invitation link, opening
  it should lead to a page the coach confirms on, so a mail scanner that follows links can't
  confirm the address by itself.

**Amended — 2026-10-24.** [ADR-023](ADR-023-rinkside-check-in-joins-the-coach-website.md) decision 10: a Cognito post-confirmation
trigger adds the `Coach` group when the login email is verified, so decision **9**'s first
signed-in session (the profile write) already carries the group ADR-023 decision 7 requires.

---

## Context

Every other entity in BladeBook has a documented origin. A client self-registers with a
`coachCode` (ADR-002 decision 1). A student is created by that client and confirmed by the
coach. A booking is written by a conditional put. **The coach — who owns the tenant, holds
every student record, and is the root of every partition key in the table — had no
specified origin at all.**

This was flagged as blocking because §7 treats the roster as children's data: *"Where
`isMinor = true`, we're storing data about a child plus their parent/guardian contact
info"*, with parental consent as the lawful basis and COPPA review pending. An
unspecified path to creating an account that collects that data is not a gap that can be
left to implementation.

The candidate gate was a business identifier — an Employer Identification Number (EIN) —
on the theory that a real business is a real coach.

---

## Decision

### 1. Signup is self-serve and ungated **for now**, with licensing already intended

*Decided by the owner, 2026-09-22.* Anyone can create a coach account today. There is no
invite, no approval queue, and no identity check.

**This is an interim position, not a conclusion.** The owner's stated intent is that the
signup URL will eventually be gated by a **licence number issued when a coach buys access
to the software**. How that works is undecided, so it is not designed here — but it is
recorded because it changes what kind of gate the system is eventually getting, and
therefore what this decision is standing in for.

**The EIN gate was researched and abandoned**, in that order:

- The Internal Revenue Service publishes **no public EIN verification interface**. TIN
  Matching exists but is restricted to payers filing information returns and is not
  available to a scheduling product. The Exempt Organizations file covers tax-exempt
  organisations only, which a coach's business will not be.
- Free of charge you can check **format plausibility** — nine digits, a valid two-digit
  prefix — which establishes that a string could be an EIN, never that it exists or belongs
  to the person typing it.
- Paid business-verification vendors do this properly, at the cost of a vendor relationship
  and a per-check fee.
- The field also **excluded Canada by construction.** `currency` offers `CAD`, and a
  Canadian business has a Canada Revenue Agency Business Number, not an EIN.

An identifier that cannot be validated is not a gate. Worse, it is a **net cost**: §7
commits to collecting *"only what's needed for scheduling + contact"*, and an unvalidatable
tax identifier sits in the table, the backups, the staging masking pipeline (*dev since ADR-027*) and any breach
scope, doing no work. It is therefore not collected.

### 1b. A licence number would succeed where the EIN failed — for a different reason

Worth stating, because the two look like the same idea and are not.

The EIN failed because it asks you to **validate someone else's identifier against a
registry you do not control**, and no such lookup is available to you. A licence number is
one **you issue yourself** at the moment of purchase, so validating it is a lookup in your
own records. That is trivially reliable, and it is why licensing can be a real gate when
the EIN could not be.

**But it gates commerce, not identity.** Buying a licence proves possession of a payment
method, not that the buyer coaches skating or should be near children. Licensing will add
friction and it will bound who can sign up to who has paid — it will not establish that a
coach is legitimate, and it must not later be mistaken for having addressed §7's
safeguarding concern. **Decision 1a remains the control that does that work, before and
after licensing ships.**

### 1a. The `coachCode` is the control that makes this acceptable

Self-serve signup is defensible not because the risk is small but because **a fraudulent
coach account is empty**.

No student data reaches a coach account by signing up. It arrives only when a real family
is handed that coach's `coachCode` *outside the website* (ADR-002 decision 1) and chooses
to enter it — and even then the student lands as `PENDING` and cannot book until the coach
confirms them (ADR-002 decision 2).

So the attack is not "register and receive children's data." It is "register, then persuade
families to enrol with you", which needs the same in-person trust an impostor would need
with no software involved at all. The account itself is inert, and the product is not the
thing standing between a bad actor and a family.

**This reasoning is the decision.** If the enrolment path ever stops requiring an
out-of-band code — a public coach directory, a searchable profile, an open join link — the
gate question reopens immediately, because the account stops being inert.

### 2. The coach profile

`COACH#<coachId> / PROFILE`, where `coachId` is the Cognito `sub`:

| Field | Notes |
|---|---|
| `firstName`, `lastName` | Replaces the single `name` field |
| `loginEmail` | The Cognito username; replaces `email` |
| `businessEmail` | Optional. **Defaults to `loginEmail` when blank** — stored resolved, not blank, so no consumer has to know the rule *Amended 2026-10-13: a different address must be confirmed by a link first; see the Status section.* |
| `phone` | New on the coach |
| `displayPhoneToClients` | Boolean, off by default — see decision 7a |
| `displayEmailToClients` | Boolean, off by default — shows `businessEmail` to families. *Added 2026-09-30*, decision 7a |
| `coachTimezone` | IANA, required — see decision 6. *Named `timezone` until 2026-09-30, a DynamoDB reserved word* |
| `currency` | `USD` \| `CAD`, default `USD` |
| `requiredNoticeHours` | The late-fee threshold (ADR-015 decision 3). **Defaults to 24**, matching the MVP cancel wording in ADR-009 decision 2; not on the signup form, and editable on the profile from Phase 2. *Added 2026-09-29* |
| `coachCode` | **System-generated**, not a form field — ADR-002 decision 2a |
| `profilePhotoKey` | Optional S3 key — see decision 5 |
| `paymentInstructions` | Free text, as ADR-003 |
| ~~`displayPaymentTypesToClients`~~ | ~~Boolean, gating **only** the handles below~~ *Replaced 2026-10-12 by one switch per payment type (Status note)* |
| `cashappHandle`, `venmoHandle`, `paypalHandle` | Optional; required for its type to be switched on |
| `acceptsCashapp`, `acceptsVenmo`, `acceptsPaypal` | Booleans, off by default. On = a how-paid option and shown to confirmed families. *Added 2026-10-12* |
| `acceptsCash` | Boolean, off by default. Makes *Cash* a how-paid option (ADR-003 decision 4) and, since the later 2026-10-12 amendment, shows it to confirmed families. *Added 2026-10-12* |
| `smsCancellationAlerts` | Boolean, **false until the coach ticks it** — *"Text me when a family cancels late"* on the signup form and profile *(label amended 2026-10-09: the text goes only for cancellations inside `requiredNoticeHours`, ADR-009)*. Sends the opt-in confirmation to `phone` when first ticked (ADR-009 decision 9, ADR-007 decision 8). *Added 2026-09-30* |
| `themeId` | Phase 2; Harbor for MVP *(Amended 2026-10-09: Harbor replaced Forest on 2026-10-01)* |

No password field. No EIN.

### 3. Cognito owns credentials and recovery entirely

The application never sees, stores or validates a password, and there is **no custom
forgot-password form**.

An earlier draft specified recovery by first name, last name, business identifier and
username. Every one of those is discoverable — a name is public, a business identifier is
often a public registry entry, and the username *is* the login email. That is
knowledge-based recovery, and it would have been an account-takeover path into the account
holding every student record on a system already flagged for COPPA review.

Cognito's `ForgotPassword` / `ConfirmForgotPassword` sends a one-time code to the verified
address and is strictly stronger than anything worth building here. Password policy is pool
configuration, not application code.

### 4. The login email must be verified before the account is usable

With decision 1 removing every other check, email verification is the one control left, and
it is free. It proves control of an address rather than legitimacy — but it is what makes
`ForgotPassword` meaningful, and what makes the account reachable when something breaks.

An unverified account may exist; it may not hold students.

### 5. Profile photo — optional, capped, resized, revealed late

Optional. Client Sign Up already renders *"coach name and photo (if uploaded)"*, so the
absent case is designed for, and a failed upload must never block account creation.

**Cap the upload at 2 MB and resize server-side to 512 px on the longest edge.** The
original is not retained. A phone camera photo is several megabytes and would otherwise be
served unmodified to every client on the booking page, on every load. These numbers are a
recommendation rather than a constraint — change them freely; what matters is that a cap
and a resize both exist.

**The photo is revealed only after a valid `coachCode` is entered**, per Client Sign Up.
This is presentation, not protection — see Open.

*Amended 2026-10-05:* **deferred to Phase 2.** MVP ships without the photo; the absent case
above is the only case until then, and it shows the coach's **initials** in a circle,
including on the family's code-entry screen. The limits here stand for when it arrives.

### 6. Timezone and currency are captured here, because nothing else captures them

ADR-001 decision 4 requires `Coach.coachTimezone` as an IANA identifier *"stored from the first
write"*, and every booking stamps `coachTz`. Until this ADR, **no surface collected it.**
Currency was settled as `USD`/`CAD` chosen at signup, and likewise had no form.

Both are therefore required fields, not optional profile polish. A coach without a timezone
cannot have a schedule expanded correctly, and the day-of reminder and end-of-day report
both run against it.

### 7. Payment details: free text always, handles by choice

Two mechanisms, deliberately:

- **`paymentInstructions`** is free text and appears in the payment reminder email
  unconditionally, exactly as ADR-003 has it. It is the only option that covers Interac
  e-transfer, cash, cheque, or anything else a coach actually uses — and the only one that
  works for a `CAD` coach, since Cashapp, Venmo and PayPal are US-centric.
  *Amended 2026-10-12:* cash now has its own switch, `acceptsCash` (see the Status note), so
  `paymentInstructions` covers cheques, Interac e-transfer and anything else.
- **The three handles** are structured and appear **only when
  `displayPaymentTypesToClients` is set.** *Amended 2026-10-12: each payment type now has its
  own switch, which replaces this one (Status note).*

The checkbox governs the handles alone. It does not suppress `paymentInstructions`, which
would silently strip payment information out of a reminder email whose entire purpose is to
say how to pay.

### 7a. What a coach's families can see, and when

*Decided by the owner, 2026-09-30.* Three switches on the coach profile, **all off until the
coach turns them on**:

| Switch | Shows |
|---|---|
| *Show my phone number* — `displayPhoneToClients` | `phone` |
| *Show my email address* — `displayEmailToClients` | `businessEmail` |
| ~~*Show my payment handles* — `displayPaymentTypesToClients`~~ | ~~Cashapp, Venmo, PayPal~~ *Replaced 2026-10-12: each payment type switched on is shown (Status note)* |

**Where, when switched on:** a coach card on the client website's home page and at the top
of the booking page, and the footer of client emails. **Never in a text** (ADR-007 forbids
free text there), and not on the rinkside app, which is the coach's own.

**Only to families the coach has confirmed.** A family still `PENDING` sees the coach's name
and photo, as decision 5 has it, but none of these details. A coach code can be passed around
or guessed — the reason the confirmation step exists (ADR-002 decision 2, decision 1a here) —
so entering a code must not hand over the coach's phone or email.

Replies to client email go to `businessEmail` whatever the switch says (decision 8): the
switch controls only whether the address is printed. `paymentInstructions` is separate and
always appears in payment-reminder emails (decision 7).

### 8. `businessEmail` becomes the Reply-To on client-facing mail

*"What a client responds to if they click reply within an automated email."* Every
client-facing Simple Email Service (SES) message sets `Reply-To: businessEmail`.

**§9 has no concept of a Reply-To on any message**, so this is a new requirement on the
notification path rather than a profile field that happens to be stored. It applies to the
day-of reminder, the payment reminder and the cancellation notifier. The envelope sender
stays the application's verified domain — replacing it would break the SES sending identity
and the bounce handling ADR-010 depends on.

### 9. Cognito first, profile second, and the profile write is resumable

Order matters, because two systems are being written and only one can be authoritative.

1. Create the Cognito user and verify the email.
2. Write `COACH#<sub> / PROFILE` and the `CODE#<coachCode>` item (ADR-002 decision 2a).

**The Cognito user is the source of truth for identity**; `coachId` *is* the `sub`, so the
profile write is idempotent by construction and a retry cannot create a second coach.

A failure between the two leaves an account that authenticates but has no profile.
Rather than compensating with a rollback, **first login checks for the profile and completes
signup if it is missing.** This turns the only partial-failure state into an ordinary
resumable path, and it is the same shape ADR-010 decision 5b uses for the cancellation
consumer: make the second attempt finish the first rather than undo it.

---

## Consequences

- **§11's oldest open thread closes**, and the answer is an acceptance rather than a
  mitigation. Decision 1a is what makes it an informed one; without that reasoning recorded,
  a future reader sees only "anyone can sign up."
- **The coach profile roughly doubles in size** — eight new fields, three of them optional
  payment handles. None is on a hot path; the profile is read once per session.
- **A new storage surface.** Profile photos are the first user-uploaded content in the
  system. That brings an upload path, a resize step, a bucket, and a public-read object
  served through CloudFront — none of which existed before.
- **The notification path gains a per-coach header.** Decision 8 means every client-facing
  send now reads the coach profile for `businessEmail`. The cancellation notifier already
  reads it; the reminders do not, and will have to.
- **ADR-002's `coachCode` becomes load-bearing for security, not just routing.** It was
  described there as *"a shared secret, and shared secrets spread"*, with `PENDING` as the
  control. Decision 1a now leans on that same pairing as the reason self-serve signup is
  acceptable. It should not be weakened without revisiting this ADR.
- **Nothing here gates on payment.** A coach can sign up, receive a code, enrol families and
  take lessons without the product ever establishing they are who they claim. That is the
  accepted position, stated plainly.

---

## Open

- ~~**Rate-limiting the `coachCode` lookup.** Client Sign Up validates on focus-out at five
  characters and returns a coach's name and photo. Five characters is an enumerable
  keyspace, so without a throttle this harvests coach names and photos. **Severity is lower
  than it first appears** — ADR-002 already treats the code as a shared secret rather than a
  credential, and `PENDING` means an enumerated code cannot produce a bookable student — so
  this is a scraping and privacy concern, not an account-takeover one. §7 lists API Gateway
  throttling generally; this route needs a specific number.~~
  **Settled.** ADR-019 (2026-09-30) limits code lookups to 20 per 5 minutes per address, and
  since 2026-10-13 the code is **8 random characters** (`7K2Q-M9XT`, ADR-002 amended), about
  378 billion possibilities, so it can't be enumerated.
- **How licensing actually works.** Undecided by the owner and deliberately not designed
  here: what a licence costs, whether it renews, what happens to a coach's data when one
  lapses, whether a licence is per-coach or per-organisation, and whether the gate sits in
  front of the signup URL or in front of the first save. **The lapse question is the one
  with teeth** — a coach whose licence expires still has families with booked lessons, and
  nothing in the model expresses a suspended tenant.
- **Whether any business identifier returns**, and what Canada's equivalent would be if one
  does. The field is commented out pending research, not deleted.
- **Photo moderation.** An optional image, uploaded by an unvetted account, displayed to a
  member of the public who has entered a code. Nothing inspects it and nothing can report
  it.
- **What a coach sees on first login.** Decision 9 makes first login complete a partial
  signup, and decision 6 makes timezone and currency mandatory — but ADR-008's open item
  *"a coach with no schedule at all"* means the first thing a new coach meets is an empty
  grey month. The two need designing together.

---

## Revisit if

- **Enrolment stops requiring an out-of-band code** — a directory, a public profile, a join
  link. Decision 1a's entire argument is that the account is inert until a family acts on a
  code received in person, and that premise would be gone.
- **Licensing ships.** This is the expected path, not a hypothetical — decision 1 is
  explicitly interim. When it lands, signup gains a purchase step, a licence-issuing system
  and a redemption check ahead of the form, and this ADR's decision 1 is superseded rather
  than amended.
- **Paid business verification becomes affordable**, which would convert an identity check
  from overhead into a real gate — a different thing from the licence gate above, and the
  only one of the two that speaks to §7.
- **A fraudulent coach account is reported.** That would mean the social path in decision 1a
  was walked, and the response is probably reporting and suspension surfaces rather than a
  signup gate.
- **A second frontend needs the coach profile** — the check-in app reading `businessEmail`
  or the photo would make the profile a cross-surface read rather than a website one.
