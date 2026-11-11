/**
 * The booking pages' rules that don't need the screen (FeatureDecriptions/Bookings:; ADR-MASTER section 7). Dates
 * are the coach's ISO dates ("2026-11-16") and times the coach's "HH:mm"; the server's are the authority.
 */
import { addMonths } from './schedule';

/** The one message for every date that couldn't be booked, whatever the cause (B1, owner 2026-11-08; wording 2026-11-09). */
export const UNAVAILABLE = 'That time was taken or no longer exists.';

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "2026-11" for each month the window touches: the three months the booking page shows. */
export function windowMonths(first: string, last: string): string[] {
  const out: string[] = [];
  for (let m = `${first.slice(0, 8)}01`; m <= last; m = addMonths(m, 1)) out.push(m.slice(0, 7));
  return out;
}

export const inWindow = (date: string, first: string, last: string) => date >= first && date <= last;

/** A date held to the window: the day view never leaves it (B5, owner 2026-11-08). */
export const clamp = (date: string, first: string, last: string) => (date < first ? first : date > last ? last : date);

/** A block with no name is labelled from its stored number (S2, ruled 2026-11-08). */
export const blockLabel = (name: string | null, seq: number) => (name && name.trim() ? name.trim() : `Block ${seq}`);

/** One picked time, kept as the family moves between days and coaches. */
export interface Pick {
  coachId: string; coachFirstName: string; date: string; startTime: string; endTime: string;
  durationMinutes: number; priceMinor: number;
}

export const samePick = (a: Pick, coachId: string, date: string, startTime: string) =>
  a.coachId === coachId && a.date === date && a.startTime === startTime;

export const sortPicks = (picks: Pick[]) =>
  [...picks].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));

/** Picks grouped by coach, in first-picked order of coaches; each family pays each coach on their own (ADR-025 d7). */
export function byCoach(picks: Pick[]): Array<{ coachId: string; coachFirstName: string; picks: Pick[] }> {
  const out: Array<{ coachId: string; coachFirstName: string; picks: Pick[] }> = [];
  for (const p of sortPicks(picks)) {
    let g = out.find((x) => x.coachId === p.coachId);
    if (!g) out.push(g = { coachId: p.coachId, coachFirstName: p.coachFirstName, picks: [] });
    g.picks.push(p);
  }
  return out;
}

/** "1 hr 30 min", "45 min". */
export function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return `${h} hr${m ? ` ${m} min` : ''}`;
}

/** What a time is on the day view. */
export type SlotState = 'open' | 'picked' | 'taken' | 'yours' | 'past';

export function slotState(t: { free: boolean; started: boolean }, picked: boolean, yours: boolean): SlotState {
  // Every time that has already started says "Past", booked or not (owner, 2026-10-13).
  if (t.started) return 'past';
  if (yours) return 'yours';
  if (!t.free) return 'taken';
  return picked ? 'picked' : 'open';
}

/** The day's times in runs of one block, for the timeline's sections and the "Not on the ice" gaps between them. */
export function blockRuns<T extends { blockSeq: number; startTime: string; endTime: string }>(times: T[]): T[][] {
  const runs: T[][] = [];
  for (const t of times) {
    const last = runs[runs.length - 1];
    if (last && last[0]!.blockSeq === t.blockSeq) last.push(t); else runs.push([t]);
  }
  return runs;
}

/** A new idempotency key for each request; the same key goes with a retry (ADR-006 d4b). */
export function newKey(): string {
  return crypto.randomUUID();
}
