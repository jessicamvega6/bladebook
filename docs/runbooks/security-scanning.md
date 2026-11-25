# Security scanning: the repository settings

*ADR-032, amended 2026-11-25; built in Batch 30a (`AI/implementation-plan.md` §4).*

The repository is public, so a committed secret is exposed the moment it's pushed, and nothing else in the pipeline
looks at the application code or its dependencies for security flaws. These GitHub settings do. All are free on a
public repository. *If the repository is ever made private, secret scanning and CodeQL need GitHub Advanced Security,
which is paid: revisit ADR-032 then.*

| Setting | What it does |
|---|---|
| **Secret scanning** | Scans every commit, including the whole history, for recognised credentials (an AWS access key, a GitHub token…) and raises an alert. |
| **Push protection** | Refuses a push that holds a recognised credential, before it reaches the public repository. |
| **Dependabot alerts** | Raises an alert when a dependency has a published vulnerability: the Maven build (`backend/`), both npm projects (`web/`, `infra/`) and the workflows' pinned actions. |
| **Dependabot security updates** | Opens a pull request moving that dependency to the fixed version. It passes the same checks as any other pull request and the owner merges it. Version updates (no advisory) are not turned on. |
| **CodeQL default setup** | Static Application Security Testing (SAST): GitHub runs CodeQL on every pull request and every merge into `main`, for the Java (`java-kotlin`), the TypeScript and JavaScript (`javascript-typescript`) and the workflows (`actions`). No workflow file: GitHub runs it. |
| **`main`'s ruleset (`protect-main`)** | Gains a *code scanning* rule: a merge is blocked while CodeQL reports a **high or critical** security finding on the pull request. Lower findings don't block; they're fixed or dismissed with a written reason. Its other rules are left as they are. |

The scanning of the running app, ZAP against dev (Batch 30c), is separate and is not a repository setting.

## Turn them on, or check them

The commands are in [`security-scanning.sh`](security-scanning.sh), beside this file. It needs `gh`, signed in as the
repository's owner, and `jq`.

```sh
bash docs/runbooks/security-scanning.sh check   # show each setting; exits 1 if any is off
bash docs/runbooks/security-scanning.sh apply   # turn each one on, then check
```

`apply` can be run again safely: every step sets a value, none toggles one. The ruleset step reads `protect-main`,
keeps every rule except an existing code-scanning rule, adds the one above and writes the ruleset back.

What each step calls, for checking by hand:

| Step | Call |
|---|---|
| Dependabot alerts | `PUT repos/{repo}/vulnerability-alerts` |
| Dependabot security updates | `PUT repos/{repo}/automated-security-fixes` |
| Secret scanning, push protection | `PATCH repos/{repo}` with `security_and_analysis.secret_scanning` and `secret_scanning_push_protection` set to `enabled` |
| CodeQL default setup | `PATCH repos/{repo}/code-scanning/default-setup` with `state: configured`, `query_suite: default` and the three languages |
| Ruleset | `PUT repos/{repo}/rulesets/{id}` with a `code_scanning` rule: tool `CodeQL`, `security_alerts_threshold: high_or_higher`, `alerts_threshold: none` |

## After turning them on

1. **CodeQL's first run.** Turning on the default setup starts a scan of `main` (Actions → *CodeQL*). Its results are
   under Security → Code scanning.
2. **The first findings are Batch 30b.** Secret scanning's history scan, Dependabot's alerts and CodeQL's first
   findings each get a decision there: fixed, or dismissed with a written reason. A real credential is **rotated
   first**, then the alert closed; rewriting history doesn't unpublish it.
3. **The merge block.** The ruleset rule takes effect on the next pull request: its merge waits for CodeQL's result
   and is blocked on a high or critical finding.

## Why not more

ADR-032 turned down a separate dependency audit (`npm audit`, OWASP Dependency-Check: it repeats Dependabot), SpotBugs
with FindSecBugs (it repeats CodeQL's Java checks) and third-party scanners (another account, and the code sent
elsewhere). The Python helper in `.github/scripts/` is not in CodeQL's languages; ADR-032 names Java, TypeScript and
the workflows.

## The first findings (Batch 30b, 2026-11-25)

Every alert the settings raised on day one, and what was done with it.

| Alerts | Tool | What | Decision |
|---|---|---|---|
| Secret scanning | — | The scan of the whole history | Nothing found. |
| Dependabot #1 | Dependabot | `minimatch` in `infra/package-lock.json`, moderate: denial of service through glob patterns | Fixed 2026-11-25 (moved to the patched version). |
| CodeQL #1–4 | CodeQL | `js/xss-through-dom` in the email design pages | Fixed on `main` before 30b. |
| CodeQL #15, #16 | CodeQL | `java/spring-disabled-csrf-protection`, high: CSRF protection off in both APIs' `SecurityConfig` | **Dismissed: false positive.** Both APIs are stateless and authenticate only with a Cognito bearer token in the `Authorization` header, which the website's JavaScript adds from the tab's `sessionStorage` (ADR-023). No cookie or session authenticates a request, so a cross-site request carries no credentials and gets 401; CORS (cross-origin resource sharing) isn't configured, so another site can't send the header either. Turning it on would need a cookie, the thing that makes CSRF possible, and would break every write. A comment above `http.csrf(...)` says the same. **Revisit if** sign-in ever moves to a cookie, an API accepts a plain form post, or CORS opens to another origin with credentials. The cost of this design is that an injected script could read the token: the Content Security Policy is the guard (gap G-49 for dev), and Batch 31 makes a signed-out token stop working at once. |
| CodeQL #5 | CodeQL | `js/bad-tag-filter`, high: `design/harbor/coach/build.mjs`'s `<script>` pattern misses `<SCRIPT>` | **Dismissed: false positive.** Not a filter: the design build uses it to take the script blocks out of the owner's own `schedule.html`, which writes them in lower case. Nothing it reads comes from a user. |
| CodeQL #12, #13, #14 | CodeQL | `js/incomplete-multi-character-sanitization`, high: one pass of `/<[^>]+>/` in the three Harbor build scripts | **Fixed.** A `stripTags` helper strips until nothing changes. The input was always the owner's design source, never user data; the rebuilt email templates (`design/harbor/email/ses`) came out byte-for-byte the same. |
| CodeQL #6–11 | CodeQL | `js/incomplete-html-attribute-sanitization`, medium: `esc` doesn't escape `'`, but `data-arg='…'` is single-quoted | **Fixed.** A real bug in the design demos: a sample name with an apostrophe would break that control. `esc` in `design/harbor/shared.js` and `design/harbor/coach/schedule.html` now escapes `'` as `&#39;`, and the demos are rebuilt. |

To dismiss a CodeQL alert from the command line, with the reason above:

```sh
gh api -X PATCH repos/jessicamvega6/bladebook/code-scanning/alerts/<number> \
  -f state=dismissed -f dismissed_reason='false positive' -f dismissed_comment='<reason, at most 280 characters>'
```
