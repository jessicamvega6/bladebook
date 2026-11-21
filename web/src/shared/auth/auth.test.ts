/**
 * The sign-in interface's own file behind Amplify (./cognito.ts), with Amplify replaced: tokens stay in the tab, never
 * localStorage (ADR-023, amended 2026-11-12); every sign-in is SRP (d11); a wrong password when signing in again changes
 * nothing (d4); Cognito's answers come back in BladeBook's words.
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { KEY_PREFIX, TabStorage, addWrongPassword, clearWrongPasswords, wrongPasswords } from './storage';

vi.unmock('./cognito');

const amplify = vi.hoisted(() => ({
  storage: null as null | { setItem(k: string, v: string): Promise<void>; getItem(k: string): Promise<string | null> },
  configure: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(async () => undefined),
  fetchAuthSession: vi.fn(),
}));

vi.mock('aws-amplify', () => ({ Amplify: { configure: amplify.configure } }));
vi.mock('aws-amplify/auth/cognito', () => ({
  cognitoUserPoolsTokenProvider: { setKeyValueStorage: (s: typeof amplify.storage) => { amplify.storage = s; } },
}));
vi.mock('aws-amplify/auth', () => ({
  signIn: amplify.signIn,
  signOut: amplify.signOut,
  fetchAuthSession: amplify.fetchAuthSession,
  autoSignIn: vi.fn(), confirmResetPassword: vi.fn(), confirmSignUp: vi.fn(), resendSignUpCode: vi.fn(),
  resetPassword: vi.fn(), signUp: vi.fn(), updatePassword: vi.fn(),
}));

const KEY = `${KEY_PREFIX}client123.dana.idToken`;

/** Amplify's sign-in as it behaves: a right password writes the new tokens to the storage it was given. */
function signInWrites(token: string) {
  amplify.signIn.mockImplementation(async ({ password }: { password: string }) => {
    if (password === 'wrong') throw Object.assign(new Error('Incorrect username or password.'), { name: 'NotAuthorizedException' });
    await amplify.storage!.setItem(KEY, token);
    return { isSignedIn: true, nextStep: { signInStep: 'DONE' } };
  });
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ region: 'us-east-1', userPoolId: 'us-east-1_X', appClientId: 'client123' }))));
  amplify.fetchAuthSession.mockImplementation(async () => {
    const t = await amplify.storage!.getItem(KEY);
    return { tokens: t ? { idToken: { toString: () => t } } : undefined };
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function auth() {
  vi.resetModules();
  const { cognitoAuth } = await import('./cognito');
  return cognitoAuth('coach');
}

test('it configures the website\'s own app client and keeps the tokens in this tab, never localStorage', async () => {
  signInWrites('tok-1');
  const a = await auth();
  expect(await a.signIn('dana@example.com', 'Right-pw1')).toBe('done');
  expect(amplify.configure).toHaveBeenCalledWith({
    Auth: { Cognito: { userPoolId: 'us-east-1_X', userPoolClientId: 'client123', loginWith: { email: true } } },
  });
  expect(amplify.storage?.constructor.name).toBe('TabStorage');
  expect(sessionStorage.getItem(KEY)).toBe('tok-1');
  expect(localStorage.length).toBe(0);
  expect(await a.idToken()).toBe('tok-1');
});

test('every sign-in is Secure Remote Password, so the password never leaves the browser', async () => {
  signInWrites('tok-1');
  const a = await auth();
  await a.signIn('dana@example.com', 'Right-pw1');
  await a.confirmPassword('dana@example.com', 'Right-pw1');
  for (const [input] of amplify.signIn.mock.calls) expect(input.options).toEqual({ authFlowType: 'USER_SRP_AUTH' });
});

test('signing in again with a wrong password leaves the tab signed in as it was; a right one replaces the tokens', async () => {
  signInWrites('tok-1');
  const a = await auth();
  await a.signIn('dana@example.com', 'Right-pw1');

  signInWrites('tok-2');
  await expect(a.confirmPassword('dana@example.com', 'wrong')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
  expect(sessionStorage.getItem(KEY)).toBe('tok-1');
  expect(await a.idToken()).toBe('tok-1');

  await a.confirmPassword('dana@example.com', 'Right-pw1');
  expect(sessionStorage.getItem(KEY)).toBe('tok-2');
  expect(await a.idToken()).toBe('tok-2');
  expect(amplify.signOut).toHaveBeenCalledTimes(1); // only the first log-in's clean start: signing in again never signs out
});

test('Cognito asking for an MFA code gets a plain message until Batch 28 (I32)', async () => {
  amplify.signIn.mockResolvedValue({ isSignedIn: false, nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_TOTP_CODE' } });
  const a = await auth();
  await expect(a.signIn('dana@example.com', 'Right-pw1')).rejects.toMatchObject({ code: 'MFA' });
});

test('an account that never verified its email is sent to the code', async () => {
  amplify.signIn.mockResolvedValue({ isSignedIn: false, nextStep: { signInStep: 'CONFIRM_SIGN_UP' } });
  const a = await auth();
  expect(await a.signIn('dana@example.com', 'Right-pw1')).toBe('confirm-email');
});

test('Cognito\'s answers in BladeBook\'s words; an unknown email reads like a wrong password', async () => {
  const { toFailure, AuthFailure: Failure } = await import('./errors');
  const named = (name: string, message = '') => Object.assign(new Error(message), { name });
  expect(toFailure(named('UserNotFoundException')).message).toBe(toFailure(named('NotAuthorizedException')).message);
  expect(toFailure(named('NotAuthorizedException', 'Password attempts exceeded')).code).toBe('TOO_MANY');
  expect(toFailure(named('UsernameExistsException')).code).toBe('EMAIL_TAKEN');
  expect(toFailure(named('CodeMismatchException')).code).toBe('WRONG_CODE');
  expect(toFailure(named('ExpiredCodeException')).code).toBe('CODE_EXPIRED');
  expect(toFailure(new TypeError('Failed to fetch')).code).toBe('NETWORK');
  expect(toFailure(named('SomethingNew'))).toBeInstanceOf(Failure);
  expect(toFailure(named('SomethingNew')).code).toBe('OTHER');
});

test('the tab storage: staged writes stay in memory until committed; clear removes only the sign-in\'s keys', async () => {
  const s = new TabStorage();
  sessionStorage.setItem('bb.other', 'kept');
  await s.setItem(KEY, 'a');
  s.stage();
  expect(await s.getItem(KEY)).toBeNull(); // staged, the sign-in sees no one signed in
  await s.setItem(KEY, 'b');
  expect(sessionStorage.getItem(KEY)).toBe('a');
  s.discard();
  expect(await s.getItem(KEY)).toBe('a');
  s.stage();
  await s.setItem(KEY, 'c');
  s.commit();
  expect(sessionStorage.getItem(KEY)).toBe('c');
  await s.clear();
  expect(sessionStorage.getItem(KEY)).toBeNull();
  expect(sessionStorage.getItem('bb.other')).toBe('kept');
  expect(localStorage.length).toBe(0);
});

test('wrong passwords in a row are counted in this tab, next to the sign-in, and go with it (I33)', async () => {
  const s = new TabStorage();
  expect(wrongPasswords()).toBe(0);
  expect(addWrongPassword()).toBe(1);
  expect(addWrongPassword()).toBe(2);
  expect(new TabStorage() && wrongPasswords()).toBe(2);           // a reload reads the same count
  expect(localStorage.length).toBe(0);
  clearWrongPasswords();                                           // a right password
  expect(wrongPasswords()).toBe(0);
  addWrongPassword();
  s.stage();
  await s.clear();                                                 // staged: the tab is left alone
  s.discard();
  expect(wrongPasswords()).toBe(1);
  await s.clear();                                                 // signing out
  expect(wrongPasswords()).toBe(0);
});

test('logging out clears this tab\'s sign-in even when Cognito never answers the revoke', async () => {
  signInWrites('tok-1');
  const a = await auth();
  await a.signIn('dana@example.com', 'Right-pw1');
  amplify.signOut.mockImplementation(() => new Promise(() => { /* offline: the revoke never answers */ }));
  vi.useFakeTimers();
  try {
    const out = a.signOut();
    await vi.advanceTimersByTimeAsync(3000);
    await out;
  } finally {
    vi.useRealTimers();
  }
  expect(sessionStorage.getItem(KEY)).toBeNull();
  expect(await a.idToken()).toBeNull();
});
