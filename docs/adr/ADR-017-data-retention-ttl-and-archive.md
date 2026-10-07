# ADR-017: Data Retention — Time to Live, an Archive, and Deep Storage

## Status

**Accepted** — 2026-09-30. **The mechanism is decided; most retention windows are not.**
The windows for records about people wait on the pre-launch legal review `architecture.md`
§7 already requires. This ADR decides how expiry, archiving and deep storage work, so that
each window, once set, is a configuration value rather than a redesign.

Adds `expiresAt` to the single table, a tenth Lambda function (`consumer-ttl-archiver`) and
an archive bucket. Constrains ADR-006 decision 4b's header repair, and extends ADR-010
decision 5f's Pipe filter.

**Amended — 2026-10-07.** [ADR-027](ADR-027-on-demand-dev-environment.md): decision 7's mirror is the on-demand **dev** stack. Time to
Live (TTL) deletes items typically within a few days, so exercising the archiver end to end
means keeping dev up that long.

---

## Context

A recurring pattern across the ADRs is that things are marked rather than removed. Recurrence
headers are never deleted (ADR-006 decision 4b), temporary-schedule headers and date overrides
outlive their dates, settled bookings stay forever, and cancellation records accumulate with
every cancellation (ADR-006 and ADR-009 Open). Each of those was the right call for
correctness. Together they mean the table only grows.

**The cost of growth is not the reason to act.** At this scale storage is cents for years,
and §12 already notes that booking volume is no longer trivially bounded. The reason is §7:
*data minimisation* for a system that holds children's data. Keeping a family's lesson
history indefinitely, in the live table the application reads from, is a retention decision
made by default.

DynamoDB's equivalent of an S3 lifecycle rule is **Time to Live (TTL)**, and it works
differently enough to shape the design:

- **Expiry is per item, not per rule.** The table names one attribute; each item carries its
  own expiry timestamp in it, and items without one never expire. A policy change does not
  touch existing items — they keep the date they were given unless a one-off job rewrites
  them. So the attribute has to be designed in before data exists, which is now.
- **Deletion is free and approximate.** TTL deletes cost no write capacity and remove the item
  from every index, but typically happen **within a few days** of expiry, not at the moment.
  Until then an expired item is still returned by reads.
- **Every TTL deletion appears on the table's stream** as a removal made by the DynamoDB
  service — which is both a hazard (the stream drives every notification) and the hook this
  ADR uses to archive what expires.

---

## Decision

### 1. The table expires items through one attribute, `expiresAt`

*Decided by the owner, 2026-09-30.* TTL is enabled on the main table with the attribute
**`expiresAt`** — a Number holding seconds since 1970. An item without it never expires.

- `expiresAt` is written by the code path that creates or changes the item, from a
  **per-item-type window held in configuration**, not hard-coded. A window with no value yet
  means that item type gets no `expiresAt`, so it is kept.
- **Changing a window does not re-date existing items.** When a window is first set or later
  changed, a one-off backfill job rewrites `expiresAt` on the affected items. This is the
  price of per-item expiry and is accepted.
- **Code that must be exact filters on `expiresAt`.** Because deletion lags expiry by days, a
  read that must not return expired data — a history view, an export — adds
  `expiresAt > now` or treats a missing value as never-expiring.

### 2. What expires, and when

| Item | `expiresAt` set when | Window | Needs legal review? |
|---|---|---|---|
| Date override `SCHEDULE#DATE#<date>` | Written | Its date + **30 days** (proposed) | No — schedule data, no person |
| Temporary schedule header `SCHEDULE#TEMP#` | Written or edited | Its `endDate` + the date-override window | No |
| Held slot (`COACH_HELD` booking) | Written | Its date + the date-override window | No — no student |
| Booking, `PAID` or `WAIVED` | **When settled** | Settlement + booking window | **Yes** |
| Booking, `UNPAID` | **Never, while unpaid** | — | — |
| Cancellation line `CANCELLED#` — not chargeable | Written | Cancellation + cancellation window | **Yes** — and tax (ADR-006, ADR-009 Open) |
| Re-price line `REPRICED#` (ADR-020) | Written | Same window as cancellation lines — proposed; they name students too | **Yes** |
| Cancellation line — chargeable (ADR-015 decision 1a) | **When settled** | Settlement + cancellation window | **Yes** |
| Cancellation batch header `CHANGEBATCH#` | With its lines | Never earlier than its latest line — see decision 3 | Derived |
| Recurrence header `RECURRENCE#` | Written, and when its end date moves | Its `endDate` + booking window | Derived |
| Rejected `PENDING` student | — | **Not retained: deleted immediately on rejection** (ADR-002 decision 2b, 2026-09-30) | — |
| Coach, client and student profiles, links, `CODE#`, default schedule | **Never** | Account lifecycle and erasure on request — not TTL | — |

