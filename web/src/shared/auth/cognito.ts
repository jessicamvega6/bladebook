/**
 * The only file that imports Amplify (ADR-023, amended 2026-11-12): its Auth module, pinned to an exact version, signing
 * in with Secure Remote Password (SRP), so the password never leaves the browser, not even to Cognito. Everything
 * else uses the `Auth` interface in ./index.ts, and the tests mock that, not Amplify.
 *
 * Passwords and codes go from here to Cognito only, never to `api-coach` or `api-client` (ADR-023 d11); the APIs see
 * only the ID token Cognito returns.
 */
import { Amplify } from 'aws-amplify';
import {
  autoSignIn,
  confirmResetPassword,
  confirmSignUp,
  fetchAuthSession,
  resendSignUpCode,
  resetPassword,
  signIn,
  signOut,
  signUp,
  updatePassword,
} from 'aws-amplify/auth';
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito';
import type { Auth, SignInResult } from './index';
import { loadConfig, type Site } from './config';
import { failure, toFailure } from './errors';
import { TabStorage } from './storage';

const SRP = 'USER_SRP_AUTH' as const;

/** Cognito's next steps that mean a second factor (I32: Batch 28 builds MFA; until then, a plain message). */
const MFA_STEPS = new Set([
  'CONFIRM_SIGN_IN_WITH_TOTP_CODE', 'CONTINUE_SIGN_IN_WITH_TOTP_SETUP', 'CONFIRM_SIGN_IN_WITH_SMS_CODE',
  'CONFIRM_SIGN_IN_WITH_EMAIL_CODE', 'CONTINUE_SIGN_IN_WITH_MFA_SELECTION', 'CONTINUE_SIGN_IN_WITH_MFA_SETUP_SELECTION',
  'CONTINUE_SIGN_IN_WITH_EMAIL_SETUP',
]);

function step(next: { signInStep: string }): SignInResult {
  if (next.signInStep === 'DONE') return 'done';
  if (next.signInStep === 'CONFIRM_SIGN_UP') return 'confirm-email';
  if (MFA_STEPS.has(next.signInStep)) throw failure('MFA');
  if (next.signInStep === 'RESET_PASSWORD') throw failure('RESET_REQUIRED');
  throw failure('OTHER');
}

export function cognitoAuth(site: Site): Auth {
  const storage = new TabStorage();
  let configured: Promise<void> | null = null;
  // The last ID token handed out: kept while a sign-in again is staged, so requests already in flight still carry one.
  let last: string | null = null;
  let staging = false;

  const ready = (): Promise<void> => {
    configured ??= loadConfig(site).then((c) => {
      Amplify.configure({
        Auth: { Cognito: { userPoolId: c.userPoolId, userPoolClientId: c.appClientId, loginWith: { email: true } } },
      });
      // Tab storage, set explicitly: never Amplify's default, localStorage (ADR-023, 2026-11-12).
      cognitoUserPoolsTokenProvider.setKeyValueStorage(storage);
    }).catch((e: unknown) => {
      configured = null;
      throw e;
    });
    return configured;
  };

  const call = async <T>(fn: () => Promise<T>): Promise<T> => {
    await ready();
    try {
      return await fn();
    } catch (e) {
      throw toFailure(e);
    }
  };

  const idToken = async (forceRefresh = false): Promise<string | null> => {
    if (staging) return last;
    await ready();
    try {
      const session = await fetchAuthSession({ forceRefresh });
      last = session.tokens?.idToken?.toString() ?? null;
    } catch {
      last = null;
    }
    return last;
  };

  return {
    ready,
    idToken: () => idToken(),
    refresh: () => idToken(true),

    async signIn(email, password) {
      return call(async () => {
        // A sign-in left in this tab (another account, an expired one) mustn't block a new one.
        await signOut().catch(() => undefined);
        const r = await signIn({ username: email.trim(), password, options: { authFlowType: SRP } });
        return step(r.nextStep);
      });
    },

    async signUp(email, password) {
      await call(() => signUp({
        username: email.trim(),
        password,
        options: { userAttributes: { email: email.trim() }, autoSignIn: { authFlowType: SRP } },
      }));
    },

    async confirmSignUp(email, code) {
      await call(async () => {
        const r = await confirmSignUp({ username: email.trim(), confirmationCode: code });
        // The account is confirmed and auth-post-confirmation has given it its group (ADR-023 d10); signing in now
        // gets tokens that carry it. On a reload the password is gone, so the person logs in instead.
        if (r.nextStep.signUpStep === 'COMPLETE_AUTO_SIGN_IN') step((await autoSignIn()).nextStep);
      });
    },

    async resendSignUpCode(email) {
      await call(() => resendSignUpCode({ username: email.trim() }));
    },

    async forgotPassword(email) {
      await call(() => resetPassword({ username: email.trim() }));
    },

    async confirmForgotPassword(email, code, newPassword) {
      await call(() => confirmResetPassword({ username: email.trim(), confirmationCode: code, newPassword }));
    },

    async changePassword(oldPassword, newPassword) {
      await call(() => updatePassword({ oldPassword, newPassword }));
    },

    async confirmPassword(email, password) {
      // Signing in again (ADR-023 d4): staged, so a wrong password leaves this tab signed in as it was.
      await ready();
      staging = true;
      storage.stage();
      try {
        const r = await signIn({ username: email.trim(), password, options: { authFlowType: SRP } });
        step(r.nextStep);
        storage.commit();
      } catch (e) {
        storage.discard();
        throw toFailure(e);
      } finally {
        staging = false;
      }
      await idToken();
    },

    async signOut() {
      last = null;
      await ready().catch(() => undefined);
      // Amplify revokes the refresh token at Cognito first and only then clears the tab, without waiting for the clear;
      // a page left in between stayed signed in (found in the 2026-11-20 check). So: wait for the revoke, at most
      // 3 seconds (offline it never comes), then clear the tab's sign-in ourselves.
      await Promise.race([signOut().catch(() => undefined), new Promise((r) => setTimeout(r, 3000))]);
      await storage.clear();
    },
  };
}
