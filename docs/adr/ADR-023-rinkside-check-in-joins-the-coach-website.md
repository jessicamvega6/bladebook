# ADR-023: Rinkside Check-in Joins the Coach Website

## Status

**Accepted** — 2026-10-05. *Decided by the owner.*

**Amended — 2026-10-05.** Decision **6** sets how long people stay signed in: **60 minutes**
on the coach and family websites, **4 hours** on the rinkside page. Settles the Open item on
the refresh-token lifetime.

**Supersedes** [ADR-014](ADR-014-check-in-app-and-offline-capture.md) decisions **10** (a
separate Cognito app client for check-in) and **11** (a separate API function,
`api-checkin`), and the parts of decision **11a** that describe `api-checkin`'s role.
**Supersedes** [ADR-001](ADR-001-backend-stack.md) amendment **A3**'s separate check-in
bundle on its own CloudFront origin path, and A5's `api-checkin` row.

**Amends** [ADR-021](ADR-021-tenant-isolation-at-the-database.md) decisions 1 and 2 (no
`checkin-tenant` role), [ADR-019](ADR-019-waf-in-mvp.md) decision 3 (its open item is
closed), [ADR-011](ADR-011-staging-environment.md) decision 6c (one coach app client to
disable, not two; *since decision 9, the coach and family app clients*), [ADR-012](ADR-012-pii-access-logging.md) decision 1 and
[ADR-013](ADR-013-testing-requirement.md) decision 4 (references to `api-checkin`).

**Keeps** every ADR-014 decision about working at a rink: offline capture and replay (1, 1a,
2a, 3, 4, 4a), loading with no signal (5, 5a), explicit no-show (6), the `PENDING` report
default (7), correction on the website only (8), and contact details fetched only with
signal and never cached (9b).

**Amended — 2026-10-07.** [ADR-027](ADR-027-on-demand-dev-environment.md): the rinkside page's lower-environment address is
`dev.<domain>/coach/rinkside`, on a dev stack built on demand.

**Amended — 2026-10-12.** *Decided by the owner.* BladeBook's users are older and **are not
expected to add the rinkside page to the home screen**. Decision 1's *"Add to Home Screen still
works"* is withdrawn as a design assumption: the page is built and tested as an ordinary
browser tab. A manifest may stay, but nothing may depend on it. The iPhone home-screen storage
check (Open) is dropped, and a browser-tab consequence is added (Open).

**Amended — 2026-10-13.** *Decided by the owner.* **The coach reaches the rinkside page two
ways**, and neither needs a home-screen icon or a bookmark:

- **A large link at the top of the coach website's Today page** (the dashboard), above the
  day's numbers.
- **A link at the top of a new morning email to the coach.** The ~7:00am day-of reminder job,
  which already reads every seat booked for the day, also sends each coach with lessons that
  day one email listing them, with the rinkside link first. No new function or schedule. The
  link is a plain address with no sign-in token in it; the page asks the coach to sign in as
  usual. A coach with no lessons that day gets no email. MVP has no off switch; turning it off
  arrives with the email templates page in Phase 2. This adopts Kim's "daily email about
  lessons scheduled" (`docs/Talking with Kim:.md.md`). The run stamps `morningEmailSentOn` on
  the coach's profile, keyed on (coach, date), so a retry never sends the email twice.
  **Amends** [ADR-001](ADR-001-backend-stack.md) amendment **A6** and
  [ADR-010](ADR-010-availability-and-reliability.md) decision **3**.

**Amended — 2026-10-15.** *Decided by the owner.* The coach's morning email goes to the
coach's **login email**, the same verified address as the daily report — not the business
email on the profile. The weekly unpaid-lesson reminder already goes there
([ADR-018](ADR-018-unpaid-lesson-reminder-to-coach.md)). **Amends** [ADR-001](ADR-001-backend-stack.md)
amendment **A6**.

