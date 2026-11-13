# ADR-014: The Check-in App — Attendance Capture, Offline and On

## Status

**Accepted** — 2026-08-30. Supersedes the Phase-2 placement of the check-in app;
see ADR-001 amendment A3 for the monorepo consequence.

**Amended — 2026-09-30.** Decisions **9 and 9a** are superseded by **9b**: guardian contact
details are fetched only with signal and never cached on the phone.

**Amended — 2026-09-30.** Decision **2**'s age limit is replaced: a device timestamp is
accepted whenever it arrives, **provided it fits the lesson it belongs to** (decision 2a).
Queued entries are sent in the background where the browser allows it (decision 1a), and the
few the server rejects are listed on the phone rather than lost (decision 4a).

**Amended — 2026-10-01.** Decision **11a**'s second point — *"It cannot scope `api-checkin`
to one coach either"* — is reversed by [ADR-021](ADR-021-tenant-isolation-at-the-database.md):
`api-checkin` now assumes a `checkin-tenant` role per request, tagged with the coach, and
DynamoDB refuses any other partition. 11a's first point (no sort-key condition, so no
item-type separation) stands.

**Superseded in part — 2026-10-05** by [ADR-023](ADR-023-rinkside-check-in-joins-the-coach-website.md).
Decisions **10** (a separate Cognito app client) and **11** (a separate function,
`api-checkin`) are withdrawn, with the parts of **11a** about `api-checkin`'s role. Check-in
is a section of the coach website at `/coach/rinkside`, signs in through the website's app
client, and its routes run in `api-coach`. A recent sign-in guards schedule saves instead.
Every decision about working at the rink stands: 1, 1a, 2a, 3, 4, 4a, 5 (service worker now
scoped to `/coach/rinkside/`), 5a, 6, 7, 8 and 9b.

