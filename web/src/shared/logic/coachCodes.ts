/**
 * Entering coach codes on step 1 of family sign-up (FeatureDecriptions/Client Sign Up; design
 * client/screens-account.js acCodeState). The code is looked up once it has 8 letters and numbers; case and
 * the dash don't matter. Several coaches can be added (ADR-025 item h).
 */

export interface FoundCoach {
  firstName: string;
  lastName: string;
  initials: string;
}

/** The server's answer for one code (normalized), or null when no coach holds it. */
export interface Lookup {
  code: string;
  coach: FoundCoach | null;
}

export type CodeState = 'typing' | 'checking' | 'found' | 'dup' | 'wrong' | 'share';

export const SHARE_IN_COACH_BOX = 'That looks like a skater’s share code. Ask your coach for their coach code.';
export const NO_SUCH_COACH = 'That code doesn’t match a coach. Check it with your coach. Codes are 8 letters and numbers.';

/** Letters and digits only, uppercased: 7k2q-m9xt → 7K2QM9XT. */
export function normalizeCode(typed: string): string {
  return typed.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

/** A share code typed where a coach code goes: three letters, a dash, five characters (MIA-4K7QX). */
export function looksLikeShareCode(typed: string): boolean {
  return /^\s*[a-z]{3}\s*-\s*[a-z0-9]{5}\s*$/i.test(typed);
}

/**
 * @param lookup the latest answer from the server, for whichever code it was asked about
 * @param listed normalized codes already on the family's list
 */
export function codeState(typed: string, lookup: Lookup | undefined, listed: string[]): CodeState {
  const code = normalizeCode(typed);
  if (code.length < 8) return 'typing';
  if (code.length > 8) return looksLikeShareCode(typed) ? 'share' : 'wrong';
  if (!lookup || lookup.code !== code) return 'checking';
  if (!lookup.coach) return looksLikeShareCode(typed) ? 'share' : 'wrong';
  return listed.includes(code) ? 'dup' : 'found';
}

/** "Continue", "Continue with Dana", "Continue with 2 coaches". */
export function continueLabel(coaches: FoundCoach[]): string {
  if (coaches.length === 0) return 'Continue';
  if (coaches.length === 1) return `Continue with ${coaches[0]!.firstName}`;
  return `Continue with ${coaches.length} coaches`;
}