**Amended — 2026-10-21.** *Decided by the owner.* The rinkside page is a page of the coach
website, not a separate app. Two decisions follow:

- **Decision 7:** the page and its routes need a coach's sign-in **and** a coach's account. A
  family's sign-in, from the same user pool, is refused. Until now this file said how the coach
  signs in, but not that only a coach may use the page.
- **Decision 8:** every rinkside screen has a link back to the coach website's Today page.
- **The same rule on the family side:** `api-client` refuses a token without the `Client` group
  (decision 7). *Decided by the owner, 2026-10-21.*

**Amended — 2026-10-22.** *Decided by the owner.* **Decision 9:** the family website gets its
own Cognito app client. Each API refuses a token issued to the other website's app client, as
well as one without its group. Settles the Open item on the family website's app client, and
amends ADR-011 decision 6c (two app clients to disable, not one).

---

## Context

`FeatureDecriptions/Coach App` describes the rinkside check-in as a *"Seperate App from
bladebook website"*. The owner wrote that assuming a native phone app with its own sign-in.
The design that followed kept it a web page and built the separation in three layers instead:

1. **Its own Cognito app client** (ADR-014 d10), so `api-coach` could refuse a rinkside token
   and the rinkside session could expire sooner.
2. **Its own API function**, `api-checkin` (ADR-014 d11), with its own execution role and,
   since ADR-021, its own `checkin-tenant` role.
3. **Its own bundle on its own CloudFront origin path** (ADR-001 A3), with a subdomain under
   discussion on 2026-10-05.

On 2026-10-05 the owner confirmed there will be no native app for now. The store accounts,
review on every release, old versions in the field, yearly platform upkeep and a fourth test
package bought one thing: background sending of queued check-ins on iPhones. So check-in
stays a web page, and the question became whether the three layers earn their cost.

**What they cost.** Layer 1 is blocker #8 in `Blockers-Before-Coding.md`, the most-blocking
item on the map: once API Gateway became a REST API (ADR-019), its Cognito authorizer could
no longer tell app clients apart, so keeping d10 needs a custom Lambda authorizer in front of
every coach route. Layer 2 is a third Spring Boot artifact, a third tenant role and its own
database-gate tests. Layer 3 is a separate deploy target and, with a subdomain, DNS,
certificate and CORS work.

**What they protect against.** ADR-014 d10 names the threat: *a phone left signed in at a
public rink holds a token accepted on every coach route.* The separation answers that only
if the website is not also signed in on the same phone. For a web page, it almost certainly
is: the coach uses the same phone, the same browser and the same account. Someone holding
an unlocked phone can open the website directly. The separation protects the narrow case
where the rinkside page is signed in and the website is not.

The real risk is the schedule editor, where one save can cancel a year of lessons through
§6.5 (ADR-014 d10). That can be guarded directly, on every device, rather than only on the
one that happens to be at the rink.

---

## Decision

### 1. Rinkside check-in is a section of the coach website

It lives at **`<domain>/coach/rinkside`**, under the coach website. Production and staging
follow ADR-011 decision 7a's domains (`staging.<domain>/coach/rinkside`; *`dev.<domain>/coach/rinkside` since ADR-027*). The coach signs in
once with the coach website's sign-in. There is no subdomain and no separate origin path.

It is still built as **its own entry point** within `web/`'s coach site: a lightweight page
that loads today's lessons, attendance, contact reveal and cancellation, and not the
schedule editor. That keeps it small on a phone at the rink and lets it be cached for
offline use without caching the whole coach website. It ships with the coach website, not
on its own.

**Offline loading is unchanged in substance** (ADR-014 d5). The service worker is
registered with scope `/coach/rinkside/`, so it caches and serves only the rinkside page.
The rest of the coach website and the family website still get none.

