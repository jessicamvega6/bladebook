# ADR-019: A Web Application Firewall in MVP, on the API

## Status

**Accepted** — 2026-09-30. Settles `architecture.md` §11's *"WAF in or out for MVP"*, which
§2 and §12 had carried as optional since the first draft, and which ADR-001's *Revisit if*
named as needing its own decision.

**Changes the API type.** API Gateway becomes a **REST API** rather than an HTTP API, so the
firewall can attach to the API itself. This amends `architecture.md` §2 and ADR-001 (see its
amendment A7).

*Revised the same day.* A first draft put the firewall on CloudFront and routed API traffic
through it, because an HTTP API cannot take one. That needed the API's own public address
disabled and a secret header checked by every API function so nothing could reach the API
around the firewall — and it still left coach sign-up, which goes straight to Cognito,
uncovered. Moving to a REST API removes all of that.

**Amended — 2026-10-05.** Decision 3's open item, *how `api-coach` refuses the check-in
app's tokens*, is **closed** by [ADR-023](ADR-023-rinkside-check-in-joins-the-coach-website.md):
the check-in app no longer has its own app client, so there is nothing to refuse and no
Lambda authorizer. The built-in Cognito authorizer is enough.

**Amended — 2026-10-07.** [ADR-027](ADR-027-on-demand-dev-environment.md): decisions 4–4b apply to the on-demand **dev** stack, which
replaces staging. Its firewall is still off by default and switched on to rehearse block mode,
and it is now paid for only while dev exists — production's ~$10 a month is the steady cost.

**Amended — 2026-10-15.** *Decided by the owner.* [ADR-027](ADR-027-on-demand-dev-environment.md)
adds an API route that needs no sign-in, **`/health`**, for the always-on up-check. **It is
rate-limited.** Decision 2's 1,000-per-5-minutes rule already covers it. It also gets its own
rate-based rule, like the sign-up and code-lookup rule; the number is set when it's built, high
enough for the health checkers' own calls (Open).

**Amended — 2026-10-20.** [ADR-033](ADR-033-invite-only-accepted-skaters.md) decision 2a adds `POST /api/client/share-check`, which
resolves a share code and answers whether that skater is on the coach's student list. Decision 2's
share-code rate rule (20 per 5 minutes per address) covers it.

---

## Context

A Web Application Firewall (WAF) inspects requests before they reach the application and
blocks known attack patterns, known-bad sources and floods from one address. §7 has always
recommended one "given security priority", and §2 left it optional because of cost: at
roughly $10 a month it is the largest single line in §12.

Three things argue for it here more than in a typical small app:

- **Some of the users are children**, and §7 treats the data as such.
- **Several routes are reachable before anyone signs in**: client sign-up, the coach-code
  lookup and coach sign-up. ADR-016 is explicit that coach sign-up is ungated and that the
  coach-code lookup can be enumerated without a throttle.
- **It is the only rate limit that works per source address.** API Gateway's throttling caps
  the whole API; it cannot tell one abusive address from everyone else.

**The firewall and the sign-in token do different jobs.** The JSON Web Token (JWT) Cognito
issues decides *who* may call a protected route. The firewall stops *abuse* — floods, attack
patterns, bad addresses — including on routes that have no token to check, and including a
caller whose token is valid. Neither replaces the other.

---

## Decision

### 1. The firewall sits on the API, and the API becomes a REST API

*Decided by the owner, 2026-09-30.*

The browser calls **API Gateway directly**, with the user's token, exactly as before. What
changes is the kind of API Gateway API: a **REST API** instead of an HTTP API, because AWS WAF
can attach to a REST API and cannot attach to an HTTP API.

- **One web access control list (ACL)**, attached to the API's stage. Every request reaches
  the firewall before API Gateway does anything else, whichever address it was sent to, so
  there is **no way around it** and nothing to disable.
- **The same ACL is also attached to the Cognito user pool**, where coach and client sign-up
  and sign-in actually happen. Both are regional resources, so one ACL covers both. ~~*Confirm at
  build time that the pool's Cognito feature plan supports a WAF association.*~~ *Confirmed
  2026-10-05: "AWS WAF web ACLs are available in all user pool feature plans"
  ([Cognito developer guide](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-waf.html)).
  Three limits from the same page, none of which changes this design: the ACL can't see
  usernames, passwords, emails or phone numbers, so rules match on addresses, headers and the
  requested operation; it must not use the account-takeover-prevention managed rule group
  (`AWSManagedRulesATPRuleSet`), which this ADR doesn't; and a user pool takes one ACL. Because
  the same ACL serves the API, the Cognito rate rule in decision 2 needs a scope-down so it
  counts only Cognito requests (for example on the `x-amzn-cognito-operation-name` header
  Cognito forwards).*