**An unpaid lesson never expires.** Expiry is set on settlement, so a debt cannot quietly
vanish from the coach's dashboard. A consequence worth knowing: a lesson that is never
checked in, never marked a no-show and never marked paid or waived stays forever. The coach
lesson list (ADR-014 decision 8) and the waive action (ADR-003) are how a coach clears it,
and [ADR-018](ADR-018-unpaid-lesson-reminder-to-coach.md)'s weekly reminder tells them when
one has been left too long.

**Accounts are not on TTL.** A coach, client or student record ends when an account is
closed or a family asks for their data to be deleted — an explicit delete, and a separate
design (`design/deletion/`). TTL's "within a few days" is not an acceptable answer to an
erasure request.

### 3. Parent records never expire before their children

Two item types summarise others, and a summary that vanishes first misleads:

- **A cancellation batch header** is raised to at least the latest `expiresAt` of its lines,
  whenever a line's expiry is set — including a chargeable line that settles months later.
  The update only ever raises the value.
- **A recurrence header** expires at its `endDate` plus the booking window. Its lessons may
  settle later and outlive it. That is made safe by constraining ADR-006 decision 4b's
  repair: **a header is only ever rebuilt for an arrangement with at least one upcoming
  lesson.** An expired header's arrangement ended a full booking window ago, so repair never
  sees it — and without that guard, a lesson outliving its header would trigger a rebuild
  from `bookedIntervalWeeks`, the stale interval the header exists to replace.

### 4. Every expired item is copied to an archive before it is gone

*Decided by the owner, 2026-09-30.*

A new function, **`consumer-ttl-archiver`**, reads the table's stream and writes each item
TTL removes to an archive bucket.

- **It is a second reader on the stream**, separate from the EventBridge Pipe that drives
  notifications (ADR-010 decision 6). DynamoDB supports two readers per stream without
  contention, and keeping them separate means a failure in archiving cannot stall
  notifications, or the reverse.
- **Its trigger filter matches only TTL removals**: a `REMOVE` event whose identity is the
  DynamoDB service itself. Deletes made by the application — a cancelled booking, a
  schedule-change conflict — are not archived; they already leave a `CANCELLED#` record.
- **The item comes from the stream record's old image**, the item as it was before
  deletion. The stream therefore carries both old and new images — which ADR-010 decision
  5f's filter already needs.
- **The object key is derived from the item's key**, so a redelivered event rewrites the
  same object rather than creating a second. The archiver is idempotent by construction,
  meeting ADR-010 decision 2.

**The notification Pipe explicitly drops TTL removals.** Nothing reacts to removals today —
ADR-010 decision 5e made cancellation notices come from writing the cancellation record, not
from the booking delete. The filter makes that permanent rather than incidental, so a future
consumer written to watch deletes cannot mistake a year-old lesson expiring for a
cancellation.

**Stream records live for 24 hours.** If the archiver fails for longer, removals scroll off
the stream unarchived. The same stream-age alarm ADR-010 decision 6 uses for the Pipe covers
the archiver's reader. Point-in-Time Recovery (PITR) is the backstop: for 35 days an expired
item can still be recovered from a restore.

