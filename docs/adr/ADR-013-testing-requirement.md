# ADR-013: Every Feature Requires Unit Tests

## Status

**Accepted** — 2026-08-30. **Enforcement deferred.**

**Amended — 2026-10-01.** Decision 4's list gains the database-level tenant gate and the
link consumer ([ADR-021](ADR-021-tenant-isolation-at-the-database.md)).
The same day, [ADR-022](ADR-022-client-isolation-at-the-database.md) adds the client-side
database gate, the client read allowlist, and a change to the retry-attribution test.

Tooling was already chosen in ADR-001 decision 3: JUnit with DynamoDB Local for `backend/`,
Jest with Cloud Development Kit (CDK) `assertions` for `infra/`. This ADR sets the policy,
not the stack.

**Amended — 2026-10-05.** [ADR-023](ADR-023-rinkside-check-in-joins-the-coach-website.md)
withdraws `api-checkin`, so decision 4's tenant-gate row covers `api-coach` only, and adds one
test: a schedule save with a token whose `auth_time` is older than the window is refused.

**Amended — 2026-10-05.** [ADR-024](ADR-024-client-write-link-check.md) adds four tests to decision 4: `requireActive`'s outcomes,
the ownership condition refusing another family's booking, the ArchUnit rule on `LinkedSkater`,
and the security event's content.

**Amended — 2026-10-07.** [ADR-027](ADR-027-on-demand-dev-environment.md): decision 3c's Playwright flows run in an on-demand **dev**
stack before a release, and the second flow's scheduled canary runs **against production**, as a
dedicated test coach and family.

**Amended — 2026-10-08.** [ADR-027](ADR-027-on-demand-dev-environment.md): decision 4's
database-level tenant gate tests run in the on-demand dev stack.

**Amended — 2026-10-15.** [ADR-032](ADR-032-ci-on-github-actions.md): decision 2's pipeline runs on GitHub
Actions. Nothing deploys until ADR-032 decision 2's security setup is in place.

---

## Decision

### 1. No feature ships without automated tests

Applies to every feature in `architecture.md` §10, and to anything added later.

**Integration tests count.** *Decided by the owner, 2026-08-30.* The requirement is
automated tests, not unit tests in the narrow sense — a test that runs against DynamoDB
Local satisfies it, and satisfies decision 3's structural rule.

This is not a relaxation. Several items on decision 4's list **cannot** be anything else:
cross-tenant isolation needs two coaches and a real Global Secondary Index (GSI) query, and
an idempotency guard can only be proven by invoking a consumer twice against a real table
and asserting one effect. A policy admitting only isolated unit tests would have excluded
the tests that matter most.

ADR-001 decision 3 already chose DynamoDB Local for exactly this.

### 2. Enforcement is deferred, with a stated trigger

No code exists yet, so a coverage gate would be a gate on an empty repository, and any
threshold chosen now would be a guess about the shape of code nobody has written.

**Enforcement lands with the first continuous integration (CI) pipeline** — the moment a
gate can exist at all, and before enough code accumulates to make retrofitting painful.
ADR-001 already puts `cdk-nag` in CI as the §7 checklist, so the pipeline is coming
regardless; this attaches to it.

*Amended 2026-10-15 (ADR-032): the pipeline is GitHub Actions.*

**The honest risk of deferring is that "later" never arrives.** It is recorded here with a
trigger rather than an intention so that the trigger is the thing that gets checked.

### 3. The gate is a structural rule, plus mutation testing on `core/` only

*Decided by the owner, 2026-08-30.*

**The build gate is an ArchUnit rule:** every public class in `core/` has a corresponding
test class. ArchUnit is already arriving for ADR-012 decision 5a, so this costs almost
nothing to add.

Its virtue is that it is honest about what it measures. It is a **presence** check and does
not pretend otherwise — a class shipped with no test file fails the build, and nothing more
is claimed.

**Mutation testing (PIT) runs against `core/` and nowhere else.** PIT deliberately breaks
the code — flipping `>` to `>=`, changing `/` to `*`, removing calls — and reruns the tests.
A mutation that *survives* is a bug the tests would not catch.

Scoped to `core/` for two reasons. It is pure logic with no input or output, so PIT runs
fast there and stays fast. And it holds exactly the code where an assertion-free test is
dangerous: block expansion, the conflict test, money arithmetic, the idempotency guards —
off-by-one and boundary-condition problems that a test can execute without noticing.

The difference is concrete. Given `int slots = (end - start) / lessonMinutes;` — a test that
merely *calls* the function satisfies both a coverage threshold and the structural rule. PIT
changes `/` to `*` and, if the test asserts a 6:00–11:30 block at 30 minutes yields eleven
slots, the mutation dies and the code is genuinely covered. If the test asserts nothing, the
mutation survives and PIT says so.

**A coverage threshold is deliberately not adopted.** It has the worst ratio of bad
incentive to real signal of the three: 100% line coverage is achievable by tests that assert
nothing, and any threshold is arbitrary — *which* fifth is uncovered matters far more than
the number. It measures execution and is read as though it measured quality.

