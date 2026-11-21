// Points local development at dev's real user pool (ruling I31): reads the identity stack's outputs and writes them where
// the local APIs and the Vite dev server look. Outside the repo, since a new identity stack gives new IDs. Nothing in
// these files is secret: a user pool's ID and its app client IDs are public, as any browser app's are (ADR-023 d11).
//
//   npm run dev-pool [-- --profile bladebook-dev] [-- --stack bladebook-dev-identity]
//
// Writes ~/.bladebook/dev-pool.properties (imported by the APIs' local profile) and ~/.bladebook/dev-pool.json (served
// by the Vite dev server as each website's config.json). Run it again after the identity stack is rebuilt.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const option = (name: string, fallback: string): string => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const profile = option('--profile', 'bladebook-dev');
const stack = option('--stack', 'bladebook-dev-identity');

const raw = execFileSync('aws', ['cloudformation', 'describe-stacks', '--stack-name', stack, '--profile', profile,
  '--query', 'Stacks[0].Outputs', '--output', 'json'], { encoding: 'utf8' });
const outputs = Object.fromEntries((JSON.parse(raw) as { OutputKey: string; OutputValue: string }[])
  .map((o) => [o.OutputKey, o.OutputValue]));
const need = ['UserPoolId', 'Issuer', 'CoachAppClientId', 'FamilyAppClientId'];
const missing = need.filter((k) => !outputs[k]);
if (missing.length) throw new Error(`${stack} has no ${missing.join(', ')} output`);

const region = outputs.UserPoolId.split('_')[0];
const dir = join(homedir(), '.bladebook');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'dev-pool.properties'), [
  `# Written by infra's dev-pool script from ${stack}. Dev's user pool, for the APIs' local profile (I31).`,
  `bladebook.auth.issuer=${outputs.Issuer}`,
  `bladebook.auth.coach-app-client-id=${outputs.CoachAppClientId}`,
  `bladebook.auth.client-app-client-id=${outputs.FamilyAppClientId}`,
  '',
].join('\n'));
writeFileSync(join(dir, 'dev-pool.json'), JSON.stringify({
  region,
  userPoolId: outputs.UserPoolId,
  coachClientId: outputs.CoachAppClientId,
  familyClientId: outputs.FamilyAppClientId,
}, null, 2) + '\n');
console.log(`dev-pool: ${stack} → ~/.bladebook/dev-pool.properties and dev-pool.json (user pool ${outputs.UserPoolId})`);
