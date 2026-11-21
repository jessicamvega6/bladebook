// Dev's seed generator (ADR-028 decisions 2, 4 and 5; Batch 17b). Writes the one file dev's table is created from.
//
// It runs the real application, not a copy of its rules: both APIs start in the local profile against a fresh table on
// DynamoDB Local, and the seed's coaches and families sign up, post schedules, link, get approved and book through the
// same routes the websites use, with the same in-process stand-ins for the event consumers that local runs use. Each
// person signs in through the APIs' test-only token stub (ruling I32): the APIs start from their test classpath
// (`spring-boot:test-run`, profiles `local,stub-tokens`), so the stub never ships. The stub is given the test accounts'
// real Cognito `sub`s (read by email from dev's user pool), so every item belongs to an account you can sign in as. Then the table is scanned into a gzip DynamoDB-JSON import file, its items
// are counted, and the file and its count are uploaded to the account stack's seed bucket.
//
//   node seed/seed.ts [--profile bladebook-dev] [--stack bladebook-dev-identity] [--no-upload] [--skip-build]
//
// Needs Docker (DynamoDB Local), Java 17 and the AWS CLI signed in to dev. Nothing here reads or writes production.

import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { SEED_PREFIX } from '../lib/table.ts';
import { MANIFEST_KEY } from './manifest.ts';
import { COACHES, FAMILIES, type Coach, type Family } from './scenario.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const backend = join(root, 'backend');
const out = join(here, 'out');

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(name);
const option = (name: string, fallback: string): string => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const profile = option('--profile', 'bladebook-dev');
const stack = option('--stack', 'bladebook-dev-identity');

const TABLE = 'bladebook-seed';
const DYNAMO = 'http://localhost:8000';
const COACH_API = 'http://localhost:18080';
const FAMILY_API = 'http://localhost:18081';

// ------------------------------------------------------------------------------------------------- AWS and local tools

function aws(...a: string[]): string {
  return execFileSync('aws', [...a, '--profile', profile, '--output', 'json'], { encoding: 'utf8', maxBuffer: 1 << 28 });
}

/** The AWS CLI against DynamoDB Local: dummy credentials, never a profile, so it can't reach AWS. */
function local(...a: string[]): string {
  const { AWS_PROFILE: _p, AWS_DEFAULT_PROFILE: _d, AWS_SESSION_TOKEN: _t, ...env } = process.env;
  return execFileSync('aws', [...a, '--endpoint-url', DYNAMO, '--region', 'us-east-1', '--output', 'json'], {
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...env, AWS_ACCESS_KEY_ID: 'local', AWS_SECRET_ACCESS_KEY: 'local' },
  });
}

function stackOutputs(): Record<string, string> {
  const s = JSON.parse(aws('cloudformation', 'describe-stacks', '--stack-name', stack)).Stacks[0];
  return Object.fromEntries((s.Outputs ?? []).map((o: { OutputKey: string; OutputValue: string }) => [o.OutputKey, o.OutputValue]));
}

/** `dev-coach-a` → its email and `sub`, from the pool. The tag ends each address's local part (test-accounts.ts). */
function testAccounts(userPoolId: string): Map<string, { email: string; sub: string }> {
  const users = JSON.parse(aws('cognito-idp', 'list-users', '--user-pool-id', userPoolId)).Users as {
    Username: string;
    Attributes: { Name: string; Value: string }[];
  }[];
  const found = new Map<string, { email: string; sub: string }>();
  for (const u of users) {
    const attr = (n: string) => u.Attributes.find((x) => x.Name === n)?.Value;
    const email = attr('email');
    const sub = attr('sub');
    const m = email?.match(/(coach-[a-z]|client-\d+)@/);
    if (email && sub && m) found.set(`dev-${m[1]}`, { email, sub });
  }
  return found;
}

// ------------------------------------------------------------------------------------------------------ the two APIs

const running: ChildProcess[] = [];

/** Starts one API from its test classpath, where the token stub is (ruling I32). Its own process group, so stopping it
 * stops Maven's forked JVM too. */