### 3a. `web/` is in scope, and duplicated logic is tested on both sides

*Decided by the owner, 2026-08-30.* ADR-001 decision 3 named test tooling for `backend/` and
`infra/` and nothing for `web/`. The policy covers all three.

Four categories, and the fourth is the one with teeth:

| Category | Where it is tested |
|---|---|
| **Component rendering** | `web/` — does the day view draw the right chips, does an empty day render as empty |
| **Frontend-only logic** | `web/` — tab-to-block composition in the schedule editor, selection state, the slot-deselection-splits-a-block rule |
| **Backend-only logic** | `backend/` — the conflict test, cancellation batching, notification routing |
| **Logic living in both** | **Both, against the same cases** |

**The fourth category is why this decision exists.** Slot expansion runs client-side to
populate the schedule editor's live preview as a coach types, and runs in Java because the
interface (API) must validate what is saved. Price totalling across selected slots and the
week/date arithmetic behind the calendar are the same shape.

ADR-008 decision 8 met this problem for the conflict test and solved it by requiring **one
shared implementation** in `core/`. Across a runtime boundary that answer is unavailable —
Java and TypeScript cannot share a function — so the fallback is that both implementations
are tested against **the same cases**, and the cases are the artefact that keeps them
honest.

Concretely, for slot expansion: a block that does not divide evenly by `lessonMinutes`,
abutting blocks, a deselected slot splitting a run in two, a 60-minute block among 30-minute
ones. The same table of inputs and expected outputs, asserted in JUnit and again in the
frontend's test runner.

**Where the cases live is not decided** — a shared fixture file both suites read would keep
them literally identical; two hand-maintained copies would drift, which is the failure this
decision exists to prevent. See Open.

**Tooling for `web/` is unchosen.** ADR-001 picked Vite, whose companion test runner is
Vitest, and React Testing Library is the conventional partner for rendering. Neither is
decided here.

### 3b. Tooling, and where the shared cases live

*Decided by the owner, 2026-08-30.*

**`web/` uses Vitest as the runner and React Testing Library for rendering.** These are not
alternatives to one another — Vitest provides `describe`/`it`/`expect`, mocking and watch
mode; React Testing Library renders a component and queries the resulting DOM, and needs a
runner underneath it. Vitest is chosen over Jest because ADR-001 decision 3 already picked
Vite, and Vitest reuses that build configuration rather than maintaining a second one.

**Duplicated logic is driven from a shared fixture file.** A JSON file at the repository
root, read by both suites — Jackson on the Java side, a direct `import` on the TypeScript
side, since Vite handles JSON natively.

```jsonc
{
  "slotExpansion": [
    {
      "name": "block does not divide evenly by lessonMinutes",
      "block": { "startTime": "06:00", "endTime": "11:30", "lessonMinutes": 45 },
      "off": [],
      "expect": ["06:00","06:45","07:30","08:15","09:00","09:45","10:30"]
    },
    {
      "name": "a deselected slot splits one run into two",
      "block": { "startTime": "06:00", "endTime": "08:00", "lessonMinutes": 30 },
      "off": ["07:00"],
      "expect": ["06:00","06:30","07:30"]
    }
  ]
}
```

**`expect` is written by hand, and that is the whole point.** If the fixture held only
inputs and each side computed its own expected value, each would be asserting against its
own implementation — which tests nothing and would let both drift together in the same
direction. A person decides that 6:00–11:30 at 45 minutes yields those seven times, and both
implementations must agree with the person.

Adding a case then covers both languages at once, and a case only one side handles fails
loudly rather than silently.

*Practical wrinkle:* Maven expects test resources under `src/test/resources`, so the Java
side needs either a `maven-resources-plugin` copy step or a relative-path read from the
test. Minor, but it surprises people.

### 3c. Playwright, scoped to two flows

*Decided by the owner, 2026-08-30.* End-to-end coverage, deliberately narrow.

**Two flows only:**

1. **Book a lesson, end to end** — month → pick times → confirm → result.
2. **Save a schedule change that cancels bookings** — the highest-consequence path in the
   product, spanning the frontend, the interface (API), the change-data-capture path and the
   notifier.

Not broad coverage. Playwright is slow, prone to flakiness, and expensive to maintain for
one developer. What it buys that nothing below it can is the class of failure where *the
frontend sends a field the backend does not read* — invisible to component tests and to
backend tests alike, because each half passes in isolation.

It has somewhere to run now: ADR-011's staging environment, which did not exist when this
would have been awkward. *Amended 2026-10-07 by ADR-027:* the dev stack, built on demand.