~~**Add to Home Screen still works.** The rinkside page carries its own web app manifest
(`start_url` and `scope` set to `/coach/rinkside/`), so the coach can put a BladeBook icon on
the phone that opens straight to it, full-screen. *Platform note, to verify on a device:* on
iPhones a home-screen web app keeps its own storage, separate from Safari, so the coach signs
in once inside it even if Safari is already signed in.~~ *Withdrawn 2026-10-12:* coaches are
not expected to add it to the home screen. They open it in Safari or Chrome.

### 2. One app client for the coach website

The rinkside page signs in through the **same Cognito app client** as the rest of the coach
website. ADR-014 decision 10's separate app client is withdrawn, and with it the per-client
refresh window it made possible.

### 3. Check-in routes move into `api-coach`

`api-checkin` is withdrawn. Its routes (today's bookings, one student's contact reveal,
attendance, and lesson, day or week cancellation with release or hold) become routes on
`api-coach`, under `/coach/…`. They run under ADR-021's `coach-tenant` role, which already
permits every action they need and pins every request to the signed-in coach's partition.

The replay rules move with them unchanged: the conditional write that makes replay
idempotent (ADR-014 d3), the device-timestamp check (d2a), and the rejection reasons the
phone lists (d4a). The contact reveal is still logged when it happens (ADR-012).

**What the coach-tenant role adds over `checkin-tenant`:** GSI3, the unpaid-lessons index,
and `CODE#` writes. Neither crosses tenants. `api-coach` already holds no GSI2, the one
index that does (ADR-001 A6), so ADR-014 decision 11's "substantial win" is kept.

### 4. Schedule saves require a recent sign-in

*Decided by the owner, 2026-10-05.* This replaces token separation as the guard on the most
destructive action in the system.

