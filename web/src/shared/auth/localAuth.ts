/**
 * LOCAL STAND-IN for Cognito sign-in (implementation plan, Question 3). Listed as a shortcut.
 *
 * Asks the API's local-only token stub for an ID token shaped like Cognito's and keeps it for this browser
 * tab only (sessionStorage), so closing the tab signs out. The coach website asks api-coach for a coach
 * token; the family website asks api-client for a family token. No password is checked. Replaced by real
 * Cognito sign-in once the user pool exists.
 */
import { apiFetch } from '../api/client';

export interface LocalSession {
  getToken(): string | null;
  signIn(loginEmail: string): Promise<string>;
  signOut(): void;
}

function store(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function localSession(key: string, endpoint: string): LocalSession {
  return {
    getToken() {
      try {
        return store()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    async signIn(loginEmail: string) {
      const { idToken } = await apiFetch<{ idToken: string }>(endpoint, { method: 'POST', body: { loginEmail } });
      try {
        store()?.setItem(key, idToken);
      } catch {
        /* works for this page load only */
      }
      return idToken;
    },
    signOut() {
      try {
        store()?.removeItem(key);
      } catch {
        /* nothing kept */
      }
    },
  };
}

export const coachSession = localSession('bb.coach.idToken', '/api/coach/local/token');
export const familySession = localSession('bb.family.idToken', '/api/client/local/token');

/* The coach website's names, kept from Batch 1. */
export const getToken = () => coachSession.getToken();
export const signOut = () => coachSession.signOut();
export const signInLocally = (loginEmail: string) => coachSession.signIn(loginEmail);

/** The login email inside a token (display only; the APIs read it from the verified token). */
export function emailFromToken(token: string): string {
  try {
    const payload = token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/');
    return (JSON.parse(atob(payload)) as { email?: string }).email ?? '';
  } catch {
    return '';
  }
}
