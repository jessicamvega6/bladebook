/**
 * Shared lessons' rules that don't need the screen (ADR-MASTER section 8; FeatureDecriptions/Schedule lesson split). The
 * server's are the authority; these only decide what the page shows.
 */
import { formatMoney } from './schedule';

/** No 0, O, 1, I, L, 5, S or U: the coach code's set, which the random part of a share code uses. */
const ALPHABET = 'ABCDEFGHJKMNPQRTVWXYZ2346789';

/** A share code as typed, in its stored form ("MIA-4K7QX"), or null when it can't be one (3 letters, then 5 from the set). */
export function normaliseShareCode(typed: string): string | null {
  const v = typed.replace(/[\s-]/g, '').toUpperCase();
  if (v.length !== 8 || !/^[A-Z]{3}$/.test(v.slice(0, 3))) return null;
  for (const c of v.slice(3)) if (!ALPHABET.includes(c)) return null;
  return `${v.slice(0, 3)}-${v.slice(3)}`;
}

/**
 * What the share box holds before the share-check is asked (ADR-033 2a): nothing, a code still being typed, the skater's
 * own code (the page knows it; no call), a shape that can't be a code, or a whole code to check.
 */
export type CodeState = 'empty' | 'typing' | 'self' | 'wrong' | 'ready';

export function codeState(typed: string, ownCode: string | null | undefined): CodeState {
  const raw = typed.replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (!raw) return 'empty';
  if (raw.length < 8) return 'typing';
  if (ownCode && ownCode.replace(/[^A-Z0-9]/g, '') === raw) return 'self';
  return normaliseShareCode(raw) ? 'ready' : 'wrong';
}

/** A skater's share: the price divided by the skaters splitting it, odd cents one each to the earliest joiners (B10). */
export const shareOf = (priceMinor: number, skaters: number, place = skaters - 1): number => {
  if (skaters < 2) return priceMinor;
  const base = Math.floor(priceMinor / skaters);
  return base + (place < priceMinor % skaters ? 1 : 0);
};

/** The share box's split line: never "half" (owner, 2026-11-11, B10). */
export const splitLine = (priceMinor: number, _currency: string | null) =>
  `Once they join, the lesson’s ${formatMoney(priceMinor)} is split between the skaters: with 2 skaters, each pays ${formatMoney(shareOf(priceMinor, 2))}.`;

/** The staying family's answer-by time has passed: the lesson is "Cancelled, no answer", without waiting for the sweep (B8). */
export const noAnswer = (answerBy: string | null | undefined, nowMs: number) => !!answerBy && nowMs >= Date.parse(answerBy);