Saving a schedule change (the weekly schedule, a special schedule, or time off: anything
that goes through ADR-008's impact preview) is refused unless the coach **signed in within
the last 15 minutes**. The check uses the `auth_time` claim Cognito puts in the token, which
records when the person last entered their password and is not reset when a token is
refreshed. When it is too old, `api-coach` refuses the save with a specific error, and the
website asks for the password (and the MFA code, if the coach has MFA on), then retries the
save.

- **Where it is enforced:** in `api-coach`, as a shared check applied to the schedule-save
  route. The check is code, not infrastructure; that is the trade this ADR makes.
- **The window is configuration.** 15 minutes is the starting value.
- **The preview is not guarded,** only the save. The coach can review the impact without
  re-entering a password and is asked once, at the moment it matters.

### 5. The API Gateway authorizer stays Cognito's built-in one

With one coach app client there is nothing for API Gateway to tell apart, so ADR-019's open
item, *"How `api-coach` refuses the check-in app's tokens"*, is **closed**: no Lambda
authorizer. The REST API's Cognito authorizer checks every protected route, as ADR-019
decision 3 already describes.

---

### 6. How long people stay signed in

*Decided by the owner, 2026-10-05 (amendment).*

| Where | Signed in for | Counted from |
|---|---|---|
| Coach website | **60 minutes** | the last time the person entered their password |
| Family website | **60 minutes** | the same |
| Rinkside page (`/coach/rinkside`) | **4 hours** | the same |

Both are measured from the `auth_time` claim, which Cognito sets when the password is entered
and doesn't reset when a token is refreshed. So these are limits from sign-in, not from the
last activity: a coach working steadily is still asked to sign in again after 60 minutes.

**How one app client holds two limits.** Cognito's refresh-token lifetime is set to
**4 hours**, the longest of the two, so Cognito itself ends every session by then. The
shorter limit is enforced by the API, using the same `auth_time` check as decision 4:

- `api-coach` refuses its coach-website routes when `auth_time` is more than 60 minutes old,
  and accepts its rinkside routes up to 4 hours.
- `api-client` refuses every route when `auth_time` is more than 60 minutes old.
- A refused request returns the same "sign in again" error as decision 4, and the site sends
  the person to sign-in.

Decision 4 still applies inside these windows: a schedule save also needs a sign-in from the
last 15 minutes.

**What this means in practice:**

- **The rinkside page covers a session at the rink.** The coach signs in on arrival, with
  signal, and stays signed in for 4 hours. Check-ins recorded offline still queue on the phone;
  if the 4 hours run out first, the queue is sent after the coach signs in again (ADR-014 d1,
  d2a: a queued entry doesn't expire).
- **Opening the coach website from a rinkside sign-in asks for the password again** once that
  sign-in is more than 60 minutes old. The longer window applies only to the rinkside routes.
- **The coach website should warn before the 60 minutes run out** and keep unsaved work, above
  all in the schedule editor, so a long edit isn't lost to the limit.
- **A token taken from the phone works on the rinkside routes for up to 4 hours:** today's
  lessons, attendance, contact reveal and cancellation. Everything else needs a sign-in from the
  last 60 minutes, and a schedule save one from the last 15.

**Tests** (ADR-013): each route group refuses a token past its limit and accepts one inside
it, and a refreshed token keeps its original `auth_time`.

---

### 7. Only a signed-in coach can use the rinkside page

*Decided by the owner, 2026-10-21 (amendment).*

**Authentication.** Nothing on the rinkside page is shown until the coach has signed in through
the coach website's sign-in (decision 2). Without a session, the page shows only the sign-in
screen. The page's files are public on CloudFront, like the rest of the website, but they hold
no lesson or family data. Every piece of that data comes from an `api-coach` route, and API
Gateway's Cognito authorizer checks the token on every request (decision 5).

**Authorization.** A valid token is not enough. Coaches and families sign in to **one user
pool**, so a family's token passes the authorizer too. Every `api-coach` route, the rinkside
routes included, also requires the **`Coach` group** in the token's `cognito:groups` claim. A
token without it is refused with **403 Forbidden** before any route code runs.

- **Where it is enforced:** in `api-coach`, as one shared check on every route, the same way
  decision 4's recent-sign-in check is. The REST API's Cognito authorizer only checks that the
  token is valid.
- **What it reaches once allowed:** only the signed-in coach's own partition. The
  `coach-tenant` role pins every request there (decision 3,
  [ADR-021](ADR-021-tenant-isolation-at-the-database.md)).
- **How long:** the 4-hour limit on rinkside routes (decision 6).

**The family side works the same way.** Every `api-client` route requires the **`Client`
group** and refuses a token without it with 403, in one shared check on every route. So a
coach's token can't use the family website's routes either. Once allowed in, a family reaches
only the skaters linked to it ([ADR-022](ADR-022-client-isolation-at-the-database.md),
[ADR-024](ADR-024-client-write-link-check.md)).

**Tests** ([ADR-013](ADR-013-testing-requirement.md)): every rinkside route refuses a request
with no token, refuses a family (`Client`) token with 403, and accepts a coach token; every
`api-client` route refuses a coach (`Coach`) token with 403 and accepts a family token; one
coach's token never reads another coach's lessons (already in ADR-021's tests).

### 8. A way back to the coach website

*Decided by the owner, 2026-10-21 (amendment).*

Every rinkside screen after sign-in has a **"Your dashboard"** link at the top. It opens the
coach website's Today page (`/coach`) in the same tab. The sign-in screen doesn't show it.

If the rinkside sign-in is more than 60 minutes old, the website asks for the password first
(decision 6).

### 9. The family website has its own app client

*Decided by the owner, 2026-10-22 (amendment).*

The user pool has **two app clients**: one for the coach website (decision 2, rinkside page
included) and one for the family website. Cognito records in every token which app client
issued it (`client_id` on an access token, `aud` on an ID token).

**Why: what Cognito enforces, not our code.** These hold even if the API code has a mistake:

- **Separate sign-in return addresses.** Each app client lists only its own website's addresses,
  so a family's sign-in can only land on the family website, and a coach's only on the coach
  website. A sign-in link that tries to send a family to the coach website is refused before
  sign-in.
- **The family session ends at 60 minutes in Cognito.** Each app client has its own
  refresh-token lifetime. The family app client's is set to 60 minutes (decision 6), so Cognito
  stops refreshing a family's tokens then. The coach app client stays at 4 hours for the
  rinkside page, and the coach website's shorter limit is still enforced by the API on
  `auth_time`.
- **One side can be turned off alone.** Disabling the family app client stops family sign-ins
  while coaches keep working, and the other way round.

**A small extra in the API code.** `api-coach` accepts only tokens from the coach app client,
and `api-client` only tokens from the family app client. A token from the other app client is
refused with **403**, in the same shared check as decision 7's group check. The REST API's
Cognito authorizer can't tell app clients apart (ADR-019 d3), so this check is in the API code;
no Lambda authorizer is needed. It catches a mistake in the group test itself (a wrong group
name, a reversed comparison). It does **not** add a separate layer against a route that skips
the shared check altogether, because both tests are in that one check. Decision 7's per-route
tests are what catch a skipped check.
- **Dev containment disables both** ([ADR-011](ADR-011-staging-environment.md) d6c), in one
  script, so a missed step can't leave families able to sign in.
- **A person in both groups** (a coach who is also a parent, see
  `FeatureDecriptions/Coach Who Is Also a Parent.md`) signs in on each website separately. Each
  token works on its own website's API only.

**Tests** ([ADR-013](ADR-013-testing-requirement.md)): every `api-coach` route refuses a token
from the family app client with 403, even when it carries the `Coach` group; every
`api-client` route refuses a token from the coach app client with 403, even when it carries
the `Client` group.

---

## Alternatives considered

- **Keep all three layers, on a subdomain** (`rink.<domain>`). Discussed with the owner on
  2026-10-05 and recommended at the time, because it would have extended the token
  separation to browser storage on the phone. Rejected once the separation itself was
  questioned: it keeps blocker #8 and adds DNS, certificate and CORS work to protect a case
  the website, signed in on the same phone, already undermines.
- **Keep the separate app client, drop `api-checkin`.** Still needs the Lambda authorizer to
  make the separate client mean anything. Most of the cost for little of the benefit.
- **Keep `api-checkin`, drop the separate app client.** An infrastructure boundary around the
  check-in code with nothing to stop a coach token from reaching `api-coach` directly. The
  separate function would protect against a defect in check-in code, which `coach-tenant`
  already confines to the coach's own partition.
- **A native app.** Ruled out for now (see Context).

---

## Consequences

- **Blocker #8 is gone.** No Lambda authorizer, nothing to build in front of `api-coach`,
  and one less decision before the API functions.
- **Twelve functions, not thirteen.** `api-checkin.jar` and the `checkin-tenant` role are
  removed. ADR-021's database-gate tests need only `coach-tenant`.
- **A stolen or unattended signed-in phone reaches more than before.** Without a recent
  sign-in it cannot save a schedule change, but it can read the roster, the payments view and
  the profile, reveal contact details, record attendance and cancel lessons. That was largely
  true already through the website on the same phone, but it is now true of the rinkside
  page as well. Coach MFA (§7) and a sensible session length are the remaining guards.
- **The rinkside session can't be made shorter than the website's.** One app client means
  one refresh window. Set it for the website; the rinkside page lives with it. *Amended
  2026-10-05: decision 6 gives the two different limits anyway, enforced by the API on
  `auth_time`, with the longer one (4 hours) on the rinkside page.*
- **The check-in code runs inside `api-coach`.** A defect there runs with `coach-tenant`'s
  actions rather than `checkin-tenant`'s narrower ones. ADR-021 still confines it to the
  signed-in coach's partition.
- **`web/` is simpler to deploy.** The coach website and the rinkside page ship together.
  The rinkside page is still its own entry point with its own service worker, so the testing
  ADR-014 asks of it (queue survives reload, duplicate replay dropped, and so on) is
  unchanged.
- **Staging containment disables one coach app client** (ADR-011 d6c), plus the family
  website's if it has its own. *Read "staging" as dev since ADR-027.* *Amended 2026-10-22:
  the family website has its own (decision 9), so containment disables two.*

---

## Open

- **The offline copy after the session ends.** *Added 2026-10-21 with decision 7.* With no
  signal, the page shows today's cached lessons without asking the server. Two questions
  follow. Should the page stop showing them once the 4 hours are up? Doing so would also stop
  offline check-ins, which decision 6 lets queue past the limit. And should logging out remove
  the cached lessons from the phone, along with the queue?
- ~~**The same group check on `api-client`.** *Added 2026-10-21.* Decision 7 makes `api-coach`
  refuse a token without the `Coach` group. Whether `api-client` should refuse one without
  the `Client` group isn't yet written down.~~ **Settled 2026-10-21 by the owner:** yes.
  `api-client` refuses a token without the `Client` group with 403 (decision 7).
- **Where the family website lives.** *Added 2026-10-22.* The coach website is at
  `<domain>/coach` and the rinkside page at `<domain>/coach/rinkside`, but no ADR says where
  the family website is served: `<domain>/`, `<domain>/family`, or a domain of its own. The
  answer sets its CloudFront path, its sign-in redirect addresses, and the links in family
  emails.
- ~~**Whether the family website has its own Cognito app client.** *Added 2026-10-22.* The
  Consequences above and [ADR-011](ADR-011-staging-environment.md)'s amendment of 2026-10-05
  both say "the family website's, if it has its own." With one shared app client, the sign-in
  redirect addresses and token settings are set once for both sites, and decision 7's group
  checks are the only thing keeping a coach's token off the family routes. With its own app
  client, each site's settings stay separate, and dev containment disables two app clients.~~
  **Settled 2026-10-22 by the owner:** it has its own (decision 9).
- **Whether other actions need a recent sign-in too.** Candidates: day or week cancellation
  (from the week view or rinkside), removing a student, approve and decline, and changing
  the coach's contact or payment details. Each is less destructive than a schedule save but
  still worth asking about. *2026-10-13: removing a student is Phase 2 (Blockers #17), so it is
  no longer an MVP candidate.*
- ~~**The website's refresh-token lifetime.**~~ **Settled 2026-10-05, decision 6:** 60 minutes
  on the coach and family websites, 4 hours on the rinkside page, from sign-in.
- ~~**Confirm the iPhone home-screen storage behaviour** in decision 1 on a real device.~~
  *Dropped 2026-10-12:* no home-screen use is assumed.
- ~~**Safari may clear the rinkside page's storage.** In an ordinary Safari tab, a site's
  stored data (the service worker's offline copy, ADR-014's offline queue, the sign-in) can be
  removed after 7 days of Safari use without a visit to the site. A coach back from a week off
  could reach a rink with no signal and find the page won't open offline. Decide what the page
  says, and whether anything else is needed. *Added 2026-10-12.*~~ **Settled 2026-10-13 by the
  owner:** offline capture stays and the gap is guarded. If the page opens with signal and its
  offline copy is gone, it says so and reloads it; queued entries are sent as soon as there is
  signal. See [ADR-014](ADR-014-check-in-app-and-offline-capture.md)'s amendment of 2026-10-13.
- ~~**How the coach gets to the rinkside page** without a home-screen icon: a link in the
  morning email, a large link on the coach website's home page, a bookmark. *Added 2026-10-12.*~~
  *Settled 2026-10-13 by the owner:* a large link on the Today page and a link in a new
  morning email to the coach (see the amendment of 2026-10-13).

---

## Revisit if

- A native app is reconsidered. A native app with its own sign-in is the case the original
  separation fit, and ADR-014 decisions 10 and 11 are the starting point.
- A coach reports a lost or stolen phone being used against their account. That is the
  threat this ADR accepts more of, and the answer may be a shorter session or a wider
  recent-sign-in rule rather than a return to separate app clients.
