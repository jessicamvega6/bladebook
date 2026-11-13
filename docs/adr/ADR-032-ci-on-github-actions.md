# ADR-032: Continuous Integration Runs on GitHub Actions, Locked Down Before the First Deployment

## Status

**Accepted** — 2026-10-15. *Decided by the owner.*

Settles the pending decision *"Which continuous integration (CI) system?"* in
`Open-Pending.md` §1. Names the system behind [ADR-013](ADR-013-testing-requirement.md)
decision 2 (the test gates run in CI) and Blockers-Before-Coding #3 (set up the first CI
pipeline).

~~**Leaves open** the infrastructure tool, AWS Cloud Development Kit (CDK) or Terraform
([ADR-001](ADR-001-backend-stack.md) amendment A4). Either one runs from this pipeline.~~
*2026-11-12: A4 is resolved: the infrastructure tool is AWS Cloud Development Kit (CDK) in
TypeScript, run from this pipeline through each account's CDK bootstrap and OIDC deploy role.*

**Amended — 2026-10-15.** [ADR-027](ADR-027-on-demand-dev-environment.md): the production deploy
job ends with the post-deploy check (ADR-013 decision 3c's second flow, once, against
production). The production deploy role may read the one Secrets Manager secret holding the
test accounts' passwords, and nothing else for it. The up-check runs in AWS, not in GitHub.

**Amended — 2026-10-15, later.** *Decided by the owner.*

- **The deploy doesn't build dev.** Testing in dev happens earlier, while the change is being
  worked on; by the time of a production deploy, dev is either still up or was recently torn
  down. Context's "build a dev stack to test in before deploying to production" means that
  testing comes first, not that each deploy run builds dev again.
- ~~**Production deploys only a commit that passed in dev.** A passing run of ADR-013's browser
  flows in dev is recorded against that exact commit. The production job checks for the record
  and refuses any commit without one. Dev doesn't have to be running at deploy time. How the
  record is written is Open.~~ *Withdrawn later the same day — see below.*
- **Dev stacks may be built by hand.** `build-dev` runs from the owner's machine with their own
  IAM Identity Center sign-in ([ADR-027](ADR-027-on-demand-dev-environment.md) decision 8), not
  only from a workflow. Decision 2 still applies to every workflow that deploys. A hand build
  only starts ADR-027 decision 9's masking workflow in the production account; no data passes
  through the owner's machine.

**Amended — 2026-10-15, last.** *Decided by the owner.* **The dev-pass gate is withdrawn.**
Merging changes the commit, and dev is gone by merge time, so a pass recorded in dev can't be
matched without extra machinery. Instead:

- **Every merge into `main` builds, tests and tags a version.** The build runs every test that
  needs no AWS: the Java tests, the website tests, ArchUnit and mutation testing. The booking and
  schedule logic is covered there by extensive unit tests.
- **Production deploys only a tagged build**, the exact package built from `main`, never a
  rebuild, after the owner's approval.
- **The browser flows check production right after**, as the post-deploy check, not before it.
  They still run in dev while the change is worked on, by habit, not enforced. If the check
  fails, the owner rolls back. The cost, accepted: a change that gets past the unit tests is
  live for the few minutes between the deploy and the failed check. *Revisit* when there are
  more coaches or more than one person merging.

---

## Context

No ADR named a CI system. The pipeline has to:

