# BladeBook infrastructure (`infra/`)

BladeBook's AWS infrastructure, written with the AWS Cloud Development Kit (CDK) in TypeScript
(ADR-001 A4). Node runs the TypeScript directly, so there is no build step. `cdk-nag` checks
every synth against the AWS Solutions rules and fails it on any finding that has no written
reason (ADR-032).

**Status (Batch 17b, under way, 2026-11-17):** in dev, `bladebook-dev-identity` and
`bladebook-dev-app` are deployed: the account stack with the test accounts, and the app stack with
both websites (uploaded by the stack since 17c: the coach site at `/` with rinkside at `/rinkside/`, the family
site at `/`), the table built from the seed file, the tenant roles, and the API
(`api-coach` and `api-client` behind API Gateway, served under `/api/*` on each site's host). The
event backbone, the scheduled jobs, the firewall, the alarms and `auth-post-confirmation` followed.
Piece 9 adds the deploy workflow, the bootstrap's data denies and `bladebook-dev-deploy-access`
(see "The deploy workflow" below).

## Stacks

Each environment in `lib/config.ts` that has an account ID gets three stacks. Production's
account doesn't exist yet, so only dev's are built.

| Stack | Holds | Lifetime |
|---|---|---|
| `bladebook-dev-identity` | The account stack (ADR-028 d4): the Cognito user pool, the `Coach` and `Client` groups, the `coach-web` and `family-web` app clients, and in dev the test accounts (3 coaches, 10 families) and the seed file's bucket | Built first; kept between dev builds (I16, ADR-028) |
| `bladebook-dev-app` | The table (in dev, created from the seed bucket's `seed/current/`), both websites (S3 + CloudFront + certificate + DNS records), the data buckets (archive, reports, access-log archive), the access log and its Firehose stream, SES for `dev.bladebook.org`, the tenant roles (`coach-tenant`, `client-tenant`, `code-lookup`) and the API functions' execution roles, the event bus, its Pipe and the seven consumers with their dead-letter queues, the scheduled jobs and their schedules, and the Web Application Firewall (WAF) when switched on | Destroyed when dev's work is done (ADR-027) |
| `bladebook-dev-deploy-access` | GitHub's OpenID Connect (OIDC) provider and the deploy role (ADR-032 d2) | Kept between dev builds |

| Website | Dev | Production |
|---|---|---|
| Coach (rinkside at `/rinkside/`) | `https://app.dev.bladebook.org/` | `https://app.bladebook.org/` |
| Family | `https://family.dev.bladebook.org/` | `https://family.bladebook.org/` |

## Commands

```sh
cd infra
npm ci
npm test            # 31 tests, including a cdk-nag synth of dev and production
npm run typecheck
```

Deploying to dev by hand (ADR-032 allows it, with the owner's own sign-in; the deploy workflow below is the
other way in):

```sh
aws sso login --sso-session bladebook

# Once per account, before the first deploy: ask AWS Support to verify the account for CloudFront
# (see "New account: CloudFront verification" below).

# Once per account, and again whenever lib/data-deny.ts changes: the roles CDK deploys through, with
# AdministratorAccess plus the managed policy that denies reading table items, the access log and the
# data buckets (ADR-032, I13). --dry-run prints the policy and the command.
node bootstrap/bootstrap.ts dev --profile bladebook-dev

npx cdk deploy bladebook-dev-identity --profile bladebook-dev
node seed/seed.ts                      # the seed file (needs Docker and Java 17; see "The seed file")
npx cdk deploy bladebook-dev-app --profile bladebook-dev
node seed/check-import.ts              # ADR-028 d5: destroy the app stack if this fails
npx cdk deploy bladebook-dev-deploy-access --profile bladebook-dev   # GitHub's role: always by hand

# Tear down (deletes dev's data: ADR-027 d4's rules apply first). The identity stack is kept.
npx cdk destroy bladebook-dev-app --profile bladebook-dev
```

### The deploy workflow (ADR-032, I13, I29)

- **The websites (17c):** `npm run build` in `web/` assembles `web/dist-sites/coach/` and `web/dist-sites/family/`
  (`web/scripts/sites.mjs`), and `cdk.json` runs it before each synth, as it runs Maven. The app stack uploads them
  itself (`lib/website.ts`, CDK's `BucketDeployment`): `assets/` with `public, max-age=31536000, immutable`, then the
  pages and rinkside's service worker with `no-cache`, then CloudFront's copies are cleared. Nothing is pruned. GitHub's
  role gets no new permission: the upload runs as CloudFormation. A merge's release carries `websites.tar.gz`, which
  the deploy unpacks into `web/dist-sites/`.

- **Every merge into `main`** runs `.github/workflows/ci.yml`'s checks (backend, web, infra) and then tags a
  version, `v<year>.<month>.<day>.<run>`. The tag's GitHub Release holds the three Lambda archives those
  checks built and their `SHA256SUMS`.
- **`.github/workflows/deploy.yml` is started by hand** from `main` (Actions → Deploy → Run workflow) with a
  tag and an environment. It refuses a tag that isn't on `main`, downloads the tag's archives and checks
  their sums, signs in to AWS through OpenID Connect as `<prefix>-github-deploy`, and runs
  `cdk deploy <prefix>-identity <prefix>-app` with `--app 'node bin/bladebook.ts'` (no Maven build).
  Production's run refuses until production's account ID is in `lib/config.ts`.
- **It never deploys `<prefix>-deploy-access`**, which holds its own role: that stack is deployed by hand.
- **What CDK may do** is set by the bootstrap (above): AdministratorAccess plus `<prefix>-cdk-deny-data`
  (`lib/data-deny.ts`). GitHub's role carries the same denies, and can't assume the lookup role: lookups are
  committed in `cdk.context.json`, and a new one is run once by hand.
- **GitHub settings** (ADR-032 d2, set with `gh` on 2026-11-19):
  - environments `dev` and `production`, each deploying from `main` only; `production` waits for the
    owner's approval;
  - environment secrets: `dev` has `TEST_MAILBOX`; `production` will have `PAGE_PHONE` and `PAGE_EMAIL`;
  - `main`'s ruleset `protect-main`: pull requests only, the `backend`, `web` and `infra` checks, no force
    pushes, and no bypass, the owner included;
  - workflow tokens read-only by default; every action pinned to a full commit hash.

### The owner's test mailbox (dev's test accounts)

Dev's test accounts are tagged addresses on the owner's test mailbox (ADR-027, I15). The repo is
public, so the address is **never written into it**, including `cdk.json` and `cdk.context.json`.
Give it to CDK as context instead: in your own `~/.cdk.json` (`{ "context": { "testMailbox": "…" } }`),
or with `-c testMailbox=…` on each command. The deploy workflow passes it from the `dev` environment's
secret `TEST_MAILBOX`: a secret, not a variable, because a public repository's run logs are public and only
secrets are masked (the workflow masks the mailbox's domain too). Without it, the account stack builds no test accounts and synth prints a warning.

After the first deploy with it set:

- the accounts' shared password is in Secrets Manager (output `TestAccountsPasswordSecret`);
- add the three DKIM CNAME records printed as `TestMailboxDkim1`–`3` on the mailbox's domain, by
  hand, so dev's SES can send to the tagged addresses.

**Build order (ADR-028 d4):** the identity stack, then the seed script writes `seed/current/` in the
seed bucket, then the app stack, whose table is created from that file. Deploying the app stack
before a seed file exists fails.

### The seed file

`seed/seed.ts` writes the one file dev's table is created from (ADR-028). It doesn't write items
itself: it starts both APIs from `backend/` in the local profile against a fresh `bladebook-seed`
table on DynamoDB Local (ports 18080 and 18081, so it doesn't clash with a local run), and the
people in `seed/scenario.ts` sign up, post schedules, link, get approved and book through the
real routes. The local token stub is given the test accounts' real Cognito `sub`s, read by email
from the user pool (`bladebook.local.subs-file`), so every item belongs to an account you can sign
in as. The table is then scanned into `seed/current/items.json.gz` (gzip DynamoDB JSON), its items
are counted into `seed/current.manifest.json`, and both are uploaded to the seed bucket, replacing
the last seed. `--no-upload` stops before the upload; `--skip-build` reuses the built jars.

What's in it: three coaches (one with two-skater lessons), ten families (guardians and adult
skaters, one with two coaches), 18 lessons booked, two weekly series, one cancellation, and two
families left waiting for approval. Payments and attendance need lessons in the past, so the seed
has none yet. Its local copy is in `seed/out/`, which git ignores: it holds the test mailbox's
addresses.

`seed/check-import.ts` then compares the table's import with the manifest: the import must be
complete, with no errors, and must have read and imported exactly the manifest's item count. It
exits 1 otherwise, and the app stack must be destroyed.

### New account: CloudFront verification

A new AWS account can't create CloudFront distributions until AWS Support verifies it. Without that
verification, `bladebook-<env>-app` fails with `Your account must be verified before you can add new
CloudFront resources` (403) and rolls back. The identity stack has no CloudFront resources, so it
deploys without verification.

Dev's account (793581837527) was asked on 2026-11-16 (case 179485860000682) and verified by
2026-11-17, when `bladebook-dev-app` first deployed. **Production's
account needs the same step as soon as it is created, a day or more before its first deploy.**

1. Open AWS Support Center in the new account and choose **Create case**.
2. Choose **Account and billing**, then service **Account** and category **Other Account Issues**
   (or **Activation**). Severity is **General question**.
3. Ask for the account to be verified for CloudFront. Give the account ID, the region (`us-east-1`)
   and the full error message with its request ID. Say what it's for: two static websites in
   private S3 buckets, served through Origin Access Control with ACM certificates.
4. Wait for AWS to confirm, then deploy. A stack that failed and rolled back is
   `ROLLBACK_COMPLETE`, and the next `cdk deploy` replaces it.

The first synth with a sign-in looks up the `dev.bladebook.org` hosted zone and saves the answer
in `cdk.context.json`. Commit that file, so later synths (and CI) don't need the lookup.

## Choices made here that no ADR states

Change any of these in `lib/` and its test together.

- **The tenant roles' policies (`lib/tenant-roles.ts`) are what the gate tests test**
  (`docs/runbooks/database-gate-tests.sh`, run against dev's deployed roles through the dev-only
  `bladebook-dev-gate-test` role, I11; 76 of 76 on 2026-11-20). Change a policy, then re-run them. The allowlists themselves live in one file,
  `backend/core/src/main/resources/bladebook/client-read-allowlist.json`: this stack builds the role from it,
  and core.data's local mode enforces it (`LocalFamilyPolicy`), so a family read or write AWS would refuse
  fails in the backend's tests too (17c, I30). Two details no ADR names: the trust policies also allow
  `sts:SetSourceIdentity`, so each session carries the person's `sub` as its source identity; and
  `coach-tenant` may `BatchGetItem` in its own partition, as `client-tenant` may in its own.
  ADR-MASTER §16 says the policy also refuses `ReturnValuesOnConditionCheckFailure` on the client
  path, but IAM has no condition key for it, so only the ArchUnit rule holds that.
- **`cdk.json`'s app command runs `./mvnw -q -DskipTests package` in `backend/` first** (ADR-001
  decision 2), so every synth, diff and deploy packages the current code: `api-coach` and
  `api-client` are deployed from `backend/<module>/target/<module>-lambda.zip`
  (`backend/lambda-zip.xml`). The tests use a stand-in package instead (`bladebook:placeholderCode`).
- **Email (`lib/email.ts`):** every template in `design/harbor/email/ses/` is loaded into SES under its
  own name, unprefixed (one environment per account). A role's SES permission names its templates one
  by one, is held to the From address (`ses:FromAddress`), and covers any identity, because the
  sandbox also checks the recipient's. `api-coach` may send only `business-email-confirmation`
  (ADR-MASTER §2, I9). Checked in dev, 2026-11-17: SES accepted that template sent to SES's test
  address, and IAM's policy simulator refused another template, another From address, and an
  untemplated `ses:SendEmail`.
- **The access log (`lib/api.ts`):** both API functions get the group's name
  (`BLADEBOOK_ACCESSLOGGROUP`) and `logs:CreateLogStream` and `logs:PutLogEvents` on that group
  only, never a read (ADR-MASTER §18, I12). Each container writes its own stream,
  `<date>/<function>/<random>`. Checked in dev, 2026-11-17: a coach's Students page writes one line
  with API Gateway's request ID, the visitor's address and the field names; the coach's own profile
  writes none.
- **The event backbone (`lib/consumers.ts`):** one Pipe reads the table's stream and puts each record,
  unchanged, on the `<prefix>-events` bus, dropping TTL removals; its own dead-letter queue catches what it
  couldn't put. One rule per named event (`EVENT_PATTERNS`, each tested against sample records and near
  misses) invokes its consumer from `consumers-lambda.zip`. Each consumer has its own role (no
  `AWSLambdaBasicExecutionRole`: its own log group only), DynamoDB actions held by leading key to the
  partitions it touches (ADR-MASTER §2, I22), SES for its own templates only, and one dead-letter queue
  for both the rule and the function (two Lambda retries). 1,024 MB; one minute, five for
  `consumer-schedule-change`.
- **The scheduled jobs (`lib/jobs.ts`):** EventBridge Scheduler runs each `sched-*` function in
  `America/Chicago` with the time it's for (`<aws.scheduler.scheduled-time>`); the job takes that time's
  date. `sched-year-close` is a second schedule on the roller's function. The two reminders and the drift
  check have a dead-letter queue; the roller, year close and sweep report a completion metric instead (CloudWatch's
  embedded metric format, namespace `BladeBook`, by `Function`). The unpaid threshold is the Parameter
  Store setting `/<prefix>/unpaid-reminder/threshold-days`, read on every run; a deploy sets it back
  to `config.ts`'s value. Roles: ADR-MASTER §2, I23.
- **The drift check (`sched-drift-check`, 3:00 AM Central):** reads only (GSI2, and `GetItem` and `Query`
  in each coach's partition). A coach with a batch stuck for over an hour is handed to
  `consumer-schedule-change` (`{"reconcile": "<coachId>"}`, the role's one `lambda:InvokeFunction`),
  which settles the batch and writes any difference as a `RECONCILE` batch. What's left goes out as metrics
  (`DriftReconcileFailed`, `DriftMissedCancellations`, `DriftOutstandingReprices`, `DriftCheckCompleted`)
  for piece 7's alarms; it publishes to no SNS topic itself (owner, 2026-11-18, I25).
- **The TTL archiver (`consumer-ttl-archiver`):** the stream's second reader (with the Pipe), filtered to
  removals by the DynamoDB service. Each old image goes to the archive bucket at
  `coach=<id>/student=<id|none>/type=<itemType>/<date>/<sha256 of the key>.json`, tagged `itemType`, so a
  retried batch rewrites the same objects. Its role may put and tag objects there and read the stream,
  nothing else; it writes no access-log lines, since it reads no one's data for anyone. No dead-letter
  queue (ADR-MASTER §19): Lambda retries a batch until it succeeds, halving it on an error.
  A new archiver's stream connection starts at the stream's newest record and takes a few minutes to
  begin, so a TTL removal in those first minutes isn't archived (seen in dev, 2026-11-18; the second
  test item was archived). Production has no item due that early.
- **The firewall (`lib/firewall.ts`):** one web ACL on the user pool and the API's stage. A request is the
  API's when its Host is API Gateway's (`.execute-api.`); otherwise Cognito's. The API's rules count by the
  visitor's address from `x-bladebook-viewer-ip`; Cognito's by the connecting address; the IP reputation
  list sees Cognito only. `origin-header` refuses any API request without CloudFront's secret, first. The
  `/health` limit is 100 per 5 minutes per address. Dev's is off: `-c waf=block` switches it on for one
  deploy, to rehearse (ADR-MASTER §17); production's can't be switched off.
- **The alarms (`lib/alarms.ts`):** one paging topic, `<prefix>-pages`. Its phone (`-c pagePhone=…`) and,
  until US texts work, its email (`-c pageEmail=…`) are deploy-time settings (I26). On in production; in dev
  `-c alarms=on` switches them on for one deploy, to prove they fire. They page on:
  - a job that didn't run, by its invocations or its completion metric; missing data counts as not run;
  - the drift check's failed finish or missed cancellation (I25);
  - the notifier's and schedule-change's dead-letter queues;
  - the Pipe's queue and its failed runs (Pipes publishes no iterator age), and the archiver falling behind
    the stream (I28);
  - SES bounce and complaint rates;
  - the never-linked counts (a metric filter for the day; a Contributor Insights rule by family, fixed 15 minutes);
  - and, in production, the up-check: two Route 53 health checks from US locations only.

  Everything else is on the `<prefix>-morning` dashboard, the year close included: it doesn't page, and a
  missed one is run by hand (I28).
- **`auth-post-confirmation` (identity stack):** adds `Coach` or `Client` by the app client a new account
  confirmed through, never by anything the person typed (ADR-023 d10). The pool names it by the ARN its
  fixed name gives, so the function can hold both clients' IDs without a dependency loop. One permission,
  `cognito-idp:AdminAddUserToGroup` on this pool; only Cognito, for this pool, may invoke it. 2,048 MB and
  5 seconds, Cognito's own wait, with its call held to 3.5 seconds. Cognito confirms first, so a failure
  leaves the account with no group: its errors page (`post-confirmation-errors`) and the owner adds the group
  by hand (`docs/runbooks/stuck-account.md`, I27).
- **The API functions:** 1,536 MB (memory also buys CPU, which Spring's start needs) and a 29-second
  timeout, API Gateway's own limit. Their logs and the API's access log are kept 30 days.
- **API Gateway's account-wide logging role** is created by this stack and kept when it's destroyed
  (it holds no data, and a rebuilt dev needs it again). Without it the stage can't write access logs.
- **Both API roles may read the origin secret** (`secretsmanager:GetSecretValue` on that one secret,
  ADR-MASTER §2's role table). It's how each API checks CloudFront's header.
- **"United States only" means the 50 states and DC** (CloudFront's `US`). The territories (Puerto
  Rico, Guam, the US Virgin Islands, American Samoa, the Northern Mariana Islands and the minor
  outlying islands) have their own country codes and are refused (owner, 2026-11-17). A visitor
  with no country header is refused too, so a configuration mistake shows at once.
- **No CORS on the API**: the sites call it on their own host through CloudFront.
- **Region `us-east-1`.** The cost model and the gate tests already assume it, and CloudFront's
  certificates must be there.
- **Cognito's Lite plan.** Threat protection (the Plus plan) is replaced by ADR-019's WAF rate rules.
- **Dev's verification codes are sent by Cognito's own sender**, not SES. Dev's SES stays in the
  sandbox, which can only send to verified addresses. Production's sender waits on its email domain.
- **MFA is optional, by authenticator app only** (no text messages).
- **ID and access tokens last 60 minutes.** Refresh tokens: 4 hours for coaches, 60 minutes for
  families (ADR-MASTER §2).
- **Website buckets use SSE-S3, not `aws/s3`.** CloudFront's Origin Access Control (OAC) can't
  decrypt with an AWS-managed key. Data buckets keep `aws/s3` (architecture.md §7).
- **Security headers on both sites:** HTTP Strict Transport Security (HSTS) for two years,
  `nosniff`, no framing, `strict-origin-when-cross-origin`, and a `Permissions-Policy` that turns
  off the camera, microphone and location. Dev adds `X-Robots-Tag: noindex`.
- **The Content Security Policy** (I17, ADR-MASTER §1; `contentSecurityPolicy()` in `lib/website.ts`): only
  BladeBook's own files, plus Cognito for sign-in; Figtree is served from the site. `config.ts`'s `csp` sets it per
  environment: production enforces it, dev sends it as `Content-Security-Policy-Report-Only` until Batch 18's
  real sign-in lets every signed-in page be clicked through (the three sign-in screens reported nothing on
  2026-11-20).
- **The access-log archive moves to Deep Archive after 30 days**, to match ADR-017's archive.
  ADR-012 doesn't give a day.
- **The WAF matches Cognito's sign-up and sign-in calls by their `X-Amz-Target` header**
  (`SignUp`, `InitiateAuth`, `RespondToAuthChallenge`). Prove it in the block-mode rehearsal.
- **The dev deploy role trusts the GitHub environment `dev`** (`repo:jessicamvega6/bladebook:environment:dev`).
  Production's trusts `production` (ADR-032). The role can only assume CDK's deploy and file-publishing roles,
  and carries the data denies too (I13).

## Still open

- **The `/health` rate limit** (ADR-MASTER §21). The WAF has the other six rules.
- **The API behind CloudFront** (I1, 2026-11-17; ADR-019): 17b adds the CloudFront Function that
  passes the visitor's address in a BladeBook header, the API's rate rules counting by it, the
  secret origin header that locks the API to CloudFront, and the US-only rule on both
  distributions: a CloudFront Function answering visitors outside the US with a plain-language
  page (JSON on `/api/*`), not the built-in geographic restriction, whose 403 page would replace
  the API's own 403s. No country rule on Cognito's firewall for now.
- **CloudTrail data events.** Dev's trail writes to production's data-loading stack (ADR-027 d4),
  so it is built with production.
- **The archive's expiry** (legal review; at least 210 days) and **the reports bucket's lifecycle**.
- **Production's email domain** and its account ID. Once the account exists, ask for its CloudFront
  verification first (above).