**Its role** (ADR-001 amendment A6's format): read the table's stream; `s3:PutObject` and
`s3:PutObjectTagging` on the archive bucket. **No table access at all** — everything it needs
is in the stream record.

### 5. The archive layout supports erasure

```
s3://bladebook-archive/coach=<coachId>/student=<studentId|none>/type=<itemType>/<yyyy-mm-dd>/<itemKeyHash>.json
```

**One object per item**, keyed by coach and student. Two reasons, both about the day a family
asks for their data to be deleted:

- **An erasure request must reach the archive too.** An archive of children's data is still
  children's data. With the student in the key, "everything archived about this student" is
  a prefix listing.
- **Deleting one object in deep storage is immediate**, with no restore. Bundling many items
  per object would make erasing one item a restore, a rewrite and a re-upload.

**The bucket has versioning off.** On a versioned bucket a delete only hides the object
behind a marker, and an erasure that leaves the data in place is not an erasure. Accidental
overwrites are not a risk here, because every key is unique to one item. The rest follows
the reports bucket: private, Block Public Access on, SSE-KMS, TLS-only, CloudTrail data
events (ADR-012 decision 5).

### 6. A lifecycle rule moves the archive to deep storage

*Decided by the owner, 2026-09-30.*

| Rule | Value |
|---|---|
| Transition to **S3 Glacier Deep Archive** | **30 days** after the object is written (proposed) |
| **Object size filter** | **Explicitly includes small objects** — see below |
| Expiration | After the archive retention window — **set by the legal review** |

**The 30 days in the ordinary storage class** give a window in which an archiver bug can be
found and the objects read cheaply and instantly. After that, deep storage.

**S3 does not, by default, transition objects smaller than 128 KB.** An archived item is
typically one or two kilobytes, so a default lifecycle rule would silently leave the whole
archive in ordinary storage. The rule must set an explicit minimum object size below that.

**What deep storage buys here is friction, not money.** At this volume the archive costs
cents either way — and Deep Archive bills every object as at least about 40 KB, so for items
this small it is not cheaper than ordinary storage. Its value is that **archived data cannot
be read casually**: a retrieval is a deliberate restore that takes up to 12 hours and leaves
a record. For children's data that nobody should need, that is the right default.

**Consequences of Deep Archive's terms:**

- **Retrieval is a restore, taking up to 12 hours** (or up to 48 for the bulk tier). This fits
  what the archive is for — a tax question, a dispute — and rules out using it from the
  application. Athena cannot query objects in Deep Archive until they are restored.
- **Objects are billed for at least 180 days.** An object deleted sooner — by an erasure
  request — incurs a small early-deletion charge. Negligible here; worth knowing.
- **The archive retention window should be at least 210 days** (30 before transition plus
  the 180-day minimum), or objects are billed for time they were not kept.

### 7. Staging mirrors this

*Amended 2026-10-07 by [ADR-027](ADR-027-on-demand-dev-environment.md): read "staging" as dev, while it exists.*

Staging runs the same TTL, archiver and lifecycle, so the pipeline is exercised before it
runs against production. `expiresAt` is structure and is copied unchanged by the refresh
(ADR-011 decision 6); an item already past its expiry in the export is simply deleted — and
archived — shortly after import.

**Staging's archive bucket is in ADR-011 decision 6b's scanner scope.** It holds masked data
by construction, and the scanner is what confirms it.

---

## Consequences

- **Retention becomes configuration.** Once the legal review sets a window, it is a value and
  a one-off backfill, not a change to how items are written.
- **Every write path that creates or settles an item has one more field to set.** Most are
  mechanical; the settlement paths (mark paid, mark waived, chargeable cancellation lines)
  and the extend-only batch-header update are the ones to test (ADR-013).
- **A tenth function and a second stream reader.** Small, framework-free, and the only
  consumer with no table access.
- **An erasure design now has three places to reach**: the table, the archive, and PITR's
  35-day window. The last cannot be selectively erased; it ages out.
- **The live table stops holding history indefinitely** — the point of the decision.

---

## Open

- **Every window marked "needs legal review" in decision 2**, plus the archive's own
  retention window. These go on the pre-launch legal review's agenda.
- **The date-override window** — 30 days is proposed; confirm. It needs no legal input.
  *Deferred by the owner, 2026-09-30.* Raised with it: as written, each date record of a named
  temp expires counted from its own date, so a camp's first days vanish before its last. The
  alternative is to expire a temp's header and all its date records together, about 13 months
  after its end date — which would let a coach reopen last year's camp and move its dates
  (ADR-008 decision 7a), the nearest MVP equivalent of Phase 2's saved schedules.
- ~~Unrecorded, unpaid lessons never expire.~~ **Settled 2026-09-30:** the coach is always
  expected to settle them; nothing is treated as abandoned. A weekly job emails the coach
  once a lesson has been unpaid past a threshold — see
  [ADR-018](ADR-018-unpaid-lesson-reminder-to-coach.md).
- **Does the coach see anything when their history ages out?** A coach who looks for a
  two-year-old lesson finds nothing, and nothing says why.
- **Should archive retrievals be logged as personally identifiable information (PII)
  reads** under ADR-012? A restore is an AWS operation, visible in CloudTrail; whether it
  also belongs in the access log is unstated.

---

## Revisit if

- **Volume grows to the point where per-item objects cost real money** in Deep Archive's
  per-object minimum. Bundling items per coach per day becomes worth its cost to erasure.
- **A coach needs archived records routinely** — for example, tax records every year. Deep
  Archive's 12-hour restore is wrong for routine access; ordinary storage or Glacier Flexible
  Retrieval would fit.
- **The legal review sets a window shorter than 210 days** for anything archived, which makes
  the transition to deep storage pointless for that type.
