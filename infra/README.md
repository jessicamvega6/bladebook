# BladeBook infrastructure (`infra/`)

BladeBook's AWS infrastructure, written with the AWS Cloud Development Kit (CDK) in TypeScript
(ADR-001 A4). Node runs the TypeScript directly, so there is no build step. `cdk-nag` checks
every synth against the AWS Solutions rules and fails it on any finding that has no written
reason (ADR-032).

**Status (Batch 17a, 2026-11-16):** written and tested. In dev, `bladebook-dev-identity` is
deployed. `bladebook-dev-app` waits for the account's CloudFront verification (below), and
`bladebook-dev-deploy-access` waits for the deploy workflow. The rest of Batch 17,
including the table, API and functions, is split into Batches 17b and 17c (`AI/implementation-plan.md`).

## Stacks

Each environment in `lib/config.ts` that has an account ID gets three stacks. Production's
account doesn't exist yet, so only dev's are built.

| Stack | Holds | Lifetime |
|---|---|---|
| `bladebook-dev-identity` | The account stack (ADR-028 d4): the Cognito user pool, the `Coach` and `Client` groups, and the `coach-web` and `family-web` app clients | Built first; kept between dev builds (I16, ADR-028) |
| `bladebook-dev-app` | Both websites (S3 + CloudFront + certificate + DNS records), the data buckets (archive, reports, access-log archive), the access log and its Firehose stream, SES for `dev.bladebook.org`, and the Web Application Firewall (WAF) when switched on | Destroyed when dev's work is done (ADR-027) |
| `bladebook-dev-deploy-access` | GitHub's OpenID Connect (OIDC) provider and the deploy role (ADR-032 d2) | Kept between dev builds |

| Website | Dev | Production |
|---|---|---|
| Coach (rinkside at `/rinkside/`) | `https://app.dev.bladebook.org/` | `https://app.bladebook.org/` |
| Family | `https://family.dev.bladebook.org/` | `https://family.bladebook.org/` |

## Commands

```sh
cd infra
npm ci
npm test            # 23 tests, including a cdk-nag synth of dev and production
npm run typecheck
```

Deploying to dev (by hand: ADR-032 allows hand-run dev builds before the deploy workflow exists):

```sh
aws sso login --sso-session bladebook

# Once per account, before the first deploy: ask AWS Support to verify the account for CloudFront
# (see "New account: CloudFront verification" below).

# Once per account: the roles CDK deploys through.
npx cdk bootstrap aws://793581837527/us-east-1 --profile bladebook-dev

npx cdk deploy bladebook-dev-identity bladebook-dev-app --profile bladebook-dev
npx cdk deploy bladebook-dev-deploy-access --profile bladebook-dev   # when the workflow is added

# Tear down (deletes dev's data: ADR-027 d4's rules apply first). The identity stack is kept.
npx cdk destroy bladebook-dev-app --profile bladebook-dev
```

### New account: CloudFront verification

A new AWS account can't create CloudFront distributions until AWS Support verifies it. Without that
verification, `bladebook-<env>-app` fails with `Your account must be verified before you can add new
CloudFront resources` (403) and rolls back. The identity stack has no CloudFront resources, so it
deploys without verification.

Dev's account (793581837527) was asked on 2026-11-16 (case 179485860000682). **Production's
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
- **No Content Security Policy yet.** One written before the real build is served would likely
  break it. Add it with Batch 17c's upload and test it there.
- **The access-log archive moves to Deep Archive after 30 days**, to match ADR-017's archive.
  ADR-012 doesn't give a day.
- **The WAF matches Cognito's sign-up and sign-in calls by their `X-Amz-Target` header**
  (`SignUp`, `InitiateAuth`, `RespondToAuthChallenge`). Prove it in the block-mode rehearsal.
- **The dev deploy role trusts the GitHub environment `dev`** (`repo:jessicamvega6/bladebook:environment:dev`).
  Production's trusts `production` (ADR-032). The role can only assume CDK's four bootstrap roles.

## Still open

- **Narrowing CDK's bootstrap execution policy.** It defaults to AdministratorAccess (ADR-032 Open).
- **The `/health` rate limit** (ADR-MASTER §21). The WAF has the other six rules.
- **CloudTrail data events.** Dev's trail writes to production's data-loading stack (ADR-027 d4),
  so it is built with production.
- **The archive's expiry** (legal review; at least 210 days) and **the reports bucket's lifecycle**.
- **Production's email domain** and its account ID. Once the account exists, ask for its CloudFront
  verification first (above).
