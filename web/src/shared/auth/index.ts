/**
 * BladeBook's sign-in interface (ADR-023 d11 and its 2026-11-12 amendment). The websites use only this; ./cognito.ts is
 * the one file behind it that imports Amplify, so an upgrade, or another library, touches that file alone, and the tests
 * mock this module, not Amplify. Tokens stay in this browser tab (./storage.ts).
 *
 * Each website has its own app client (ADR-023 d9): the coach website and its rinkside page use `coachAuth`, the family
 * website `familyAuth`.
 */
import { cognitoAuth } from './cognito';

export { AuthFailure } from './errors';
export type { AuthFailureCode } from './errors';

/** What a log-in needs next: nothing, or the email's code (an account that never verified its email). */
export type SignInResult = 'done' | 'confirm-email';

export interface Auth {
  /** Loads the website's sign-in settings (its `config.json`). The other calls wait for it themselves. */
  ready(): Promise<void>;
  /** The ID token for the APIs, refreshed by Cognito when it has expired; null when no one is signed in. */
  idToken(): Promise<string | null>;
  /** A fresh ID token now: after the email is confirmed, so it carries the account's group (ADR-023 d10). */
  refresh(): Promise<string | null>;
  signIn(email: string, password: string): Promise<SignInResult>;
  /** Creates the account; Cognito emails a 6-digit code. */
  signUp(email: string, password: string): Promise<void>;
  /** Confirms the email with its code, then signs in (in the same page load as `signUp`). */
  confirmSignUp(email: string, code: string): Promise<void>;
  resendSignUpCode(email: string): Promise<void>;
  /** Emails a code to set a new password. Answers the same whether or not the email has an account. */
  forgotPassword(email: string): Promise<void>;
  confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void>;
  /** Profile → Account's Change password (the coach's; a family uses forgot password, I32). */
  changePassword(oldPassword: string, newPassword: string): Promise<void>;
  /** Signs in again with the password (ADR-023 d4). A wrong password leaves the current sign-in as it was. */
  confirmPassword(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

let coach: Auth | null = null;
let family: Auth | null = null;

/** The coach website's sign-in, rinkside page included (ADR-023 d2). */
export function coachAuth(): Auth {
  return (coach ??= cognitoAuth('coach'));
}

/** The family website's sign-in. */
export function familyAuth(): Auth {
  return (family ??= cognitoAuth('family'));
}

/** A claim inside a token (display only; the APIs read claims from the verified token). */
function claims(token: string): Record<string, unknown> {
  try {
    const payload = token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** The login email inside a token. */
export function emailFromToken(token: string): string {
  const email = claims(token).email;
  return typeof email === 'string' ? email : '';
}