**Amended — 2026-10-13.** *Decided by the owner.* Since ADR-023's amendment of 2026-10-12 the
rinkside page runs in an ordinary browser tab, where Safari may remove the site's stored data
(the service worker's offline copy, the queue of decision 1 and the day cache) after 7 days of
Safari use without a visit. Offline capture stays (decisions 1, 1a and 5), and the gap is
guarded rather than designed around:

- Daily use keeps the storage fresh. Nothing new is stored to work around eviction.
- If the page opens with signal and finds its offline copy gone, it reloads the copy, so it
  works without signal again (what the coach is told: `FeatureDecriptions/C_Rinkside Offline.md`,
  "The offline copy was cleared").
- Queued entries are sent as soon as the page is open with signal (decision 1a; on an iPhone,
  the next time it is opened), so they do not sit on the phone for days.
- A cleared page cannot open with no signal at all. Decision 5a's advice to open the page with
  signal before leaving for the rink covers this case.

**Amended — 2026-10-13.** *Decided by the owner.* [ADR-031](ADR-031-lessons-and-seats.md)
replaces the booking with a **lesson time** (the coach's) and a **seat** for each skater in it.
Attendance is now captured **per seat**: `outcomeAt` and `recordedAt` live on the seat, and a
capture succeeds only from `BOOKED`, so first write still wins (ADR-031 decision 15). A cancelled
seat is moved to a `CANCELLED#` line in the same transaction that deletes it (decision 2), so a
replay onto it finds no seat and fails, exactly as before. ADR-009's coach-held booking is now a
**held lesson time** with no seats (decision 1). Every behaviour rule here still holds.

**Amended — 2026-11-11.** *Decided by the owner:* the end-of-day report is **Phase 2**. Decision 7
stands for when it ships. Its core rule applies in MVP without the report: a seat with no
recorded outcome is *Not recorded* on Payments and the lesson list, and "attendance not recorded"
in the weekly unpaid reminder (ADR-018), never a no-show. Until the report ships, nothing prompts
the coach each evening about an unrecorded lesson or a phone that hasn't sent its queue.

---

## Context

Check-in moved from Phase 2 into Minimum Viable Product (MVP) scope on 2026-08-30. It
is the only surface in BladeBook that is used **inside an ice rink** — a concrete
building, frequently with no usable cellular signal and no guest wireless network.

Every other surface may assume connectivity. The coach schedule editor, the client
booking flow and the payments view are all used somewhere a person is sitting down with
a working connection; if a request fails, retrying later costs nothing. Check-in is
different in two ways that matter:

1. **It is time-anchored.** A check-in means "this student was standing here at 4:15pm."
   Recorded an hour later, it is no longer the same fact.
2. **It fails in front of a person.** The coach is holding the phone with the student
   in front of them. "Try again later" is not an acceptable answer at that moment.

`CheckInRecorded` also drives the payment reminder (§6.3) and partitions the end-of-day
report into attended versus no-show (§6.4), so a check-in that never arrives is not
merely a missing record. *The end-of-day report is Phase 2 (2026-11-11).*

---

## Decision

### 1. Check-in captures locally when offline, and replays when signal returns

*Decided by the owner, 2026-08-30.*

When the device has no connectivity, the app:

- **tells the coach** that check-ins are queued on the phone, for as long as the queue is
  non-empty (product rule — see `FeatureDecriptions/C_Rinkside Offline.md`, "Recording with
  no signal");
- **stores the student and the time of check-in** in device storage;
- **replays the queue** when connectivity is restored.

### 2. The attendance time is captured on the device, not stamped by the server

The queued record carries the moment the coach tapped it. If the server stamped the
time on arrival, a lesson checked in at 4:15pm and replayed when the coach reaches home
would show the student arriving at 9pm — and the end-of-day report would count it in the
wrong bucket, or miss it entirely.

This means accepting a **client-supplied timestamp**, which is the first place in the
system that does so. Two guards:

- The ~~booking~~ stores **both** `outcomeAt` (from the device, when the coach recorded it)
  and `recordedAt` (server time on write). Every user-facing view reads `outcomeAt`; the
  pair makes a delayed replay visible rather than invisible.
- `outcomeAt` is **rejected if it is in the future** by more than a small clock-skew
  allowance, or older than 24 hours. A phone with a badly wrong clock should fail loudly.
  *The 24-hour limit is replaced by decision 2a (2026-09-30).*

*Replaced by ADR-031 decision 15 (2026-10-13): each skater's **seat** stores `outcomeAt` and
`recordedAt`. In a shared lesson each skater is recorded separately.*

### 2a. The time must fit the lesson, not be recent

*Decided by the owner, 2026-09-30.* The 24-hour limit guarded the wrong thing. It measured
when an entry was **sent**, not whether its time was **plausible**, so it rejected accurate
check-ins from a phone that had been offline for two days, while a phone with a wrong clock
that sent at once could still get a nonsense time through.

The server knows each lesson's date and time, so it checks against that. `outcomeAt` is
accepted whenever it arrives, provided:

- **it falls within the lesson's own window** — from one hour before the lesson starts to
  the end of that day, in the coach's timezone. A wrong clock produces a time outside the
  window and is rejected loudly, which is what the check exists for;
- **it is not in the future**, beyond a small clock-skew allowance (unchanged);
- **the ~~booking~~ seat is still unrecorded** (decision 3, unchanged; *seat since ADR-031,
  2026-10-13*). If the coach recorded it on
  the website in the meantime, the late entry is dropped silently (decision 8); if the
  family cancelled, the coach is told (decision 4).

A check-in sent a week late therefore lands correctly, and its payment reminder follows a
week late — correct, since the reminder should follow the check-in, and already accepted
under Consequences.

`outcomeAt` replaces the `checkedInAt` field the model carried before this ADR, because
decision 6 makes a no-show an equally recordable outcome that needs the same timestamp
treatment for the same reason.

### 3. Replay is idempotent, enforced by a conditional write

The queue survives a page reload, so the same entry can be submitted twice — a flaky
connection at the rink door is the ordinary case, not the edge case.

The attendance write is conditional on **the ~~booking~~ still being `BOOKED`**. *Replaced by
ADR-031 decision 15 (2026-10-13): conditional on **the skater's seat** still being `BOOKED`.* A replay of
an already-recorded outcome fails that condition, is treated as success by the client, and
is dropped from the queue.

Conditioning on the status rather than on `attribute_not_exists(outcomeAt)` covers both
outcomes with one expression, and it also catches decision 4's case. Note the two shapes
that takes, because they are not the same write:

- **The booking was deleted.** ADR-009 decision 5 deletes the item on cancellation — there
  is no `CANCELLED` status — and the record survives as a separate `CANCELLED#` item.
  *Replaced by ADR-031 decision 2 (2026-10-13): the **seat** is moved to a `CANCELLED#` line in
  one transaction with its delete. A replay finds no seat at its key and fails the same way.* A
  conditional `UpdateItem` whose condition reads `bookingStatus` fails against a non-existent
  item rather than upserting one, which is the behaviour needed here: a replay must never
  resurrect a cancelled booking as a bare attendance record.
- ~~**The booking became `COACH_HELD`.** Cancel-and-hold replaces the item at the same key
  (ADR-009 decision 5), so it exists with a status that is not `BOOKED` and the same
  condition rejects it.~~ *Replaced by ADR-031 decision 1 (2026-10-13): cancel-and-hold moves
  every seat to a `CANCELLED#` line and marks the **lesson time** `HELD`, with no seats. The
  replay finds no seat and fails, as in the case above.* This matters because the write is what emits `CheckInRecorded`
through the stream: without the condition, a duplicate replay sends the family a second
payment reminder for the same lesson.

This is the same shape as ADR-010's idempotency guards, with the ~~booking item~~ itself
acting as the guard rather than a separate record — consistent with ADR-006, where the
~~booking item is already the lock~~. *Replaced by ADR-031 decisions 1 and 2 (2026-10-13): the
**seat** is the guard, and the **lesson time** is the lock.*

Only `CHECKED_IN` emits `CheckInRecorded`. A recorded `NO_SHOW` emits its own event —
**amended 2026-08-30 by ADR-015 decision 5**, which made a no-show billable; it originally
emitted nothing, pending exactly that question. The two are separate events because the
reminder wording differs, and a missed lesson is not an attended one.

### 4. A replay that no longer makes sense surfaces to the coach

A queued outcome can arrive to find the booking gone. **The likely author of that is the
client, not the coach.** A parent cancels at 3:50pm for a 4:00pm lesson; the coach is
inside the rink with no signal and never sees the notification; nobody appears, so at 4:15
the coach marks absent. That no-show replays onto a booking that no longer exists. The
coach on another device (ADR-009) and the schedule-change consumer (§6.5) can both produce
it too, but the client path is the one that will actually happen.

This is not a narrow race. A queued entry can sit overnight or longer — decision 2a
accepts it whenever it arrives — and the longer it sits, the more ordinary this becomes.

These are not silently dropped and not silently retried forever. The entry stays in the
queue, marked failed, and the coach is shown what did not go through and why.

**The client-cancellation case is its own reason, not a failure** (product rule — see
`FeatureDecriptions/C_Rinkside Offline.md`, "The family had cancelled"). The replay result
tells it apart from other failures, and the entry is then cleared rather than left for the
coach to resolve. There is nothing to reconcile: the outcome is already known and it is not a
no-show.

A replay that fails for any other reason keeps the blunter treatment: it stays visible and
stays queued. Attendance is a record of something that physically happened, and the system
does not get to discard it merely because it cannot reconcile it.

### 4a. Entries the server rejects are listed on the phone

*Added 2026-09-30.* Under decision 2a the only entry the server refuses outright is one whose
time does not fit its lesson — a wrong clock. It cannot be sent, and it exists only on the
phone, so it is kept in device storage and listed to the coach rather than dropped (what the
list shows and its actions: product rule — see `FeatureDecriptions/C_Rinkside Offline.md`,
"Couldn't be sent").
The list holds student names on a device used at public rinks, so **an entry is deleted from
the phone when the coach removes it, or after 7 days, whichever comes first** (*decided by
the owner, 2026-09-30*).

*Note, 2026-09-30:* only attendance is queued. **Cancelling is disabled offline** — see
[ADR-009](ADR-009-cancellation.md) decision 5a — because a queued cancellation would reach
the family only after the phone reconnected.

### 1a. Queued entries are sent in the background where the browser allows it

*Decided by the owner, 2026-09-30.* On Android and in Chrome, the app registers for
**Background Sync**, so queued check-ins are sent when signal returns even if the app is
closed. iPhones do not support it; there, queued entries are sent the next time the app is
opened. The banner of decision 1 stays until the queue is empty either way.

### 5. The app must load with no connectivity

The decisions above are worth nothing if the app itself will not open at the rink.
Queuing writes is the easy half; the hard half is that a coach navigating to the check-in
page on a dead connection must get an application rather than a browser error.

`web/`'s check-in bundle therefore registers a **service worker** that caches the
application shell, and the app renders the day's bookings from a local cache when the
network is unavailable. That day's bookings are fetched and cached whenever the app is
opened with connectivity.

This is the first service worker in the project and applies to the check-in bundle only.
The coach and client bundles do not get one; nothing about them needs offline loading,
and a service worker introduces a cache-invalidation problem that is not worth taking on
for surfaces that do not benefit.

### 5a. If today's lessons have not loaded, the app says so

*Decided by the owner, 2026-09-30.* If the app opens and today's lessons are not in its
cache — the coach has not opened it with signal today and has no signal now — it shows a
not-loaded message rather than an empty list, which would look like a day with no lessons
(wording: `FeatureDecriptions/C_Rinkside Offline.md`, "Today's lessons haven't loaded").

### 6. The coach records a no-show explicitly

*Decided by the owner, 2026-08-30.*

The app offers **two outcomes per booking — present or absent** — rather than check-in
alone. `NO_SHOW` already existed as a booking status and as a glossary entry describing it
as coach-marked; before this decision nothing in the product could actually mark it.

An affirmative no-show is what makes decision 7 possible. As long as no-show was inferred
from a booking still sitting at `BOOKED`, it was indistinguishable from a check-in queued
on a phone with no signal — and from a coach who simply forgot. Recording it turns one
ambiguous state into two known ones plus an honest unknown.

*What a no-show costs is a business rule (settled by ADR-015 decision 5). The paragraph on it
moved to `FeatureDecriptions/Coach App` ("Present and No-show") on 2026-11-08 — product
content, not an architecture decision.*

### 7. The end-of-day report defaults to `PENDING`, not to no-show

*Decided by the owner, 2026-08-30.*

The 9:00pm report partitions the day three ways — **checked in**, **no-show**, **pending**
— and a booking with no recorded outcome lands in `PENDING`.

The previous behaviour partitioned `CHECKED_IN` against everything else and called the
remainder no-shows. With offline capture that is no longer defensible: a booking still at
`BOOKED` at 9pm can mean the coach forgot, the coach's phone has not reconnected, or the
student never came. Reporting the unknown case as a no-show converts "my phone never
reconnected" into "your student did not show up" — an assertion about a family, generated
from missing data, and one that a coach may act on.

**`PENDING` is a report bucket derived from ~~`bookingStatus`~~ `seatStatus` (*ADR-031, 2026-10-13*), not a stored booking state.** Nothing
is written to any booking at 9pm; the absence of a recorded outcome *is* the pending state,
and a queued outcome that replays later simply leaves the bucket. Adding a real status
would mean a write across every unrecorded booking each night to record something already
knowable from what is there.

**The report names the pending students.** *Added 2026-09-30.* So the report job reads
each pending seat's student and lesson, not only a count (what the email says: product
content — see `FeatureDecriptions/Email templates Needed:`, "Daily report").

**The report stays a snapshot.** It states what the server knew at 9:00pm and is not
regenerated when a late replay lands. This is what gives the coach the signal the owner
asked for: a pending count that stays high, night after night, means a phone is not
syncing — which is exactly the failure that would otherwise be silent.

### 8. Capture and correction are different operations

*Settled by the owner, 2026-08-30.* Attendance can be **captured** from the check-in app
rinkside, and **corrected** from the coach lesson list on the website dashboard. These look
like the same write and must not be implemented as one.

- **Capture** is guarded by decision 3: the booking must still be `BOOKED`. First write
  wins, and a replay of something already recorded is dropped.
- **Correction** deliberately overwrites an outcome that is already there. It cannot carry
  decision 3's condition, because that condition exists precisely to reject it.

**The ordering hazard is real, and decision 3 already resolves it correctly.** A coach marks
a student absent at the rink with no signal; drives home; sees the mistake and corrects it to
attended on the dashboard; *then* the phone reconnects and replays the queued no-show. The
replay finds a booking that is no longer `BOOKED`, fails the condition, and is dropped as
already-recorded — so **the correction wins over the stale replay**, which is the right
outcome. The coach's later, deliberate action beats their earlier one made without
information.

This is also why the replay is dropped **silently** rather than surfaced under decision 4.
The queued value disagreeing with the stored one is the normal signature of a correction,
not an error, and telling the coach their correction "failed to sync" would invite them to
undo it.

**Correction is website-only** (product rule — see `FeatureDecriptions/Coach lesson list`,
"Why corrections are on the website"), so the rinkside routes carry only the conditional
capture write, never the overwrite.

### 9. Guardian contact details are cached for the day, revealed by a tap

*Superseded 2026-09-30 by decision 9b: contact details are no longer cached.*

*Decided by the owner, 2026-09-22.* `Coach App` requires the client's contact information at
check-in, which is right: a coach rinkside with a child whose ride has not arrived needs the
guardian's number at exactly the moment they cannot go looking for it.

Contact details for students with bookings **today** are cached alongside the day's
bookings, **not rendered in the roster list** — a tap on a student reveals them — and
**purged when the day rolls over and on sign-out**.

Fetching on demand instead was rejected: a dead connection is the ordinary rinkside
condition, so an on-demand fetch would remove the feature precisely when it is needed.

**Be clear about what the tap does and does not do.** The bytes are on the device either
way; the tap governs *display*, not *presence*. What it buys is a bounded exposure window
(one day rather than indefinite), and a deliberate user action that ADR-012 can log — as
opposed to "the screen rendered." Anyone holding the unlocked device can still tap. The
protections that act on the data at rest are the rollover purge and the sign-out purge,
and neither is a substitute for device-level security.

### 9a. An offline reveal produces a PII read that cannot be logged when it happens

*Superseded 2026-09-30 by decision 9b: there are no offline reveals.*

ADR-012 requires that every read of personally identifiable information (PII) be recorded.
A reveal at a rink with no signal is a real read that cannot reach a log group.

**The reveal is queued and replayed on the same path as an attendance outcome** (decision
1). The queue gains a second record type; the mechanism is already built. As with
attendance, the entry carries a **device timestamp** for when the reveal happened and picks
up a server timestamp when it lands, so a late arrival is visible as late rather than
appearing to have happened on reconnection.

Two limits, stated rather than hidden:

- **A lost device loses those log entries.** Reveals that happened offline and never
  replayed are reads that ADR-012's log will never show. The log has a known blind spot
  whose size is "one device, one day."
- The queued reveal is an access record, not consent. It does not make the read retroactively
  authorised; it makes it *visible*, which is all ADR-012 ever claimed to do.

### 9b. Contact details are fetched only with signal, and never cached — supersedes 9 and 9a

*Decided by the owner, 2026-09-30.* Decisions 9 and 9a are replaced.

- **The phone caches today's lessons only** — decision 5's cache, which holds student names
  and lesson times, **no contact details**.
- **A guardian's contact details are fetched when the coach taps a student**, from
  `api-checkin`, and shown for that tap only. Nothing is written to the phone.
- **With no signal, the tap fails** and tells the coach a connection is needed (wording:
  `FeatureDecriptions/Coach App` and `C_Rinkside Offline.md`).
- **Every reveal is logged when it happens**, through ADR-012's normal path. There are no
  queued reveals, so decision 9a's blind spot — reads that reach the access log late, or never
  if the phone is lost — no longer exists.

**Why the cache bought little.** *The owner's reasoning:* decision 9 cached contacts for the
coach standing with a child whose ride has not arrived, at a rink with no signal — but with
no signal to fetch the number, there is no signal to call it either. A cached number the coach
cannot dial does not help that child. Dropping the cache therefore costs little, and in
exchange the phone at the rink holds no guardian contact details at all, and every read of
them is visible server-side the moment it happens.

*One edge, noted rather than designed for:* a weak signal can sometimes carry a call or a text
when it cannot load data, so in marginal coverage a cached number could have been dialled.
Not enough to keep children's contact details on a phone at a public rink.

### 10. The check-in app gets its own Cognito app client

*Decided by the owner, 2026-09-22.* This settles the **token** half of this ADR's open
question. The check-in app authenticates through a **separate Cognito app client**, and
`api-coach`'s authorizer refuses tokens issued by it for anything outside the scope below.

**This is not a second account.** A Cognito *user pool* holds the accounts; an *app client*
is an application registered to authenticate against it, and several app clients share one
directory. The coach signs into the check-in app with the same email and password as the
website — one identity, one password reset, one profile. What differs is which client issued
the token, which the JWT carries, so `api-coach`'s authorizer can accept web-client tokens
and refuse check-in ones. `Coach App` already requires a sign-in screen, so nothing new is
being asked of the coach.

*Note, 2026-09-30:* this relied on the HTTP API's JWT authorizer, which can check which app
client issued a token. API Gateway is now a REST API ([ADR-019](ADR-019-waf-in-mvp.md),
ADR-001 amendment A7), whose Cognito authorizer cannot. The rule in this decision stands; how
it is enforced is ADR-019's open item, where a small Lambda authorizer is recommended.

A second benefit falls out: **token lifetimes are per app client.** The check-in app — the
device most likely to be lost or left signed in at a rink — can carry a much shorter refresh
window than the website. That tuning is impossible while both share one client.

This is the half that addresses the actual exposure. A phone that lives in a coach's pocket
at a public rink, is handed around, and is the app a coach is least likely to sign out of,
currently holds a token accepted on *every* coach route. A separate execution role does not
change that — an attacker with the token calls `api-coach` directly. A distinct app client
does.

**In scope for a check-in token:** list today's bookings; reveal one student's contact
details; record attendance; cancel a lesson, a day or a week, release-or-hold (ADR-009
decision 5, and `Coach App` requires all of it).

**Out of scope:** the schedule editor, the student roster and `PENDING` approvals, every
payment action, and the coach profile.

**"Narrow" here does not mean "two actions", and it does not mean "today".** `Coach App`
requires cancellation at week scope, so the token reaches beyond the current date, and an
earlier framing of this question — which assumed check-in only lists and marks attendance —
overstated how narrow the scope could be. What the exclusions genuinely remove is the two
most dangerous surfaces: the **schedule editor**, where one save can cancel a year of
lessons through §6.5, and the **roster**, which holds every student's full record. Keeping
both off a rinkside token is real reduction even though the remaining scope is not small.

### 11. Check-in runs in its own Lambda, `api-checkin`

*Decided by the owner, 2026-09-22.* A third API function beside `api-coach` and
`api-client`, with its own execution role. This closes the remaining half of this ADR's
open question.

**The reason is consistency, not novelty.** Decision 10 already requires `api-coach` to
refuse check-in tokens. That leaves two shapes: two functions each serving one audience, or
one function serving both and branching on `client_id` inside a controller. The second makes
application code enforce a boundary the infrastructure can enforce — and this project has
twice chosen the opposite, with ADR-001's framework-free `core/` held by an ArchUnit rule
and ADR-012 decision 5a making personally identifiable information (PII) access
compiler-required rather than reviewed. A structural boundary is the house style.

It is also free now and not later. `api-checkin/` is a Maven module and a `pom.xml`;
ADR-001's `core/` stays untouched because controllers are thin by mandate. Extracting it
from a working codebase once the app ships means re-testing and a deployment cutover.

**The role:**

| Allowed | Denied by omission |
|---|---|
| `Query` on the **main table** — today's bookings | **All three GSIs** |
| `GetItem` on one student, for the decision 9 contact reveal | `ses:SendEmail`, `sns:Publish`, `s3:PutObject` |
| Conditional `UpdateItem` on a booking — attendance | |
| `PutItem`, `DeleteItem`, `TransactWriteItems` — cancellation (ADR-009 decision 5a) | |

**Excluding GSI2 is the substantial win.** GSI2 is keyed `DATE#<date>` globally and is the
one index that crosses tenants — a defect in check-in code holding it could read *every
coach's* bookings. Index ARNs are separate resources, so omitting them is enforceable.
GSI1 and GSI3 go too; check-in needs neither.

### 11a. What the role cannot do, stated so nobody assumes otherwise

Two things, and the second is easy to state wrongly.

**It cannot stop `api-checkin` writing a schedule item.** DynamoDB fine-grained access
control conditions on the **partition key** (`dynamodb:LeadingKeys`), on attributes, on
`Select` and on `ReturnValues` — **there is no sort-key condition.** In a single-table
design every item shares one table ARN and the eight item types are distinguished only by
sort-key prefix, so a role holding `PutItem` for `CANCELLED#` lines holds it for
`SCHEDULE#DATE#` items too. They are indistinguishable to a policy.

This is the cost side of ADR-004's single-table choice, and it is worth naming: the property
that lets one query return heterogeneous items from one partition is the same property that
makes the partition opaque to IAM. A multi-table design would separate these trivially, by
having three ARNs.

*Reversed 2026-10-01 by [ADR-021](ADR-021-tenant-isolation-at-the-database.md), which takes
the per-request `AssumeRole` route described in this paragraph.*

**It cannot scope `api-checkin` to one coach either.** `dynamodb:LeadingKeys` looks like the
answer and is not: a Lambda execution role is static and serves every coach, and the
condition compares against the *caller's* credentials — which here are the function's, not
the coach's. Binding per request would need an `AssumeRole` with session tags on every
invocation. **Tenant isolation is therefore code-enforced**, exactly as §7 describes it —
`coachId` comes from the verified JWT claim and every key is built from it — and it is held
by ADR-012's compiler-required `AccessContext` and ADR-013's cross-tenant test, not by a
policy document.

This matters because the schedule editor is the most destructive surface in the system: one
save cascades through §6.5 and can cancel a year of lessons. **That containment comes from
decision 10's token scope and from routing, not from the role.** An earlier framing of this
question implied a role could prevent it. It cannot.

What the role genuinely contains: **which actions** a function may call, **which indexes**
it may read — index ARNs are separate resources, which is how GSI2 is blocked and why that
exclusion is the substantial one — and **which services** it may reach. Item-type and tenant
boundaries come from routing, token scope and code. That is worth having and it is not the
whole story.

---

## Consequences

- **Check-in is the only write in the system that is not immediately durable.** Between
  the tap and the replay, the record exists in exactly one place: a phone, at a rink. A
  lost or wiped device loses those check-ins with no server-side trace that they ever
  existed. This is accepted — the alternative is failing in front of the student — but it
  is a real reduction in the durability guarantee that holds everywhere else.
- **The end-of-day report reports an unknown as unknown.** Decision 7 means a phone still
  holding queued outcomes at 9pm produces a report with a pending count, not a report that
  lists attended students as no-shows. The report is still a snapshot of what the server
  knew at 9pm and is stale rather than corrected after a replay — but it is now stale in a
  way that is visible and interpretable instead of stale in a way that reads as fact.
- *A consequence about what a no-show costs before Phase 2 moved to `FeatureDecriptions/Coach App`
  ("Present and No-show") on 2026-11-08 — product content, not an architecture decision.*
- **Payment reminders are delayed by exactly the offline period**, since they are driven
  by `CheckInRecorded`. This is the correct behaviour — a reminder should not go out for a
  lesson the server has no record of — but it means a rink with no signal delays every
  reminder for that session.
- **`web/` gains a build target with genuinely different constraints.** Three bundles from
  one source tree (A3), one of which has a service worker, an offline cache and a replay
  queue. It is the smallest surface by feature count and not the smallest by difficulty.
- **ADR-013 applies.** The replay queue is logic that lives only in `web/`, so it is tested
  there: queue survives reload, duplicate replay is dropped, failed replay stays visible,
  timestamp guard rejects a future time, and both outcomes queue and replay identically.
  The report's three-way partition is `backend/` logic and is tested there, including the
  case that motivated it — a booking with no recorded outcome must not land in no-show.

---

## Open

- ~~Does check-in get its own Cognito app client?~~ **Settled 2026-09-22: yes** — decision
  10. What remains open is the **API function** half below.
- ~~Does check-in get its own API function, with its own execution role?~~ **Settled
  2026-09-22: yes** — decisions 11 and 11a. Note 11a's limit: the role bounds cross-tenant
  reads and outbound reach, not schedule writes. ADR-001 decision 1 split the API on the trust boundary, and check-in is a coach
  action, so it falls to `api-coach` by default. Two separable questions sit underneath:
  whether the check-in *code* should run in a Lambda whose execution role can do only two
  things, and whether the check-in *token* should be one that `api-coach` refuses. The
  second is the one that addresses a phone left logged in at a public rink; a separate
  Lambda alone does not achieve it. Recorded as an open thread in `architecture.md` §11.
- ~~How long a queued check-in may sit before it is escalated.~~ **Settled 2026-09-30:** it
  no longer expires (decision 2a). It is sent in the background on Android and Chrome, or
  when the app next opens on an iPhone (decision 1a), and the lesson shows as *pending* in
  the end-of-day report *(Phase 2 since 2026-11-11; in MVP it shows as Not recorded on Payments and the lesson list)* until it arrives.
- ~~How long rejected entries stay on the phone.~~ **Settled 2026-09-30:** until Done, or 7
  days — decision 4a.
- ~~An evening push to coaches with unrecorded lessons.~~ **Declined by the owner,
  2026-09-30.** *Product question; moved to `FeatureDecriptions/Email templates Needed:`
  ("Not emails, or decided against") on 2026-11-08.*
- ~~Whether the coach can correct or undo a recorded outcome.~~ **Settled by the owner,
  2026-08-30: yes, on the website only** — see decision 8. *Product detail moved to
  `FeatureDecriptions/Coach lesson list` ("Why corrections are on the website") on 2026-11-08.*
- ~~What a recorded `NO_SHOW` costs.~~ **Settled 2026-08-30 (ADR-015):** it is charged,
  under the same rule as a late cancellation. This raises the stakes on the item above —
  a mis-tap on a phone held rinkside now bills a family — and makes decision 7's `PENDING`
  bucket financially load-bearing, since an outcome stuck on an unsynced phone is an
  uncollected charge rather than merely an unrecorded fact.

---

## Revisit if

- A coach reports check-ins lost with a phone. That converts the accepted durability gap
  into a demonstrated one, and the answer is likely an explicit "sync now" affordance plus
  a visible queue count rather than a passive banner.
- The end-of-day report's staleness after a replay produces a real complaint — the fix is
  to regenerate it on late arrival, which is a scheduled-job change rather than an app one.
- Pending counts are routinely non-zero for reasons other than connectivity — that would
  mean coaches are not recording outcomes at all, and the signal decision 7 was built to
  give becomes noise.
- A second surface needs offline capability. Decision 5 deliberately scopes the service
  worker to one bundle; a second case is the trigger to factor it out rather than copy it.
