/**
 * LOCAL STAND-IN for Cognito sign-in (implementation plan, Question 3). Listed as a shortcut.
 *
 * Asks api-coach's local-only token stub for an ID token shaped like Cognito's and keeps it for this
 * browser tab only (sessionStorage), so closing the tab signs out. Replaced by real Cognito sign-in
 * once the user pool exists.
 */
import { apiFetch } from '../api/client';

const KEY = 'bb.coach.idToken';

function store(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  try {
    return store()?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}

export function signOut(): void {
  try {
    store()?.removeItem(KEY);
  } catch {
    /* nothing kept */
  }
}

export async function signInLocally(loginEmail: string): Promise<string> {
  const { idToken } = await apiFetch<{ idToken: string }>('/api/coach/local/token', {
    method: 'POST',
    body: { loginEmail },
  });
  try {
    store()?.setItem(KEY, idToken);
  } catch {
    /* works for this page load only */
  }
  return idToken;
}
