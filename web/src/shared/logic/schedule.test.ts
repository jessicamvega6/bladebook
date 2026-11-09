/**
 * The schedule logic shared with Java (backend/core ScheduleRules, Slots, Weeks), driven from the same
 * cases: schedule-cases.json at the repo root (ADR-013 decision 3b). Every `expect` there is hand-written.
 */
import { describe, expect, test } from 'vitest';
import cases from '../../../../schedule-cases.json';
import {
  addDays, formatMoney, oddCentsWarning, parseMoney, problems, range, slots, templateBlocks, weekStart, type Template,
} from './schedule';

type RawTemplate = Record<string, unknown>;

/** A template as the cases write it: a left-out field takes the default "_about" names. */
function template(t: RawTemplate): Template {
  return {
    seq: t.seq as number,
    name: 'name' in t ? (t.name as string) : '',
    startTime: t.startTime as string | null,
    endTime: t.endTime as string | null,
    lessonMinutes: t.lessonMinutes as number | null,
    priceMinor: 'priceMinor' in t ? (t.priceMinor as number | null) : 5000,
    maxSkaters: 'maxSkaters' in t ? (t.maxSkaters as number | null) : 1,
    iceType: 'iceType' in t ? (t.iceType as string | null) : 'PUBLIC',
    days: t.days as number[],
    off: (t.off as Record<string, string[]>) ?? {},
  };
}

describe('slot expansion (shared cases)', () => {
  test.each(cases.slotExpansion.map((c) => [c.name, c] as const))('%s', (_, c) => {
    expect(slots(c.startTime, c.endTime, c.lessonMinutes)).toEqual(c.expect);
  });
});

describe('templates become blocks (shared cases)', () => {
  test.each(cases.templateBlocks.map((c) => [c.name, c] as const))('%s', (_, c) => {
    const got = templateBlocks((c.templates as RawTemplate[]).map(template));
    const flat = (m: Record<string, Array<{ seq: number; startTime: string; endTime: string }>>) =>
      Object.entries(m).flatMap(([d, bs]) => bs.map((b) => `${d} ${b.seq} ${b.startTime}-${b.endTime}`)).sort();
    expect(flat(got)).toEqual(flat(c.expect as unknown as Record<string, Array<{ seq: number; startTime: string; endTime: string }>>));
  });
});

describe('validation (shared cases)', () => {
  test.each(cases.validation.map((c) => [c.name, c] as const))('%s', (_, c) => {
    expect(problems((c.templates as RawTemplate[]).map(template))).toEqual(c.expect);
  });
});

describe('week start (shared cases)', () => {
  test.each(cases.weekStart.map((c) => [c.name, c] as const))('%s', (_, c) => {
    expect(weekStart(c.date)).toBe(c.expect);
  });
});

describe('the rest', () => {
  test('time ranges drop the first meridiem when both match', () => {
    expect(range('06:00', '11:30')).toBe('6–11:30 AM');
    expect(range('10:00', '17:00')).toBe('10 AM–5 PM');
  });

  test('dates add across months', () => {
    expect(addDays('2026-11-29', 3)).toBe('2026-12-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  test('money shows cents only when there are some', () => {
    expect(formatMoney(5000)).toBe('$50');
    expect(formatMoney(4501)).toBe('$45.01');
    expect(formatMoney(125000)).toBe('$1,250');
    expect(formatMoney(0)).toBe('$0');
  });

  test('a typed price becomes cents', () => {
    expect(parseMoney('50')).toBe(5000);
    expect(parseMoney('45.5')).toBe(4550);
    expect(parseMoney(' 45.01 ')).toBe(4501);
    expect(parseMoney('$45')).toBe(4500);
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('4.555')).toBeUndefined();
    expect(parseMoney('ten')).toBeUndefined();
    expect(parseMoney('-5')).toBeUndefined();
  });

  test('the odd-cents warning shows only when a shared price does not split evenly (ADR-031 d13)', () => {
    expect(oddCentsWarning(4501, 2)).toBe('Split 2 ways, $45.01 is $22.51 and $22.50. One family will pay a cent more.');
    expect(oddCentsWarning(4500, 2)).toBeNull();
    expect(oddCentsWarning(4501, 1)).toBeNull();
    expect(oddCentsWarning(null, 2)).toBeNull();
  });
});