**The same tests double as the synthetic canary.** ADR-010 asked whether there should be a
scheduled end-to-end check that books and cancels a lesson, to catch the change-data-capture
path stalling — a failure no per-service metric shows, because every write still succeeds.
Flow 2 *is* that check. Run in continuous integration (CI) it is a test; run on a schedule
against staging it is a canary. One artefact, two jobs. *Amended 2026-10-07 by ADR-027
decision 7:* the canary runs against production, signed in as a dedicated test coach and test
family whose emails reach a mailbox the owner controls. *Amended 2026-10-15 by ADR-027:* in MVP
it runs once after each production deploy, not on a schedule; the scheduled run is Phase 2.

### 4. The list of things this system has already identified as needing tests

Not exhaustive, and not a substitute for the policy — but these are specific, already
written down across other ADRs, and each is somewhere a missing test is expensive rather
than merely untidy.

| What | Why it matters | Source |
|---|---|---|
| **Cross-tenant isolation** — two coaches, assert every cross-tenant read fails | The one boundary in the system that is *not* structural: GSI1 is keyed by student, so the check is enforced in code | `monitoring-questions.md` §1 |
| **Database-level tenant gate** — as coach A's tenant session, every operation against coach B's partition returns `AccessDeniedException`; the execution roles of `api-coach` and `api-checkin` hold no `dynamodb:` action | Proves the gate under the code gate, not the code gate again. **Runs against real AWS (staging), never DynamoDB Local, which ignores IAM.** *Since ADR-027: the on-demand dev stack.* Decision 7's table is this suite's first set of checks | ADR-021 d7 |
| **`consumer-student-link`** — confirm and decline each reach the link item, twice-delivered events have one effect | The link is now written after the fact; a silent failure leaves a family seeing `PENDING` forever | ADR-021 d6 |
| **Client database gate** — ADR-022 decision 9's table, as client A against client B and coach Y | The same proof for the client side, including that a `PENDING` session cannot read the coach's contact fields | ADR-022 d9 |
| **The client read allowlist matches §5** — every attribute a client screen needs is on it, and no student, client, price or payment attribute is | The allowlist fails closed; this catches both a screen broken by a new attribute and an attribute added to the list by mistake | ADR-022 d6 |
| **Block expansion** — daylight-saving boundaries, a block that does not divide evenly by `lessonMinutes`, abutting blocks, an override starting mid-week | ADR-004 made availability a computation rather than stored data; this is where that computation is wrong | ADR-004 Consequences |
| **The conflict test, once** | ADR-008 decision 8 requires the preview and the cancellation consumer to share one implementation; drift means a preview that under-reports what a save will destroy | ADR-008 d8 |
| **Recurrence materialisation** — partial success, and retry attribution via a GSI1 lookup of the client's own bookings, including the case where the index has not caught up (*was `ReturnValuesOnConditionCheckFailure` until ADR-022*) | Without the attribution test, a retry reports a client's own bookings as failures | ADR-006 d4, ADR-022 d8 |
| **Idempotency guards, one per consumer** — run twice, assert one effect | ADR-010 decision 2 requires six of them; a guard that does not work is invisible until a client is emailed twice | ADR-010 d2 |
| **The masking transform** | Compliance-critical (ADR-011); a bug puts children's data in a lower environment | ADR-011 d6a |
| **SMS templates** — one test per template, asserting GSM-7 cleanliness and length at worst-case field values | Both failure modes are silent: an over-length message still sends, and a UCS-2 message still sends | ADR-007 d7 |
| **The access-log emitting function** | Decision 5a guarantees a line is emitted; nothing yet guarantees it names the right actor | ADR-012 Open |
| **Money arithmetic** | `priceMinor` is an integer for a reason (ADR-003 d1); a float creeping in is wrong by a cent in ways nobody can explain to a client | ADR-003 d1 |

---

## Consequences

**Easier.** The list above turns "write tests" into something specific enough to act on. Most
of these were already recorded as risks in their own ADRs without anyone collecting them.

**Harder.** A policy without enforcement is a preference. Between now and the first CI
pipeline, this holds only by discipline — and ADR-001's framing is that the compounding cost
for a solo developer is exactly the things discipline is asked to carry.

---

## Open

- **Whether the structural rule should reach beyond `core/`.** Decision 3 gates `core/`
  because that is where the logic lives; the two API functions and six consumers are
  currently ungated by it.
- ~~Does the policy cover the React frontend?~~ **Settled 2026-08-30: yes** — see decision
  3a, which also requires logic living on both sides to be tested on both sides.
- ~~Where do the shared cases live?~~ **Settled 2026-08-30** — a root-level JSON fixture
  read by both suites, with expected outputs written by hand. See decision 3b.
- ~~Test tooling for `web/`.~~ **Settled 2026-08-30: Vitest + React Testing Library**, with
  Playwright for the two end-to-end flows. See decisions 3b and 3c.
- ~~Are integration tests in scope?~~ **Settled 2026-08-30: yes** — see decision 1.

---

## Revisit if

- The first CI pipeline is built — that is the trigger, and the moment decision 3 goes from
  a decision to a running gate.
- A bug reaches production in an area on decision 4's list. That converts a predicted risk
  into a demonstrated one, and the test becomes mandatory rather than recommended.
