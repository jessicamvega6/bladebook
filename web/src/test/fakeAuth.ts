/**
 * Test code only: a stand-in for the sign-in interface (shared/auth), so the tests exercise the forms and the apps
 * without Amplify or Cognito (ADR-023, amended 2026-11-12: "tests mock the interface, not Amplify"). Registered for
 * every test in setup.ts. Each website's sign-in keeps its own state, like the real ones.
 *
 * Rules, so tests can reach each answer Cognito gives:
 * - the password `wrong` is refused; an email in `unconfirmed` gets `confirm-email`;
 * - sign-up refuses an email in `taken`; the code `123456` is right, any other is wrong;
 * - every sign-in makes a token carrying the email, readable by emailFromToken.
 */
import type { Auth } from '../shared/auth';
import { failure } from '../shared/auth/errors';

export interface FakeAuth extends Auth {
  token: string | null;
  calls: string[];
  taken: Set<string>;
  unconfirmed: Set<string>;
  /** Starts the test signed in, as a tab that already was. */
  signedInAs(email: string): string;
  reset(): void;
}

let n = 0;

/** An ID token's shape, with the email in its claims (not signed: the tests' APIs are fetch mocks). */
export function tokenFor(email: string): string {
  n += 1;
  return `h.${btoa(JSON.stringify({ email, n }))}.s`;
}

function fake(): FakeAuth {
  const a: FakeAuth = {
    token: null,
    calls: [],
    taken: new Set(),
    unconfirmed: new Set(),
    signedInAs(email) {
      a.token = tokenFor(email);
      return a.token;
    },
    reset() {
      a.token = null;
      a.calls = [];
      a.taken = new Set();
      a.unconfirmed = new Set();
    },
    async ready() { /* nothing to load */ },
    async idToken() { return a.token; },
    async refresh() { return a.token; },
    async signIn(email, password) {
      a.calls.push(`signIn ${email}`);
      if (password === 'wrong') throw failure('WRONG_PASSWORD');
      if (a.unconfirmed.has(email.trim())) return 'confirm-email';
      a.token = tokenFor(email.trim());
      return 'done';
    },
    async signUp(email) {
      a.calls.push(`signUp ${email}`);
      if (a.taken.has(email.trim())) throw failure('EMAIL_TAKEN');
      a.unconfirmed.add(email.trim());
    },
    async confirmSignUp(email, code) {
      a.calls.push(`confirmSignUp ${email} ${code}`);
      if (code !== '123456') throw failure('WRONG_CODE');
      a.unconfirmed.delete(email.trim());
      a.token = tokenFor(email.trim());
    },
    async resendSignUpCode(email) { a.calls.push(`resendSignUpCode ${email}`); },
    async forgotPassword(email) { a.calls.push(`forgotPassword ${email}`); },
    async confirmForgotPassword(email, code) {
      a.calls.push(`confirmForgotPassword ${email} ${code}`);
      if (code !== '123456') throw failure('WRONG_CODE');
    },
    async changePassword(oldPassword) {
      a.calls.push('changePassword');
      if (oldPassword === 'wrong') throw failure('WRONG_PASSWORD');
    },
    async confirmPassword(email, password) {
      a.calls.push(`confirmPassword ${email}`);
      if (password === 'wrong') throw failure('WRONG_PASSWORD');
      a.token = tokenFor(email);
    },
    async signOut() {
      a.calls.push('signOut');
      a.token = null;
    },
  };
  return a;
}

export const fakes = { coach: fake(), family: fake() };
