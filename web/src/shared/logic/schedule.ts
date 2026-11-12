/**
 * The weekly editor's rules, in step with backend/core (Slots, ScheduleRules, Weeks). Both pass the same
 * hand-written cases in schedule-cases.json at the repo root (ADR-013 decision 3b), messages included,
 * so what the editor shows live is what the server says on save.
 *
 * Times are the coach's local "HH:mm". Days are 0 (Sunday) to 6 (Saturday).
 */

export const LESSON_LENGTHS = [30, 45, 60, 90, 120] as const;
/** The most skaters per lesson a coach may choose (ADR-026 d1). */
export const MAX_SKATERS = 2;
export const MAX_NAME = 40;
export const MAX_PRICE_MINOR = 999_999;
/** Where slots run to when a block's end is blank (ADR-008 d4). */
export const DEFAULT_END = '19:00';
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December'] as const;

/** One block as the coach edits it (a "tab", ADR-008 d3). Any field may be blank while editing. */
export interface Template {
  seq: number;
  name: string;
  startTime: string | null;
  endTime: string | null;
  lessonMinutes: number | null;
  priceMinor: number | null;
  maxSkaters: number | null;
  iceType: string | null;
  days: number[];
  /** Slots switched off, by day: {"1": ["07:00"]}. */
  off: Record<string, string[]>;
}

export interface Block {
  seq: number;
  startTime: string;
  endTime: string;
}

// ------------------------------------------------------------------ times

export const toMinutes = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const toTime = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Every quarter hour from 12:00 AM to 11:45 PM (ADR-MASTER section 6). */
export const QUARTER_HOURS: string[] = Array.from({ length: 96 }, (_, i) => toTime(i * 15));

const hour12 = (m: number) => { const h = Math.floor(m / 60) % 12; return h === 0 ? 12 : h; };
const meridiem = (m: number) => (m < 720 ? 'AM' : 'PM');
const clock = (m: number) => (m % 60 === 0 ? `${hour12(m)}` : `${hour12(m)}:${String(m % 60).padStart(2, '0')}`);

/** "6:30 AM". */
export const formatTime = (t: string): string => { const m = toMinutes(t); return `${hour12(m)}:${String(m % 60).padStart(2, '0')} ${meridiem(m)}`; };
/** "6:30" with no meridiem, for dense grids. */
export const formatClock = (t: string): string => { const m = toMinutes(t); return `${hour12(m)}:${String(m % 60).padStart(2, '0')}`; };
/** "6am", "11:30am". */
export const formatShort = (t: string): string => { const m = toMinutes(t); return `${clock(m)}${meridiem(m).toLowerCase()}`; };

/** "6–11:30 AM", "10 AM–5 PM": the first meridiem is dropped when both match. */
export function range(a: string, b: string): string {
  const ma = toMinutes(a), mb = toMinutes(b);
  return meridiem(ma) === meridiem(mb)
    ? `${clock(ma)}–${clock(mb)} ${meridiem(mb)}`
    : `${clock(ma)} ${meridiem(ma)}–${clock(mb)} ${meridiem(mb)}`;
}

// ------------------------------------------------------------------ slots

/** Back-to-back slots from start to end (or 7:00 PM); a blank length gives 30-minute slots. */
export function slots(start: string | null, end: string | null, minutes: number | null): string[] {
  if (!start) return [];
  const len = minutes && minutes > 0 ? minutes : 30;
  const to = toMinutes(end ?? DEFAULT_END);
  const out: string[] = [];
  for (let t = toMinutes(start); t + len <= to; t += len) out.push(toTime(t));
  return out;
}

const effectiveEnd = (t: Template) => t.endTime ?? DEFAULT_END;
const templateSlots = (t: Template) => slots(t.startTime, effectiveEnd(t), t.lessonMinutes);
export const isOff = (t: Template, day: number, slot: string) => (t.off[String(day)] ?? []).includes(slot);

/** Contiguous runs of the slots left on, as [start, end] minutes. */
function runs(t: Template, day: number): Array<[number, number]> {
  const len = t.lessonMinutes ?? 30;
  const out: Array<[number, number]> = [];
  let cur: [number, number] | null = null;
  for (const s of templateSlots(t)) {
    if (isOff(t, day, s)) { cur = null; continue; }
    const m = toMinutes(s);
    if (cur && cur[1] === m) cur[1] = m + len;
    else { cur = [m, m + len]; out.push(cur); }
  }
  return out;
}

function timesValid(t: Template): boolean {
  if (!t.startTime || t.lessonMinutes == null || !(LESSON_LENGTHS as readonly number[]).includes(t.lessonMinutes)) return false;
  if (t.endTime && toMinutes(t.endTime) <= toMinutes(t.startTime)) return false;
  return templateSlots(t).length > 0;
}

