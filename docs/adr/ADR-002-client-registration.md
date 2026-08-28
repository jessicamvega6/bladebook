# ADR-002: Client Registration and the Client↔Student Link

## Status

**Accepted** — 2026-07-29. Closes the gap where `architecture.md` §7 promised that
"client access is filtered through GSI1 to the students linked to that client"
while no such link existed in the model. Adds entities and access patterns to §4,
§5 and §7. Terminology follows §0 unchanged: a **student** is the person coached
(any age); a **client** is whoever books, is billed and is notified — the student
themselves when adult, a parent or guardian when the student is a minor.

---

## Context

`architecture.md` described client-facing access as a solved problem but contained
no mechanism for it. Concretely: `STUDENT` had no client field; GSI1 is keyed
`STUDENT#<studentId>`, so a client would already have to know their student IDs to
query it; there was no access pattern for "list the students belonging to this
client"; and nothing described how a Cognito account comes to exist or becomes
associated with students a coach can see.

This blocked MVP feature #3 (clients book open slots) entirely — a signed-in client
had no way to discover what they were allowed to book for.

---

## Decision

### 1. Clients self-register with a coach code

There is no invite email and no coach-created credential. A client is given the
site URL and the coach's **`coachCode`**, and registers themselves:

1. Create a Cognito account (email + password), verify the email.
2. Enter the `coachCode`. It resolves to exactly one coach, or registration stops.
3. Declare who they are registering:
   - **themselves**, as an adult student → one student, `isMinor = false`,
     `clientRelationship = SELF`, contact copied from the account;
   - **their child**, as a parent or guardian → prompted for **one or more**
     children, `isMinor = true`, `clientRelationship = PARENT | GUARDIAN`.
4. Students are created with `status = PENDING`.

Multiple children in one sign-up is a first-class path, not an afterthought — the
sibling case is common enough that requiring a second account per child would be
the wrong default.

### 2. New students are PENDING until the coach confirms them

A `coachCode` is a shared secret, and shared secrets spread — a code posted in a
team group chat lets anyone create students against that coach. So possession of
the code grants *candidacy*, not membership. A `PENDING` student appears in the
coach's roster for confirmation and **cannot book**; only `ACTIVE` students can.

*Confirmed by the owner, 2026-07-29.*

Codes are rotatable. Rotation invalidates the old code for future sign-ups and does
not affect existing students.

### 2a. The code is generated at coach signup

A `coachCode` is created and assigned automatically when a coach account is created
— it is not something a coach requests or an operator issues. Generation writes the
`CODE#<coachCode>` lookup item with `attribute_not_exists(PK)`; on the (rare)
collision, regenerate and retry. The code is displayed in the coach app for the
coach to hand out.

### 3. The link is a record under the client, not an index

| Item | PK | SK | Notable attributes |
|---|---|---|---|
| Client profile | `CLIENT#<cognitoSub>` | `PROFILE` | clientName, clientEmail, clientPhone, clientRelationship, smsOptIn |
| Client→student link | `CLIENT#<cognitoSub>` | `STUDENT#<coachId>#<studentId>` | studentName (denormalized for list rendering), status |
| Coach code lookup | `CODE#<coachCode>` | `CODE` | coachId |

The `STUDENT` item (still under `COACH#<coachId>`) gains `clientId` and `status`.

Three consequences of this shape, which is why it was chosen over a third GSI:

- **"List my students" is one `Query`** on `PK = CLIENT#<sub>` with
  `begins_with(SK, "STUDENT#")`. No new index, no write amplification, no extra
  storage cost.
- **`coachId` sits inside the sort key**, so decision #4 below (students scoped to
  one coach) is a policy we enforce, not a shape we are trapped by. Supporting a
  client with students under two coaches later requires no key redesign.
- **The coach code resolves in a single `GetItem`**, and the item is written with
  `attribute_not_exists(PK)`, which makes uniqueness a database guarantee rather
  than an application check.

### 4. Contact details live on the client; the student keeps a copy

`CLIENT#<sub>/PROFILE` is the **source of truth** for `clientName`, `clientEmail`,
`clientPhone` and `smsOptIn`. The existing denormalized copies on the `STUDENT`
item stay exactly as `architecture.md` §5 already documents them, and a client
profile edit transactionally fans out to that client's students.

This keeps every notification path at **one read per booking** — the reminder and
payment Lambdas already fetch the student, and now still find contact details
there. The alternative (contact only on the client) would double reads on the two
scheduled jobs to buy consistency the fan-out already provides. A client has one
to four students, so the fan-out is a small transaction.

### 5. Students are scoped to a single coach for MVP

