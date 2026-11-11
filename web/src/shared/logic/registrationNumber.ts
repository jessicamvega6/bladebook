/**
 * A skater's registration number, checked for shape only (ADR-029 decision 4, amended 2026-11-06). The same
 * rules as backend/core RegistrationNumbers; both pass registration-number-cases.json. The server also
 * applies USA Hockey's season check digit, a setting the browser doesn't know.
 */

export type SkatingOrg = 'USFS' | 'USA_HOCKEY' | 'LEARN_TO_SKATE_USA';

/** The three Phase 1 organisations, in the design's order (client/screens-account.js SKATE_ORGS). */
export const SKATING_ORGS: ReadonlyArray<{ id: SkatingOrg; name: string; numberLabel: string; example: string; shape: string }> = [
  { id: 'USFS', name: 'U.S. Figure Skating', numberLabel: 'Member number', example: 'e.g. 1234567', shape: '' },
  { id: 'USA_HOCKEY', name: 'USA Hockey', numberLabel: 'Registration number', example: 'e.g. 2027KQ4815MX3T', shape: ': 14 characters, 9 digits and 5 letters' },
  { id: 'LEARN_TO_SKATE_USA', name: 'Learn to Skate USA', numberLabel: 'Member number', example: 'e.g. 1234567', shape: '' },
];

export const orgName = (id: string) => SKATING_ORGS.find((o) => o.id === id)?.name ?? id;

const LETTERS_AND_DIGITS = 'Use letters and numbers only.';
const TOO_LONG = 'That’s too long for a member number.';
const HOCKEY = 'USA Hockey numbers are 14 characters: 9 digits and 5 letters.';

/** Spaces out, uppercase: the form that is stored. */
export function cleanNumber(typed: string): string {
  return typed.replace(/\s+/g, '').toUpperCase();
}

const digitCount = (c: string) => (c.match(/[0-9]/g) ?? []).length;

/** The final check, as the server makes it: the message, or null when the number is fine. */
export function numberProblem(org: SkatingOrg, typed: string): string | null {
  const c = cleanNumber(typed);
  if (!c) return `Enter the skater’s ${org === 'USA_HOCKEY' ? 'registration' : 'member'} number.`;
  if (!/^[A-Z0-9]+$/.test(c)) return LETTERS_AND_DIGITS;
  if (org === 'USA_HOCKEY') return c.length === 14 && digitCount(c) === 9 ? null : HOCKEY;
  return c.length > 20 ? TOO_LONG : null;
}

/** What shows under the box as the family types: nothing until there's something to fix. */
export function liveNumberError(org: SkatingOrg, typed: string): string {
  const c = cleanNumber(typed);
  if (!c) return '';
  if (!/^[A-Z0-9]+$/.test(c)) return LETTERS_AND_DIGITS;
  if (org === 'USA_HOCKEY') return c.length >= 14 && !(c.length === 14 && digitCount(c) === 9) ? HOCKEY : '';
  return c.length > 20 ? TOO_LONG : '';
}

export const numberOk = (org: SkatingOrg, typed: string) => numberProblem(org, typed) === null;