/** Each day's stored blocks: one per contiguous run of slots left on (ADR-008 d4). */
export function templateBlocks(templates: Template[]): Record<string, Block[]> {
  const out: Record<string, Block[]> = {};
  for (const t of templates) {
    if (!timesValid(t)) continue;
    for (const d of t.days) {
      for (const [s, e] of runs(t, d)) (out[String(d)] ??= []).push({ seq: t.seq, startTime: toTime(s), endTime: toTime(e) });
    }
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  return out;
}

/** How many lessons a template makes on a day. */
export const lessonsOn = (t: Template, day: number): number =>
  timesValid(t) && t.days.includes(day) ? templateSlots(t).filter((s) => !isOff(t, day, s)).length : 0;

// ------------------------------------------------------------- validation

export const label = (t: Template): string => (t.name.trim() ? t.name.trim() : `Block ${t.seq}`);

/** Everything that stops a save, worded as the server words it. Empty means it can be saved. */
export function problems(templates: Template[]): string[] {
  if (!templates.length) return ['Add at least one block.'];
  const out: string[] = [];
  const seqs = new Set<number>();
  for (const t of templates) {
    if (t.seq <= 0 || seqs.has(t.seq)) { out.push('Two blocks have the same number. Reload the page and try again.'); break; }
    seqs.add(t.seq);
  }
  for (const t of templates) {
    const l = label(t);
    const name = t.name.trim();
    if (name.length > MAX_NAME) out.push(`A block name can be up to ${MAX_NAME} characters.`);
    else if (/[\u0000-\u001f\u007f-\u009f]/.test(name)) out.push('A block name has a character it can’t hold.');
    const lengthOk = t.lessonMinutes != null && (LESSON_LENGTHS as readonly number[]).includes(t.lessonMinutes);
    if (!t.startTime) out.push(`${l} needs a start time.`);
    if (!lengthOk) out.push(`${l} needs a lesson length.`);
    if (t.startTime && lengthOk) {
      if (!t.endTime && toMinutes(t.startTime) >= toMinutes(DEFAULT_END)) out.push(`${l} needs an end time.`);
      else if (t.endTime && toMinutes(t.endTime) <= toMinutes(t.startTime)) out.push(`${l} ends before it starts.`);
      else if (!templateSlots(t).length) out.push(`${l} is too short for one ${t.lessonMinutes}-minute lesson.`);
    }
    if (!t.days.length) out.push(`${l} has no days selected. Pick at least one day.`);
    if (t.priceMinor == null || t.priceMinor < 0) out.push(`${l} needs a price.`);
    else if (t.priceMinor > MAX_PRICE_MINOR) out.push(`${l}’s price must be under $10,000.`);
    if (t.maxSkaters == null || t.maxSkaters < 1 || t.maxSkaters > MAX_SKATERS) out.push(`${l} can have 1 or ${MAX_SKATERS} skaters per lesson.`);
    if (!t.iceType) out.push(`${l} has no ice type. Pick one.`);
    if (timesValid(t) && t.days.length && t.days.every((d) => runs(t, d).length === 0)) {
      out.push(`Every time in ${l} is switched off. Switch some back on, or delete the block.`);
    }
  }
  for (let day = 0; day < 7; day++) {
    for (let i = 0; i < templates.length; i++) {
      const a = templates[i];
      if (!timesValid(a) || !a.days.includes(day)) continue;
      for (let j = i + 1; j < templates.length; j++) {
        const b = templates[j];
        if (!timesValid(b) || !b.days.includes(day)) continue;
        const clash = runs(a, day).some(([as, ae]) => runs(b, day).some(([bs, be]) => as < be && bs < ae));
        if (clash) {
          out.push(`${DAYS_LONG[day]}: ${label(a)} (${range(a.startTime!, effectiveEnd(a))}) and ${label(b)} (${range(b.startTime!, effectiveEnd(b))}) overlap in time.`);
        }
      }
    }
  }
  return out;
}

/** One above the highest seq: numbers are never reused or renumbered (ADR-008 d2a). */
export const nextSeq = (templates: Template[]): number => templates.reduce((m, t) => Math.max(m, t.seq), 0) + 1;

// ------------------------------------------------------------------ money

/** "$50", "$45.01", "$1,250". Amounts are integer cents (ADR-MASTER section 3). */
export function formatMoney(minor: number): string {
  const whole = Math.floor(minor / 100).toLocaleString('en-US');
  return minor % 100 === 0 ? `$${whole}` : `$${whole}.${String(minor % 100).padStart(2, '0')}`;
}

/** A typed price in cents; null when blank; undefined when it can't be read. */
export function parseMoney(typed: string): number | null | undefined {
  const s = typed.trim().replace(/^\$/, '').replace(/,/g, '');
  if (!s) return null;
  const m = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return undefined;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

/** The odd-cents warning (ADR-031 d13): shown when a shared lesson's price doesn't split evenly. */
export function oddCentsWarning(priceMinor: number | null, maxSkaters: number | null): string | null {
  if (priceMinor == null || !maxSkaters || maxSkaters < 2 || priceMinor % maxSkaters === 0) return null;
  const base = Math.floor(priceMinor / maxSkaters), extra = priceMinor % maxSkaters;
  const shares = Array.from({ length: maxSkaters }, (_, i) => formatMoney(base + (i < extra ? 1 : 0)));
  const list = shares.length === 2 ? `${shares[0]} and ${shares[1]}` : `${shares.slice(0, -1).join(', ')} and ${shares[shares.length - 1]}`;
  const who = extra === 1 ? 'One family' : `${extra} families`;
  return `Split ${maxSkaters} ways, ${formatMoney(priceMinor)} is ${list}. ${who} will pay a cent more.`;
}

// ------------------------------------------------------------------ dates

/** Plain calendar dates as "YYYY-MM-DD", with no time zone in them. */
const parse = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const iso = (dt: Date) => dt.toISOString().slice(0, 10);

export const addDays = (date: string, n: number): string => { const d = parse(date); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
export const dayOfWeek = (date: string): number => parse(date).getUTCDay();
/** The Sunday that starts the date's Sunday–Saturday week. */
export const weekStart = (date: string): string => addDays(date, -dayOfWeek(date));
export const monthStart = (date: string): string => `${date.slice(0, 8)}01`;
export const addMonths = (first: string, n: number): string => { const d = parse(first); d.setUTCMonth(d.getUTCMonth() + n, 1); return iso(d); };
export const monthEnd = (first: string): string => addDays(addMonths(first, 1), -1);

/** "Nov 8". */
export const shortDate = (date: string): string => { const d = parse(date); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; };
/** "Monday, November 9". */
export const longDate = (date: string): string => { const d = parse(date); return `${DAYS_LONG[d.getUTCDay()]}, ${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCDate()}`; };

/** Today's date in the coach's time zone, never the browser's. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// ------------------------------------------------ time off and special schedules (Batch 6)

/** A special schedule shows one column per date, so it runs at most 31 days; time off at most 366 (TempRules). */
export const MAX_SPECIAL_DAYS = 31;
export const MAX_TIME_OFF_DAYS = 366;

/** Every date from {@code a} to {@code b} inclusive, at most {@code max}. */
export function datesBetween(a: string, b: string, max = MAX_TIME_OFF_DAYS + 1): string[] {
  const out: string[] = [];
  if (!a || !b || b < a) return out;
  for (let d = a; d <= b && out.length < max; d = addDays(d, 1)) out.push(d);
  return out;
}

/** "Dec 21", "Dec 21 – 27", "Nov 30 – Dec 4": the design's date ranges. */
export function dateRange(a: string, b: string): string {
  if (a === b) return shortDate(a);
  return a.slice(0, 7) === b.slice(0, 7) ? `${shortDate(a)} – ${Number(b.slice(8))}` : `${shortDate(a)} – ${shortDate(b)}`;
}

/** A special schedule's block on one date: the weekday's rules with that date's times off ({@code off} is keyed by date). */
export const forDate = (t: Template, date: string): Template => {
  const dow = dayOfWeek(date);
  return { ...t, days: [dow], off: { [String(dow)]: t.off[date] ?? [] } };
};

/** A special schedule's block checks: the weekly ones, on one day standing for every date, worded for dates. */
export function specialProblems(templates: Template[]): string[] {
  return problems(templates.map((t) => ({ ...t, days: [1], off: {} })))
    .map((p) => (p.startsWith('Monday: ') ? `On these dates, ${p.slice('Monday: '.length)}` : p));
}

export interface TempSummary { tempId: string; kind: 'TIME_OFF' | 'SPECIAL'; displayName: string; startDate: string; endDate: string }

/** The date checks the server makes (TempRules), worded the same, for the form before review. */
export function tempProblems(kind: TempSummary['kind'], name: string, sd: string, ed: string, others: TempSummary[], today: string,
  self: string | null, savedStart: string | null): string[] {
  const off = kind === 'TIME_OFF';
  const out: string[] = [];
  if (name.trim().length > MAX_NAME) out.push(`The name can be up to ${MAX_NAME} characters.`);
  if (!sd || !ed) { out.push(off ? 'Time off needs a first and last day.' : 'A special schedule needs a start and end date.'); return out; }
  if (ed < sd) { out.push(off ? 'The last day is before the first day.' : 'The end date is before the start date.'); return out; }
  if (sd < today && sd !== savedStart) out.push(off ? 'The first day off can’t be in the past.' : 'The start date can’t be in the past.');
  const days = datesBetween(sd, ed).length;
  if (off && days > MAX_TIME_OFF_DAYS) out.push(`Time off can be at most ${MAX_TIME_OFF_DAYS} days. Add another for the rest.`);
  else if (!off && days > MAX_SPECIAL_DAYS) out.push(`A special schedule can be at most ${MAX_SPECIAL_DAYS} days.`);
  for (const o of others) {
    if (o.tempId === self) continue;
    const s = sd > o.startDate ? sd : o.startDate, e = ed < o.endDate ? ed : o.endDate;
    if (s <= e) {
      out.push(`These dates overlap ${o.displayName} (${dateRange(o.startDate, o.endDate)}) on ${dateRange(s, e)}. Edit ${o.displayName} to change those days, or choose dates outside it.`);
    }
  }
  return out;
}
