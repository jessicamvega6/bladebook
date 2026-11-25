import { describe, expect, it } from 'vitest';
import { accountOf, addressOf, checkIdToken, testAccount, zapEnvFile } from './zap-auth.ts';

const jwt = (claims: object): string =>
  ['e30', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'sig'].join('.');

describe('testAccount', () => {
  it('maps a coach to the coach site and group', () => {
    expect(testAccount('dev-coach-a')).toEqual({ name: 'dev-coach-a', site: 'coach', group: 'Coach' });
  });
  it('maps a family to the family site and the Client group', () => {
    expect(testAccount('dev-client-10')).toEqual({ name: 'dev-client-10', site: 'family', group: 'Client' });
  });
  it.each(['coach-a', 'dev-coach-ab', 'dev-client-0', 'prod-coach-a', ''])('refuses %j', (name) => {
    expect(() => testAccount(name)).toThrow(/isn't a dev test account/);
  });
});

describe('accountOf', () => {
  it('reads the account from a stack ID', () => {
    expect(accountOf('arn:aws:cloudformation:us-east-1:793581837527:stack/bladebook-dev-app/abc')).toBe('793581837527');
  });
  it('refuses anything else', () => {
    expect(() => accountOf('bladebook-dev-app')).toThrow(/not a stack ID/);
  });
});

describe('addressOf', () => {
  const untagged = ['box+dev-coach-a@example.test', 'box+dev-coach-b@example.test'];
  const tagged = ['box+dev-client-1@example.test', 'box+dev-client-11@example.test'];

  it('finds the address when the mailbox has no tag', () => {
    expect(addressOf('dev-coach-b', untagged)).toBe('box+dev-coach-b@example.test');
  });
  it('finds the address when the mailbox already carries a tag', () => {
    expect(addressOf('dev-coach-a', ['box+qa-coach-a@example.test'])).toBe('box+qa-coach-a@example.test');
  });
  it('tells client-1 from client-11', () => {
    expect(addressOf('dev-client-1', tagged)).toBe('box+dev-client-1@example.test');
  });
  it('refuses when no address matches', () => {
    expect(() => addressOf('dev-coach-c', untagged)).toThrow(/no matching account/);
  });
  it('refuses when two match', () => {
    expect(() => addressOf('dev-coach-a', ['a+dev-coach-a@x.test', 'b+dev-coach-a@x.test'])).toThrow(/more than one/);
  });
  it('ignores an address with no tag', () => {
    expect(() => addressOf('dev-coach-a', ['coach-a@x.test'])).toThrow(/no matching account/);
  });
});

describe('checkIdToken', () => {
  const coach = testAccount('dev-coach-a');
  const good = { token_use: 'id', aud: 'coach-client', exp: 1_800_000_000, 'cognito:groups': ['Coach'] };

  it('returns the expiry of a good token', () => {
    expect(checkIdToken(jwt(good), coach, 'coach-client')).toEqual(new Date(1_800_000_000_000));
  });
  it('refuses an access token', () => {
    expect(() => checkIdToken(jwt({ ...good, token_use: 'access' }), coach, 'coach-client')).toThrow(/not an ID token/);
  });
  it("refuses another app client's token", () => {
    expect(() => checkIdToken(jwt(good), coach, 'family-client')).toThrow(/another app client/);
  });
  it('refuses a token without the group', () => {
    expect(() => checkIdToken(jwt({ ...good, 'cognito:groups': ['Client'] }), coach, 'coach-client')).toThrow(/Coach group/);
    expect(() => checkIdToken(jwt({ ...good, 'cognito:groups': undefined }), coach, 'coach-client')).toThrow(/Coach group/);
  });
  it('refuses something that is not a token', () => {
    expect(() => checkIdToken('nonsense', coach, 'coach-client')).toThrow(/not a JSON Web Token/);
  });
});

describe('zapEnvFile', () => {
  it('limits the header to the one host', () => {
    const text = zapEnvFile(testAccount('dev-client-1'), 'family.dev.bladebook.org', 'tok', new Date(0));
    expect(text).toContain('ZAP_AUTH_HEADER=Authorization\n');
    expect(text).toContain('ZAP_AUTH_HEADER_VALUE=Bearer tok\n');
    expect(text).toContain('ZAP_AUTH_HEADER_SITE=family.dev.bladebook.org\n');
  });
});
