/**
 * Where the sign-in keeps its tokens: this browser tab only (`sessionStorage`), never `localStorage` (ADR-023, amended
 * 2026-11-12). They survive a reload and are gone when the tab closes.
 *
 * It can also **stage**: while staged, reads and writes go to memory and the tab's tokens are left alone. Signing in
 * again before a schedule save (ADR-023 d4) signs in staged, then `commit`s on success or `discard`s on a wrong password,
 * so a mistyped password never signs the coach out of a page with unsaved edits.
 */
export interface KeyValueStorage {
  setItem(key: string, value: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
}

/** Amplify's keys, all of them under this prefix (`CognitoIdentityServiceProvider.<app client>.…`). */
export const KEY_PREFIX = 'CognitoIdentityServiceProvider.';

function tab(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Wrong passwords in a row in the "Confirm it's you" box (owner, I33: the third signs the coach out). Kept in this tab
 * next to the sign-in, so a reload or another editor doesn't start it again; it goes with the sign-in (`clear`) and on
 * a right password. Read and written in one step, so two quick submits both count.
 *
 * Also counted in memory, so where the browser won't let the page use the tab's storage (blocked, or full) the third
 * wrong password still signs the coach out; only a reload then starts the count again.
 */
const WRONG_PASSWORDS = 'bb.wrongPasswords';
let wrongInMemory = 0;

function stored(): number | null {
  try {
    const t = tab();
    return t ? Number(t.getItem(WRONG_PASSWORDS) ?? 0) || 0 : null;
  } catch {
    return null;
  }
}

function store(n: number | null) {
  try {
    if (n === null) tab()?.removeItem(WRONG_PASSWORDS);
    else tab()?.setItem(WRONG_PASSWORDS, String(n));
  } catch {
    // the tab's storage refused it: the count in memory still holds
  }
}

export const wrongPasswords = (): number => Math.max(stored() ?? 0, wrongInMemory);
/** Counts one more and returns the count. */
export function addWrongPassword(): number {
  const n = wrongPasswords() + 1;
  wrongInMemory = n;
  store(n);
  return n;
}
export function clearWrongPasswords() {
  wrongInMemory = 0;
  store(null);
}

export class TabStorage implements KeyValueStorage {
  private staged: Map<string, string | null> | null = null;

  async setItem(key: string, value: string): Promise<void> {
    if (this.staged) this.staged.set(key, value);
    else tab()?.setItem(key, value);
  }

  async getItem(key: string): Promise<string | null> {
    if (this.staged) return this.staged.has(key) ? this.staged.get(key)! : null;
    return tab()?.getItem(key) ?? null;
  }

  async removeItem(key: string): Promise<void> {
    if (this.staged) this.staged.set(key, null);
    else tab()?.removeItem(key);
  }

  async clear(): Promise<void> {
    if (this.staged) {
      this.staged.clear();
      return;
    }
    clearWrongPasswords();
    const t = tab();
    if (!t) return;
    for (const k of Object.keys(t)) if (k.startsWith(KEY_PREFIX)) t.removeItem(k);
  }

  /** From now until `commit` or `discard`, nothing touches the tab's tokens; the sign-in sees no one signed in. */
  stage(): void {
    this.staged = new Map();
  }

  /** The staged sign-in replaces the tab's: the old tokens go, the new ones are kept. */
  commit(): void {
    const staged = this.staged;
    this.staged = null;
    if (!staged) return;
    const t = tab();
    if (!t) return;
    for (const k of Object.keys(t)) if (k.startsWith(KEY_PREFIX) && !staged.has(k)) t.removeItem(k);
    for (const [k, v] of staged) {
      if (v === null) t.removeItem(k);
      else t.setItem(k, v);
    }
  }

  discard(): void {
    this.staged = null;
  }
}