- **CloudFront serves only the static site** and gets no firewall. The site is files in S3:
  nothing there to inject into or flood in a way that matters.

**What the REST API costs.** About $3.50 per million requests instead of about $1. At
BladeBook's volume that is cents a month.

### 2. The rules

| Rule | What it does |
|---|---|
| AWS managed **core rule set** | Common web attacks, including the SQL injection (SQLi) and cross-site scripting (XSS) patterns §7 names |
| AWS managed **known bad inputs** | Request patterns associated with known exploits |
| AWS managed **IP reputation list** | Sources AWS has identified as malicious |
| **Rate-based rule, everything** | Blocks a single address sending **more than 1,000 requests in 5 minutes** — about 3 a second sustained. Generous because a rink's or school's Wi-Fi can put many families behind one address. |
| **Rate-based rule, client sign-up and coach-code lookup** | **20 requests per 5 minutes** per address. A family enters a code once or twice; at 20, guessing even a small share of the roughly 28 million five-character codes would take one address years. |
| **Rate-based rule, Cognito sign-up and sign-in** | **10 requests per 5 minutes** per address, on the user pool's association |

*Numbers decided by the owner, 2026-09-30.* Each counts requests per source address over a
5-minute window.

**The second rate rule is the mechanism for ADR-016's open question** about throttling the
coach-code lookup. The numbers are still open; where they are enforced is not.

**In production, every rule — managed and rate-based — runs in count mode for the first two
weeks after launch**, then switches to block. *Decided by the owner, 2026-09-30.* Count mode
lets a request through while recording that a rule *would* have blocked it, in three places:

- **CloudWatch metrics, per rule** — allowed, blocked and *counted* requests — on the ops
  dashboard.
- **Sampled requests** in the WAF console — up to 100 recent matches per rule, with address,
  path, time and matching rule. Free, no set-up.
- **WAF logs**, if turned on — every request and the rules it matched. See Open.

What the two weeks are for: a rate limit set too low for a rink's shared Wi-Fi, or a managed
rule misfiring on legitimate traffic — a request-size rule on a large schedule save, a
cross-site scripting rule on free text containing `<` or `&`. Seen in count mode, that one
rule is switched off for that route. Seen in block mode, a coach's save simply fails.

**The accepted cost:** for those two weeks the rate limits are not enforced either, so
coach-code guessing and sign-up floods are only recorded, not stopped. ADR-002's `PENDING`
step still means a guessed code cannot produce a bookable student.

At the end of the two weeks: review the counted metrics and sampled requests, adjust any rule
that caught real traffic, and switch everything to block.

### 3. API Gateway still checks the token — and needs one addition to keep ADR-014's rule

Every protected route is still checked by API Gateway before any Lambda runs. On a REST API
that is the built-in **Cognito authorizer**, which confirms a token is genuine, unexpired and
from BladeBook's user pool.

**It cannot, on its own, tell one app client's token from another's.** ADR-014 decision 10
depends on exactly that: `api-coach` must refuse tokens issued to the check-in app, so a
phone left signed in at a rink cannot reach the schedule editor or the roster. The HTTP API's
authorizer could check which app client issued a token; the REST API's Cognito authorizer
cannot. Something must replace that check. See Open — it is the one pending decision this
ADR creates, and it must be settled before `api-coach` and `api-checkin` are built.

### 4. Staging gets one too

*Amended 2026-10-07 by [ADR-027](ADR-027-on-demand-dev-environment.md): read "staging" as the on-demand dev stack throughout decisions 4–4b.*

ADR-011 makes staging a full second stack, and it holds data loaded from production. It gets
the same ACL, so the rules are tried in staging before production — and because staging's
data is masked but still shaped like children's records.

*Confirmed by the owner, 2026-09-30:* staging keeps its firewall. Staging's rules run in
**block mode**, so a misfiring managed rule makes ADR-013's two Playwright flows — booking a
lesson and saving a schedule change — **fail visibly before launch**, rather than showing up
as a count someone has to go looking for.

### 4a. The firewall is a switch, and staging starts without it

*Decided by the owner, 2026-09-30.* The firewall and its rules are defined in the
infrastructure code, behind two settings per environment:

- **`wafEnabled`** — whether the web ACL exists at all. AWS bills a web ACL and its rules
  hourly for as long as they **exist**, attached or not, so "off" means the deploy deletes
  them; "on" recreates the same rules from code in minutes. Nothing is lost, because the code
  is the rule set.
