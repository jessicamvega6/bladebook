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
disable, not two), [ADR-012](ADR-012-pii-access-logging.md) decision 1 and
[ADR-013](ADR-013-testing-requirement.md) decision 4 (references to `api-checkin`).

**Keeps** every ADR-014 decision about working at a rink: offline capture and replay (1, 1a,
2a, 3, 4, 4a), loading with no signal (5, 5a), explicit no-show (6), the `PENDING` report
default (7), correction on the website only (8), and contact details fetched only with
signal and never cached (9b).

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
follow ADR-011 decision 7a's domains (`staging.<domain>/coach/rinkside`). The coach signs in
once with the coach website's sign-in. There is no subdomain and no separate origin path.

It is still built as **its own entry point** within `web/`'s coach site: a lightweight page
that loads today's lessons, attendance, contact reveal and cancellation, and not the
schedule editor. That keeps it small on a phone at the rink and lets it be cached for
offline use without caching the whole coach website. It ships with the coach website, not
on its own.

**Offline loading is unchanged in substance** (ADR-014 d5). The service worker is
registered with scope `/coach/rinkside/`, so it caches and serves only the rinkside page.
The rest of the coach website and the family website still get none.

**Add to Home Screen still works.** The rinkside page carries its own web app manifest
(`start_url` and `scope` set to `/coach/rinkside/`), so the coach can put a BladeBook icon on
the phone that opens straight to it, full-screen. *Platform note, to verify on a device:* on
iPhones a home-screen web app keeps its own storage, separate from Safari, so the coach signs
in once inside it even if Safari is already signed in.

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
  website's if it has its own.

---

## Open

- **Whether other actions need a recent sign-in too.** Candidates: day or week cancellation
  (from the week view or rinkside), removing a student, approve and decline, and changing
  the coach's contact or payment details. Each is less destructive than a schedule save but
  still worth asking about.
- ~~**The website's refresh-token lifetime.**~~ **Settled 2026-10-05, decision 6:** 60 minutes
  on the coach and family websites, 4 hours on the rinkside page, from sign-in.
- **Confirm the iPhone home-screen storage behaviour** in decision 1 on a real device.

---

## Revisit if

- A native app is reconsidered. A native app with its own sign-in is the case the original
  separation fit, and ADR-014 decisions 10 and 11 are the starting point.
- A coach reports a lost or stolen phone being used against their account. That is the
  threat this ADR accepts more of, and the answer may be a shorter session or a wider
  recent-sign-in rule rather than a return to separate app clients.