Enforced at registration: a client account registers against one `coachCode`. The
key layout does not foreclose relaxing this (see #3).

### 6. Coach codes and coach profiles stay in the single table

*The owner raised whether coach codes and coach information warrant a separate
table. They do not.*

A second table would buy nothing here and cost several things. DynamoDB is not
relational: one table is designed to hold heterogeneous item types distinguished by
key prefix, which is exactly what `CODE#<code>` and `COACH#<coachId>` are. The
coach profile item (`COACH#<coachId>` / `PROFILE`) already exists in §5 and needs
no new home.

Against splitting:

- **Cost is identical.** Two on-demand tables at this scale both round to $0. There
  is no billing argument in either direction.
- **A second table doubles the §7 surface.** Another set of IAM grants per Lambda,
  another encryption configuration, another point-in-time-recovery setting, another
  backup policy — in a design whose stated first priority is least privilege, that
  is real cost for no benefit.
- **Registration writes the student, the link, and reads the code in one logical
  operation.** `TransactWriteItems` can span tables in the same account and region,
  so this is not a hard blocker — but it is simpler, cheaper and easier to reason
  about within one table.
- **Nothing differentiates the workloads.** Tables are normally split for divergent
  scaling, access, or retention characteristics. Coach codes are tiny, rarely
  written, and read once per registration.

The instinct to separate them is a relational one — in Postgres these would
obviously be different tables. Under a single-table DynamoDB design, "different
table" and "different key prefix" are the same idea, and the prefix version is
cheaper.

If codes should eventually expire, that is a DynamoDB **TTL attribute** on the
`CODE#` item, which works identically in one table.

### 7. Reminders are per lesson, not per client

Every scheduled lesson produces its own reminder. A client with two children who
both have lessons on the same day receives **two** reminders, one per lesson. There
is no per-client digest, no grouping, and no deduplication.

This confirms the loop in §6.2 as written — the job queries `GSI2PK = DATE#today`
and notifies per booking — and means no change is needed there. It also keeps the
payment reminder (§6.3) unambiguous: each lesson is its own message about its own
booking.

---

## Access patterns added to §5

| # | Query | Served by |
|---|---|---|
| 8 | List a client's students | Main table, `PK = CLIENT#<sub>`, `begins_with(SK, "STUDENT#")` |
| 9 | Resolve a coach code to a coach | Main table, `GetItem PK = CODE#<code>` |
| 10 | List a coach's pending students | Existing pattern #2, filtered on `status = PENDING` |

A client's upcoming bookings (existing pattern #6) becomes two steps: pattern #8 to
get their student IDs, then GSI1 per student. At one to four students this is
cheaper than maintaining an index to avoid it.

---

## Authorization (extends §7)

- `clientId` is the **Cognito `sub` from the verified JWT**, never from the request
  body — same rule §7 already applies to `coachId`.
- Every client read is rooted at `PK = CLIENT#<sub-from-token>`, so a client
  structurally cannot enumerate another client's students.
- Booking and GSI1 reads must verify the target `studentId` appears in the caller's
  link set. This is the one client-side check that is *not* structural, because
  GSI1 is keyed by student rather than by client — it must be enforced in code and
  is the natural place for an authorization test.
- Coach confirmation of a `PENDING` student is a coach-role action, scoped by
  `coachId` from the token.

---

## Consequences

**Easier.** Registration needs no email infrastructure, which matters because SES
is sandboxed until a domain exists — clients can register before that lands. The
sibling case is one account and one flow. A coach hands out one code rather than
managing an invite list.

**Harder.** There is now a coach-side confirmation queue in the MVP UI that did not
exist in §10's feature list — small, but real, and it belongs to feature #1.
Client profile edits are a transactional fan-out rather than a single write.

**Deliberately deferred.** *One student with two clients* — separated parents who
both want reminders — is **not** supported. `STUDENT.clientId` is singular. The
link records already permit two `CLIENT#` items pointing at one student; the
change needed later is `clientId` → a set, plus deciding whether both contacts get
every notification or only one is billed. Flagged because it is a common family
shape and will eventually be asked for.

---

## Open

- **Coach code format and lifetime.** Length, character set (ambiguity-safe —
  no `0`/`O`, `1`/`l`), whether it expires. Unresolved; not blocking.
- **Whether a rejected `PENDING` student is deleted or retained** as a record.
  Retention interacts with §7's minors' data obligations.
- **How a coach account itself comes to exist.** Decision 2a assumes a coach signup
  flow in the coach app, but `architecture.md` never specifies one — §10 feature #1
  is "coach auth" with no account-creation story. Self-serve signup means anyone
  can create a coach account and start collecting children's data, which §7 makes a
  live question rather than a detail. **Deferred by the owner on 2026-07-29, and again on 2026-08-25.**
  Still blocks MVP feature #1, which is the first thing anyone would build. The reason
  it keeps returning: self-serve signup means anyone can create a coach account and
  begin collecting children's data, so this is a §7 question wearing a UI costume, and
  it cannot be settled by whoever happens to be building the signup form.

---

## Revisit if

- A coach asks to run two programs (e.g. hockey and figure skating) as separate
  rosters — that is the multi-coach relaxation in disguise.
- Clients report confusion at the `PENDING` wait, or coaches ignore the queue and
  it becomes a support burden. The confirmation step is the first thing to cut.
- A second client per student is requested — see Deferred above.
