/**
 * What the rinkside page keeps on the phone (ADR-MASTER section 11, "Offline"; R2–R5; FeatureDecriptions/C_Rinkside
 * Offline.md). Batch 10.
 *
 * - Today's lessons, per coach: skater names and times, never contact details. Only today's are used.
 * - The queue: check-ins recorded with no signal, each labelled with the coach who recorded it, sent once there's signal
 *   and that coach is logged in. It survives a reload and a log-out (R2).
 * - Not sent: entries the server turned down because their time didn't fit the lesson. They hold a student's name on a
 *   phone used at public rinks, so each goes when the coach taps Done or after 7 days (R3).
 *
 * localStorage, wrapped: a browser that blocks it (or clears it, as Safari can) loses only the offline copy.
 */
import type { RinkDay } from './api';

export interface Queued {
  coach: string; date: string; startTime: string; studentId: string; shortName: string; outcome: 'CHECKED_IN' | 'NO_SHOW'; outcomeAt: string;
}
export interface Unsent extends Queued { reason: string; refusedAt: number }

const DAY = 'bb.rink.day.';
const QUEUE = 'bb.rink.queue';
const UNSENT = 'bb.rink.unsent';
export const KEEP_DAYS = 7;
const DAY_MS = 864e5;

function read<T>(key: string, fallback: T): T {
  try { const v = window.localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function write(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* the offline copy is a convenience */ }
}

/** Today's lessons for this coach, as last loaded with signal. */
export const saveDay = (coach: string, day: RinkDay) => write(DAY + coach, day);
export const savedDay = (coach: string): RinkDay | null => read<RinkDay | null>(DAY + coach, null);

const same = (a: Queued, b: Pick<Queued, 'coach' | 'date' | 'startTime' | 'studentId'>) =>
  a.coach === b.coach && a.date === b.date && a.startTime === b.startTime && a.studentId === b.studentId;

export const queue = (): Queued[] => read<Queued[]>(QUEUE, []);
/** One entry per skater and lesson: a second tap replaces the first. */
export function enqueue(q: Queued) { write(QUEUE, [...queue().filter((x) => !same(x, q)), q]); }
export function dequeue(q: Queued) { write(QUEUE, queue().filter((x) => !same(x, q))); }
export const queuedFor = (coach: string) => queue().filter((q) => q.coach === coach);

/** Entries still within 7 days of being turned down; older ones are removed as they're read. */
export function unsent(now = Date.now()): Unsent[] {
  const all = read<Unsent[]>(UNSENT, []);
  const kept = all.filter((u) => now - u.refusedAt < KEEP_DAYS * DAY_MS);
  if (kept.length !== all.length) write(UNSENT, kept);
  return kept;
}
export function addUnsent(u: Unsent) { write(UNSENT, [...unsent().filter((x) => !same(x, u)), u]); }
export function removeUnsent(u: Unsent) { write(UNSENT, unsent().filter((x) => !same(x, u))); }
/** Marked a day before removal: "Will be removed tomorrow." */
export const goesTomorrow = (u: Unsent, now = Date.now()) => now - u.refusedAt >= (KEEP_DAYS - 1) * DAY_MS;
