// Signs dev's test accounts in for a ZAP scan (ADR-032, amended 2026-11-25; Batch 30c) and writes, for each, the
// env file ZAP's container reads to send that account's ID token to its own host only.
//
//   npm run zap-sign-in [-- --profile bladebook-dev] [-- --account dev-coach-a --account dev-client-1] [-- --out DIR]
//   docker run --env-file ~/.bladebook/zap/dev-coach-a.env … zaproxy/zap-stable@sha256:… …
//
// Dev only: it refuses unless both dev stacks are in dev's AWS account and the identity stack has test accounts.
// Sign-in is Secure Remote Password (SRP), the only flow the app clients allow, through the Amplify version the
// websites use; the shared test password is read from Secrets Manager into memory and never written or printed.
// Tokens last 60 minutes and the API wants a sign-in under 60 minutes old, so run it again before each pass.
// The files go outside the repository (default ~/.bladebook/zap), readable by you only.

import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Amplify } from 'aws-amplify';
import { fetchAuthSession, signIn } from 'aws-amplify/auth';
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito';
import type { KeyValueStorageInterface } from 'aws-amplify/utils';
import { accountOf, addressOf, checkIdToken, DEV_ACCOUNT, testAccount, zapEnvFile, type Site } from './zap-auth.ts';

const args = process.argv.slice(2);
const option = (name: string, fallback: string): string => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const named = args.flatMap((a, i) => (a === '--account' && args[i + 1] ? [args[i + 1]] : []));
const profile = option('--profile', 'bladebook-dev');
const out = option('--out', join(homedir(), '.bladebook', 'zap'));
const accounts = (named.length ? named : ['dev-coach-a', 'dev-client-1']).map(testAccount);

const aws = (...cmd: string[]): string =>
  execFileSync('aws', [...cmd, '--profile', profile, '--output', 'json'], { encoding: 'utf8' });

function stack(name: string): { account: string; outputs: Record<string, string> } {
  const s = (JSON.parse(aws('cloudformation', 'describe-stacks', '--stack-name', name)) as {
    Stacks: { StackId: string; Outputs?: { OutputKey: string; OutputValue: string }[] }[];
  }).Stacks[0];
  return {
    account: accountOf(s.StackId),
    outputs: Object.fromEntries((s.Outputs ?? []).map((o) => [o.OutputKey, o.OutputValue])),
  };
}

const identity = stack('bladebook-dev-identity');
const app = stack('bladebook-dev-app');
for (const [name, s] of [['bladebook-dev-identity', identity], ['bladebook-dev-app', app]] as const) {
  if (s.account !== DEV_ACCOUNT) throw new Error(`${name} is in account ${s.account}, not dev's: refusing`);
}
const secret = identity.outputs.TestAccountsPasswordSecret;
if (!secret) throw new Error('bladebook-dev-identity has no test accounts (TestAccountsPasswordSecret): refusing');

const userPoolId = identity.outputs.UserPoolId;
const clientId: Record<Site, string> = {
  coach: identity.outputs.CoachAppClientId,
  family: identity.outputs.FamilyAppClientId,
};
const host: Record<Site, string> = {
  coach: new URL(app.outputs.CoachSiteUrl).host,
  family: new URL(app.outputs.FamilySiteUrl).host,
};

const password = (JSON.parse(aws('secretsmanager', 'get-secret-value', '--secret-id', secret)) as {
  SecretString: string;
}).SecretString;

const emails = (group: string): string[] =>
  (JSON.parse(aws('cognito-idp', 'list-users-in-group', '--user-pool-id', userPoolId, '--group-name', group)) as {
    Users: { Attributes?: { Name: string; Value: string }[] }[];
  }).Users.flatMap((u) => u.Attributes?.filter((a) => a.Name === 'email').map((a) => a.Value) ?? []);

/** Amplify keeps its tokens here: in this process's memory only, gone when it exits. */
class MemoryStorage implements KeyValueStorageInterface {
  private readonly items = new Map<string, string>();
  async setItem(key: string, value: string): Promise<void> { this.items.set(key, value); }
  async getItem(key: string): Promise<string | null> { return this.items.get(key) ?? null; }
  async removeItem(key: string): Promise<void> { this.items.delete(key); }
  async clear(): Promise<void> { this.items.clear(); }
}

mkdirSync(out, { recursive: true, mode: 0o700 });
chmodSync(out, 0o700);

for (const account of accounts) {
  // A fresh configuration and store per account, so one account's session can't carry into the next.
  Amplify.configure({ Auth: { Cognito: { userPoolId, userPoolClientId: clientId[account.site], loginWith: { email: true } } } });
  cognitoUserPoolsTokenProvider.setKeyValueStorage(new MemoryStorage());

  const username = addressOf(account.name, emails(account.group));
  const result = await signIn({ username, password, options: { authFlowType: 'USER_SRP_AUTH' } });
  if (result.nextStep.signInStep !== 'DONE') {
    // A second factor (Batch 28) or a forced reset: a scan can't answer either.
    throw new Error(`${account.name}: sign-in stopped at ${result.nextStep.signInStep}`);
  }
  const idToken = (await fetchAuthSession()).tokens?.idToken?.toString();
  if (!idToken) throw new Error(`${account.name}: signed in but no ID token`);
  const expires = checkIdToken(idToken, account, clientId[account.site]);

  const file = join(out, `${account.name}.env`);
  writeFileSync(file, zapEnvFile(account, host[account.site], idToken, expires), { mode: 0o600 });
  chmodSync(file, 0o600);
  console.log(`zap-sign-in: ${account.name} → ${file} (${host[account.site]}, until ${expires.toLocaleTimeString()})`);
}
