// Bootstraps one account for CDK with the data denies (ADR-032, amended 2026-11-17, I13). Run by hand, once per
// account and again whenever lib/data-deny.ts changes:
//
//   node bootstrap/bootstrap.ts dev --profile bladebook-dev
//
// 1. Writes the deny policy (lib/data-deny.ts) to the account as the managed policy `<prefix>-cdk-deny-data`,
//    or as its new default version if it exists (keeping at most the 5 versions IAM allows).
// 2. Runs `cdk bootstrap` with AdministratorAccess plus that policy as CloudFormation's execution policies.
//
// `--dry-run` prints the policy and the commands without running them.

import { execFileSync } from 'node:child_process';
import { environments } from '../lib/config.ts';
import { dataDenyPolicy, dataDenyPolicyName } from '../lib/data-deny.ts';

const args = process.argv.slice(2);
const envName = args[0];
const profileAt = args.indexOf('--profile');
const profile = profileAt >= 0 ? args[profileAt + 1] : undefined;
const dryRun = args.includes('--dry-run');

const cfg = environments.find((e) => e.envName === envName);
if (!cfg) throw new Error(`usage: node bootstrap/bootstrap.ts <${environments.map((e) => e.envName).join('|')}> --profile <profile> [--dry-run]`);
if (!cfg.account) throw new Error(`${cfg.envName}: no account ID in lib/config.ts yet`);
if (!profile && !dryRun) throw new Error('--profile is required');

const name = dataDenyPolicyName(cfg);
const arn = `arn:aws:iam::${cfg.account}:policy/${name}`;
const document = JSON.stringify(dataDenyPolicy(cfg));
const withProfile = profile ? ['--profile', profile] : [];

function aws(...a: string[]): string {
  return execFileSync('aws', [...a, ...withProfile, '--output', 'json'], { encoding: 'utf8' });
}

if (dryRun) {
  console.log(JSON.stringify(dataDenyPolicy(cfg), null, 2));
} else {
  const caller = JSON.parse(aws('sts', 'get-caller-identity')).Account;
  if (caller !== cfg.account) throw new Error(`profile ${profile} is account ${caller}, not ${cfg.envName}'s ${cfg.account}`);
  let exists = true;
  try {
    aws('iam', 'get-policy', '--policy-arn', arn);
  } catch {
    exists = false;
  }
  if (!exists) {
    aws('iam', 'create-policy', '--policy-name', name, '--policy-document', document,
      '--description', 'BladeBook: no deploy reads table items, the access log or the data buckets (ADR-032, I13)');
    console.log(`created ${name}`);
  } else {
    const versions = JSON.parse(aws('iam', 'list-policy-versions', '--policy-arn', arn)).Versions as
      { VersionId: string; IsDefaultVersion: boolean; CreateDate: string }[];
    const old = versions.filter((v) => !v.IsDefaultVersion).sort((a, b) => a.CreateDate.localeCompare(b.CreateDate));
    if (versions.length >= 5) aws('iam', 'delete-policy-version', '--policy-arn', arn, '--version-id', old[0]!.VersionId);
    aws('iam', 'create-policy-version', '--policy-arn', arn, '--policy-document', document, '--set-as-default');
    console.log(`updated ${name}`);
  }
}

const bootstrap = [
  'cdk', 'bootstrap', `aws://${cfg.account}/${cfg.region}`,
  '--cloudformation-execution-policies', `arn:aws:iam::aws:policy/AdministratorAccess,${arn}`,
  ...withProfile,
];
console.log(`npx ${bootstrap.join(' ')}`);
if (!dryRun) execFileSync('npx', bootstrap, { stdio: 'inherit' });