- build the Java archive (JAR) files before every deploy, so a deploy never ships stale code;
- run ADR-013's ArchUnit and mutation-testing gates;
- build a dev stack to test in before deploying to production ([ADR-027](ADR-027-on-demand-dev-environment.md)); *(amended later 2026-10-15: testing in dev comes first; the deploy doesn't build dev — see Status)*
- reach AWS **without long-lived access keys**.

The code lives on GitHub. The two candidates were **GitHub Actions**, built into GitHub, and
**AWS CodePipeline with CodeBuild**, which keeps everything inside AWS.

GitHub Actions is less work for a one-person project and sits next to the pull requests. Its
drawback is that **the pipeline that deploys to production runs outside AWS**: anything that
can change or run a workflow in the repository can reach the AWS account. Third-party actions
are a known supply-chain risk. In March 2025 the widely used `tj-actions/changed-files`
action was compromised and leaked secrets from the pipelines that used it.

The owner chose GitHub Actions on the condition that its security setup is complete **before
the first deployment**.

---

## Decision

### 1. CI runs on GitHub Actions

Workflows live in `.github/workflows/` in the BladeBook repository. They build, test and
deploy to the dev and production accounts set up under ADR-027. *Amended later 2026-10-15:
dev may also be built by hand — see Status.*

### 2. Security setup required before the first deployment

*Decided by the owner, 2026-10-15.* **No workflow deploys anything to either AWS account until
every item below is in place.** This applies to the dev account as well as production: the
dev account holds a copy of the table (ADR-028), and a deploy role is the same way in for both.

*Amended later 2026-10-15, decided by the owner:* this rule covers workflows only. **Building dev
by hand is allowed from day one**, before this setup exists, because it rests on the owner's own
IAM Identity Center sign-in with multi-factor authentication (ADR-027 decision 8). And "holds a
copy of the table" overstates it: dev starts on seed data and **can hold masked production data
on request** (ADR-028 decision 2).

1. **Every action is pinned to a full commit hash.** Pin with
   `uses: owner/action@<40-character commit hash>`, never a tag such as `@v4` or a branch,
   with the version in a comment beside it. Use as few third-party actions as possible:
   prefer GitHub's own actions (`actions/*`) and plain shell steps.
2. **AWS is reached through OpenID Connect (OIDC) only.** The workflow asks AWS for
   short-lived credentials for each run. No AWS access keys are stored in GitHub secrets.
3. **The AWS trust rule is locked to this repository and branch.** The role's trust policy
   checks the token's `aud` (`sts.amazonaws.com`) and its `sub` exactly. For production,
   `sub` must match this repository's production environment
   (`repo:<owner>/<repo>:environment:production`). Wildcards that would admit another
   repository, a fork or any branch are not allowed.
4. **A production deploy waits for the owner's approval.** Production deploys run in a GitHub
   environment named `production` that requires a reviewer's approval and allows deploys only
   from `main`.
5. **`main` is protected.** No direct pushes and no force-pushes. Changes arrive by pull
   request with the ADR-013 checks passing. The GitHub account that owns the repository uses
   two-factor authentication.
6. **Workflows get the fewest permissions.** The default token permission is read-only. A job
   is granted `id-token: write` only when it needs to reach AWS, and is granted nothing else
   it doesn't use. Workflows triggered by `pull_request_target` aren't used. Pull requests
   from forks never receive AWS credentials.
7. **Deploy roles have the least privilege.** Dev and production have separate deploy roles,
   each in its own account. Each role can do only what deploying the stack needs (§7, "Least
   privilege").

The tool that checks infrastructure for least privilege (`cdk-nag`, or `checkov`/`tfsec`)
runs in this pipeline as a build gate once ADR-001 A4 is settled.

---

## Alternatives considered

- **AWS CodePipeline with CodeBuild.** It keeps deploy access entirely inside AWS, under the
  same access rules and audit trail. It was rejected for now as more setup and further from the
  pull requests, for little gain once item 2's rules are in place. See *Revisit if*.
- **GitHub Actions with stored AWS access keys.** Rejected. It breaks the no-long-lived-keys
  requirement. A leaked key keeps working until someone notices.

---

## Consequences

- **The GitHub account is a way into production.** Decision 2's items 4 and 5 are what stop
  it from being an easy one.
- **Pinned actions don't update themselves.** Security fixes in an action arrive only when the
  pin is moved (Open).
- **Free minutes are capped.** Private repositories get a monthly allowance of build minutes.
  ADR-013's mutation testing is slow, so a busy month may cost a few dollars more. §12 costs
  should reflect it once the pipeline exists.
- **Deploy logs live in two places.** GitHub keeps run logs for a limited time (90 days by
  default), and AWS CloudTrail records each use of a deploy role. Tracing a deploy means
  looking at both.
- **A GitHub outage stops deploys.** No deploy is urgent enough in MVP for this to matter.

---

## Open

- **Keeping pinned actions current:** Dependabot can raise pull requests that move a pinned
  hash to a newer release. Decide whether to turn it on, or to check by hand on a schedule.
- **How long to keep run logs**, and whether to copy them anywhere.
- **Keeping deploy roles away from personal data.** A deploy role is a new kind of AWS access
  ([ADR-012](ADR-012-pii-access-logging.md) lets only the owner's operator role read the
  personal-data access log). Deploy roles must not read the table's data or that log. If CDK is
  chosen (ADR-001 A4), narrow its default bootstrap execution role, which has full administrator
  access unless changed. *Added 2026-10-15.*
- ~~**How a passing dev run is recorded on the commit**, given that dev may be built by hand:
  for example, the dev flows run from a workflow against the dev stack the owner built, and
  set a commit status; or the owner's run sets it. *Added 2026-10-15.*~~ *Gone 2026-10-15: the
  gate was withdrawn (Status).*

---

## Revisit if

- An action the pipeline depends on is compromised, or GitHub changes how OIDC tokens are
  issued.
- Someone else gains write access to the repository. Item 4's approval and item 5's
  protections would then need a second reviewer.
- BladeBook's security requirements call for deploy access to stay inside AWS, which would
  favour CodePipeline.
- Coaches grow in number, or someone else merges: bring back a gate so the browser flows pass
  before production, not just after.