- **`wafMode`** — `count` or `block`. This is what makes production's two-week count period
  (decision 2) a configuration change rather than a code change.

**Staging starts with `wafEnabled` off.** It is not set up while the rest of the system is
being built and tested there. **Turning it on, in block mode, is one of the last things tested
in staging before the initial launch:** enable it, run the Playwright flows and the main coach
and client journeys, fix any rule that misfires, and only then launch — with production in
count mode for its first two weeks. After launch, staging's firewall can be switched off
again to save about $10 a month, and back on before any release that changes the API's
routes or the shape of its requests.

Production's firewall is never switched off: it is the answer to code-guessing and sign-up
floods (ADR-016).

### 4b. Firewall logs: matched requests only, token redacted, 30 days

*Decided by the owner, 2026-09-30.* Logging is a third setting, **`wafLogging`**, alongside
`wafEnabled` and `wafMode`: a deploy adds or removes the logging configuration in a minute.
Logs go to a CloudWatch log group (the name must begin `aws-waf-logs-`), billed per gigabyte
delivered — cents a month here, nothing while off.

- **Only requests a rule matched are logged.** A logging filter keeps requests a rule counted
  or blocked and drops ordinary traffic. The two-week count review sees every would-have-
  blocked request in full — not just the 100 samples per rule the console keeps — without a
  record of every family's normal visits.
- **The sign-in token is redacted.** The `Authorization` header is replaced in every line, so
  the logs never hold a credential. What remains — address, path, time, the rule that matched
  — is still personal data, but only for requests that looked suspicious.
- **Retention is 30 days**, an interim value until the legal review sets one, and set
  explicitly rather than left at CloudWatch's default of never expiring. Turning logging off
  does not delete what was written; retention does.

| Environment | `wafLogging` |
|---|---|
| **Production** | **On** from launch. After the switch to block, keep it on — it is where to look when someone reports being blocked — or turn it off. |
| **Staging** | Follows its firewall: on whenever `wafEnabled` is on. |

---

## Consequences

- **The idle budget moves.** A web ACL costs about $5 a month plus $1 per rule, so the five
  rules above come to about **$10 a month per environment** — about $20 with staging's copy —
  plus $0.60 per million requests, which is negligible here. §12's idle subtotal of about
  $2–6 becomes about **$12–16 for production alone**, above §1's stated target of about
  $2–10. See Open.
- **The API is on a different address from the site**, so the browser makes cross-origin
  requests and API Gateway needs cross-origin resource sharing (CORS) configured for the
  site's domain.
- **A new failure mode: blocking real users.** Managed rules occasionally match legitimate
  requests. Count mode first, and firewall logs to read, are the mitigation.
- **The coach-code throttle has a home**, at the edge rather than in application code.
- **Sign-up is protected too**, through the Cognito association — which the CloudFront design
  could not do.

---

## Open

- ~~**How `api-coach` refuses the check-in app's tokens** (decision 3).~~ **Closed 2026-10-05 by
  ADR-023.** The options considered, kept for the record:
  - **A small Lambda authorizer** that verifies the token and checks which app client issued
    it. Results are cached by API Gateway for a few minutes, so it runs rarely and costs
    almost nothing. Keeps the boundary in infrastructure, which is ADR-014 decision 11's
    stated reason for a separate function. *Recommended.*
  - **Access tokens carrying per-app-client scopes**, which the REST Cognito authorizer can
    require per route. Needs Cognito to put custom scopes into tokens from the apps' sign-in
    flow, which may require a paid feature plan.
  - **A check in each API's code.** Cheapest, but it is the application-enforced boundary
    ADR-014 decision 11 chose against.
- ~~The budget target.~~ **Settled 2026-09-30:** §1 restated to about $22–37 a month idle across
  both environments, with §12's table rewritten.
- ~~The rate limits' numbers.~~ **Settled 2026-09-30** — decision 2.
- **Firewall log retention.** 30 days for now (decision 4b). The logs record source addresses
  and request paths — personal data about whoever made the request — so the final window
  belongs on the legal review's agenda with the access log.
- **The `/health` rate limit's number** (amended 2026-10-15): low enough to stop abuse, high
  enough for the up-check's health checkers, which call from several addresses about once a
  minute each.

---

## Revisit if

- The rules block real users more than rarely, even after tuning.
- Traffic grows enough for the REST API's per-request price, or the firewall's, to matter.
- AWS adds firewall support to HTTP APIs, which would let the API move back to the cheaper type.
