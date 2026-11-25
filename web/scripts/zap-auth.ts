// The parts of zap-sign-in.ts that need no AWS: which account is dev, which test address is whose, what a token
// must say, and the env file ZAP reads. Kept apart so they can be tested (zap-auth.test.ts).

/** Dev's AWS account (infra/lib/config.ts, `dev.account`). The script refuses any other: ZAP never meets production. */
export const DEV_ACCOUNT = '793581837527';

export type Site = 'coach' | 'family';

export interface TestAccount {
  /** `dev-coach-a`, `dev-client-1`: the names infra/lib/test-accounts.ts gives them. */
  readonly name: string;
  readonly site: Site;
  /** The Cognito group the stack puts it in. */
  readonly group: 'Coach' | 'Client';
}

export function testAccount(name: string): TestAccount {
  if (/^dev-coach-[a-z]$/.test(name)) return { name, site: 'coach', group: 'Coach' };
  if (/^dev-client-[1-9][0-9]*$/.test(name)) return { name, site: 'family', group: 'Client' };
  throw new Error(`${name} isn't a dev test account (dev-coach-a…, dev-client-1…)`);
}

/** The AWS account in a CloudFormation stack ID (`arn:aws:cloudformation:<region>:<account>:stack/…`). */
export function accountOf(stackId: string): string {
  const account = stackId.split(':')[4];
  if (!account || !/^\d{12}$/.test(account)) throw new Error(`not a stack ID: ${stackId}`);
  return account;
}

/**
 * The address infra/lib/test-accounts.ts gave `name`, picked from the group's addresses. The test mailbox is a
 * deploy-time setting the repository never holds, so the address is found, not built: `box+dev-coach-a@…`, or
 * `box+<tag>-coach-a@…` when the mailbox already carries a tag.
 */
export function addressOf(name: string, emails: readonly string[]): string {
  const short = name.replace(/^dev-/, '');
  const matches = emails.filter((email) => {
    const local = email.slice(0, email.lastIndexOf('@'));
    const plus = local.indexOf('+');
    if (plus < 0) return false;
    const tag = local.slice(plus + 1);
    return tag === name || tag.endsWith(`-${short}`);
  });
  if (matches.length !== 1) {
    throw new Error(`${name}: ${matches.length === 0 ? 'no' : 'more than one'} matching account in its group`);
  }
  return matches[0];
}

interface IdClaims {
  readonly aud: string;
  readonly exp: number;
  readonly token_use: string;
  readonly 'cognito:groups'?: readonly string[];
}

function claims(jwt: string): IdClaims {
  const payload = jwt.split('.')[1];
  if (!payload) throw new Error('not a JSON Web Token');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as IdClaims;
}

/**
 * Checks the ID token is what the API will accept for this account (its own app client, its group) and returns when
 * it expires. The API also wants a sign-in under 60 minutes old (`auth_time`), so a refresh doesn't extend a scan:
 * sign in again.
 */
export function checkIdToken(jwt: string, account: TestAccount, appClientId: string): Date {
  const c = claims(jwt);
  if (c.token_use !== 'id') throw new Error(`${account.name}: not an ID token`);
  if (c.aud !== appClientId) throw new Error(`${account.name}: token is for another app client`);
  if (!c['cognito:groups']?.includes(account.group)) throw new Error(`${account.name}: not in the ${account.group} group`);
  return new Date(c.exp * 1000);
}

/**
 * ZAP's container reads these (`docker run --env-file …`) and adds the header to every request to that host only,
 * so the token never goes anywhere but dev.
 */
export function zapEnvFile(account: TestAccount, host: string, idToken: string, expires: Date): string {
  return [
    `# ${account.name} (${account.group}) on ${host}. Written by web/scripts/zap-sign-in.ts. Expires ${expires.toISOString()}.`,
    '# A live sign-in token: never commit it or paste it into a public run log.',
    'ZAP_AUTH_HEADER=Authorization',
    `ZAP_AUTH_HEADER_VALUE=Bearer ${idToken}`,
    `ZAP_AUTH_HEADER_SITE=${host}`,
    '',
  ].join('\n');
}