function startApi(module: string, port: number, subsFile: string): void {
  const runArgs = [`--server.port=${port}`, `--bladebook.table=${TABLE}`, `--bladebook.dynamodb.endpoint=${DYNAMO}`,
    `--bladebook.local.subs-file=${subsFile}`].join(' ');
  const p = spawn('./mvnw', ['-q', '-pl', module, 'spring-boot:test-run', '-Dspring-boot.run.profiles=local,stub-tokens',
    `-Dspring-boot.run.arguments=${runArgs}`], { cwd: backend, detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
  running.push(p);
}

function stopApis(): void {
  for (const p of running) {
    try {
      if (p.pid) process.kill(-p.pid, 'SIGTERM');
    } catch { /* already gone */ }
  }
}

async function waitFor(url: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${url} never answered`);
}

type Json = Record<string, any>;

async function call(base: string, token: string, method: string, path: string, body?: unknown): Promise<Json> {
  const res = await fetch(base + path, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

async function token(base: string, path: string, email: string): Promise<string> {
  const res = await fetch(base + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ loginEmail: email }),
  });
  if (!res.ok) throw new Error(`token for ${email}: ${res.status}`);
  return ((await res.json()) as Json).idToken;
}

// ---------------------------------------------------------------------------------------------------------- the seed

async function seedCoach(c: Coach, email: string): Promise<{ token: string; code: string }> {
  const t = await token(COACH_API, '/api/coach/local/token', email);
  const profile = await call(COACH_API, t, 'POST', '/api/coach/signup', c.signup);
  const current = await call(COACH_API, t, 'GET', '/api/coach/schedule');
  await call(COACH_API, t, 'PUT', '/api/coach/schedule', { scheduleVersion: current.scheduleVersion, templates: c.templates });
  return { token: t, code: profile.coachCode };
}

async function seedFamily(f: Family, email: string, codes: Map<string, string>): Promise<{ token: string; me: Json }> {
  const t = await token(FAMILY_API, '/api/client/local/token', email);
  const code = (name: string) => codes.get(name) ?? (() => { throw new Error(`no coach ${name}`); })();
  const me = await call(FAMILY_API, t, 'POST', '/api/client/registration', {
    ...f.registration,
    coachCodes: [...new Set(f.registration.skaters.flatMap((s) => s.coaches))].map(code),
    skaters: f.registration.skaters.map(({ coaches, ...s }) => ({ ...s, coachCodes: coaches.map(code) })),
  });
  return { token: t, me };
}

/** Books `f.book` free times per skater and coach, the earliest first, skipping any that have started. */
async function book(f: Family, fam: { token: string; me: Json }): Promise<number> {
  const me = await call(FAMILY_API, fam.token, 'GET', '/api/client/me');
  let made = 0;
  for (const skater of me.skaters as Json[]) {
    for (const coach of skater.coaches as Json[]) {
      if (coach.status !== 'ACTIVE') continue;
      const page = await call(FAMILY_API, fam.token, 'GET',
        `/api/client/booking?coachId=${encodeURIComponent(coach.coachId)}&studentId=${encodeURIComponent(skater.studentId)}`);
      const free = (page.times as Json[]).filter((x) => x.free && !x.started);
      // Spread the families out: each starts at its own place in the coach's free times.
      const picks = free.slice(f.offset, f.offset + f.book).map((x) => ({ date: x.date, startTime: x.startTime }));
      if (picks.length === 0) continue;
      const repeat = f.weekly && picks.length === 1;
      await call(FAMILY_API, fam.token, 'POST', '/api/client/bookings', {
        coachId: coach.coachId, studentId: skater.studentId, idempotencyKey: crypto.randomUUID(), picks,
        ...(repeat ? { repeat: true, everyWeeks: 1, until: page.windowLast } : {}),
      });
      made += picks.length;
      if (f.cancelFirst) {
        await call(FAMILY_API, fam.token, 'POST', '/api/client/bookings/cancel', {
          coachId: coach.coachId, studentId: skater.studentId, date: picks[0].date, startTime: picks[0].startTime,
        });
      }
    }
  }
  return made;
}

// ------------------------------------------------------------------------------------------------------- import file

interface Manifest {
  /** Items in the file. The build compares the import's own count with this (ADR-028 decision 5). */
  itemCount: number;
  sha256: string;
  generatedAt: string;
  file: string;
}

function exportTable(): { gz: Buffer; manifest: Manifest } {
  const items = JSON.parse(local('dynamodb', 'scan', '--table-name', TABLE)).Items as Json[];
  // A scan can't return a key twice, but the import would keep one silently if it did (decision 5), so check anyway.
  const keys = new Set<string>();
  for (const it of items) {
    const k = `${it.PK.S}\u0000${it.SK.S}`;
    if (keys.has(k)) throw new Error(`two items share the key ${it.PK.S} / ${it.SK.S}`);
    keys.add(k);
  }
  const gz = gzipSync(items.map((Item) => JSON.stringify({ Item })).join('\n') + '\n');
  return {
    gz,
    manifest: {
      itemCount: items.length,
      sha256: createHash('sha256').update(gz).digest('hex'),
      generatedAt: new Date().toISOString(),
      file: `${SEED_PREFIX}items.json.gz`,
    },
  };
}

function resetTable(): void {
  try {
    local('dynamodb', 'delete-table', '--table-name', TABLE);
  } catch { /* not there */ }
}

// -------------------------------------------------------------------------------------------------------------- main

async function main(): Promise<void> {
  const outputs = stackOutputs();
  const bucket = outputs.SeedBucketName;
  const userPoolId = outputs.UserPoolId;
  if (!userPoolId) throw new Error(`${stack} has no UserPoolId output`);
  const accounts = testAccounts(userPoolId);
  const needed = [...COACHES.map((c) => c.account), ...FAMILIES.map((f) => f.account)];
  const missing = needed.filter((n) => !accounts.has(n));
  if (missing.length) throw new Error(`no test account for ${missing.join(', ')}: deploy ${stack} with testMailbox set`);

  mkdirSync(join(out, SEED_PREFIX), { recursive: true });
  const subsFile = join(out, 'subs.properties');
  writeFileSync(subsFile, needed.map((n) => `${accounts.get(n)!.email}=${accounts.get(n)!.sub}`).join('\n') + '\n', { mode: 0o600 });

  execFileSync('docker', ['compose', 'up', '-d', 'dynamodb-local'], { cwd: root, stdio: 'inherit' });
  await waitFor(DYNAMO).catch(() => undefined); // answers 400 to a bare GET; the delete below proves it's up
  resetTable();
  if (!flag('--skip-build')) execFileSync('./mvnw', ['-q', 'clean', 'install', '-DskipTests'], { cwd: backend, stdio: 'inherit' });

  try {
    startApi('api-coach', 18080, subsFile);
    startApi('api-client', 18081, subsFile);
    await Promise.all([waitFor(`${COACH_API}/api/coach/health`), waitFor(`${FAMILY_API}/api/client/health`)]);

    const coaches = new Map<string, { token: string; code: string }>();
    for (const c of COACHES) coaches.set(c.account, await seedCoach(c, accounts.get(c.account)!.email));
    const codes = new Map([...coaches].map(([k, v]) => [k, v.code]));

    const families = new Map<string, { token: string; me: Json }>();
    for (const f of FAMILIES) families.set(f.account, await seedFamily(f, accounts.get(f.account)!.email, codes));

    // Each coach approves every waiting skater except those the scenario leaves waiting.
    const leftWaiting = new Set(FAMILIES.filter((f) => f.leaveWaiting).map((f) => accounts.get(f.account)!.sub));
    for (const [, c] of coaches) {
      const lists = await call(COACH_API, c.token, 'GET', '/api/coach/students');
      const ids = (lists.pending as Json[]).filter((s) => !leftWaiting.has(s.familyId)).map((s) => s.studentId);
      if (ids.length) await call(COACH_API, c.token, 'POST', '/api/coach/students/approve', { studentIds: ids });
    }

    let booked = 0;
    for (const f of FAMILIES) booked += await book(f, families.get(f.account)!);
    console.log(`seed: ${COACHES.length} coaches, ${FAMILIES.length} families, ${booked} lessons picked`);
  } finally {
    stopApis();
  }

  const { gz, manifest } = exportTable();
  resetTable();
  writeFileSync(join(out, manifest.file), gz);
  writeFileSync(join(out, MANIFEST_KEY), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`seed: ${manifest.itemCount} items → ${join(out, manifest.file)}`);

  if (flag('--no-upload')) return;
  if (!bucket) throw new Error(`${stack} has no SeedBucketName output (seedImport is off for this environment)`);
  // One file under the prefix: the old one goes first, or the import would read both.
  aws('s3', 'rm', `s3://${bucket}/${SEED_PREFIX}`, '--recursive');
  aws('s3', 'cp', join(out, manifest.file), `s3://${bucket}/${manifest.file}`);
  aws('s3', 'cp', join(out, MANIFEST_KEY), `s3://${bucket}/${MANIFEST_KEY}`);
  console.log(`seed: uploaded to s3://${bucket}/${SEED_PREFIX}`);
}

main().catch((e) => {
  stopApis();
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
