import { describe, expect, test } from 'vitest';
import {
  UNAVAILABLE, blockLabel, blockRuns, byCoach, clamp, duration, inWindow, newKey, slotState, sortPicks,
  windowMonths, type Pick,
} from './booking';

const pick = (coachId: string, date: string, startTime: string): Pick => ({
  coachId, coachFirstName: coachId === 'ben' ? 'Ben' : 'Dana', date, startTime, endTime: startTime, durationMinutes: 30, priceMinor: 5000,
});

describe('the booking window', () => {
  test('the owner’s example: April 24 shows April, May and June', () => {
    expect(windowMonths('2027-04-24', '2027-06-30')).toEqual(['2027-04', '2027-05', '2027-06']);
  });

  test('across the new year', () => {
    expect(windowMonths('2026-11-10', '2027-01-31')).toEqual(['2026-11', '2026-12', '2027-01']);
  });

  test('the edges are inside; a date past them is clamped back (B5)', () => {
    expect(inWindow('2026-11-10', '2026-11-10', '2027-01-31')).toBe(true);
    expect(inWindow('2027-01-31', '2026-11-10', '2027-01-31')).toBe(true);
    expect(inWindow('2026-11-09', '2026-11-10', '2027-01-31')).toBe(false);
    expect(inWindow('2027-02-01', '2026-11-10', '2027-01-31')).toBe(false);
    expect(clamp('2026-11-03', '2026-11-10', '2027-01-31')).toBe('2026-11-10');
    expect(clamp('2027-02-07', '2026-11-10', '2027-01-31')).toBe('2027-01-31');
    expect(clamp('2026-12-25', '2026-11-10', '2027-01-31')).toBe('2026-12-25');
  });
});

test('an unnamed block is labelled from its number (S2)', () => {
  expect(blockLabel('Morning ice', 1)).toBe('Morning ice');
  expect(blockLabel(null, 3)).toBe('Block 3');
  expect(blockLabel('  ', 2)).toBe('Block 2');
});

describe('a time’s state on the day view', () => {
  test('anything started is past, booked or not', () => {
    expect(slotState({ free: true, started: true }, false, false)).toBe('past');
    expect(slotState({ free: false, started: true }, false, true)).toBe('past');
  });

  test('the family’s own lesson, someone else’s, a pick and an open time', () => {
    expect(slotState({ free: false, started: false }, false, true)).toBe('yours');
    expect(slotState({ free: false, started: false }, false, false)).toBe('taken');
    expect(slotState({ free: true, started: false }, true, false)).toBe('picked');
    expect(slotState({ free: true, started: false }, false, false)).toBe('open');
  });
});

test('picks are sorted and grouped by coach, never totalled across coaches', () => {
  const picks = [pick('ben', '2026-11-17', '07:00'), pick('dana', '2026-11-16', '06:30'), pick('dana', '2026-11-16', '06:00')];
  expect(sortPicks(picks).map((p) => p.startTime)).toEqual(['06:00', '06:30', '07:00']);
  const groups = byCoach(picks);
  expect(groups.map((g) => g.coachFirstName)).toEqual(['Dana', 'Ben']);
  expect(groups[0]!.picks).toHaveLength(2);
});

test('lengths read as people say them', () => {
  expect(duration(30)).toBe('30 min');
  expect(duration(60)).toBe('1 hr');
  expect(duration(90)).toBe('1 hr 30 min');
});

test('the day’s times split into runs of one block', () => {
  const t = (blockSeq: number, startTime: string) => ({ blockSeq, startTime, endTime: startTime });
  expect(blockRuns([t(1, '06:00'), t(1, '06:30'), t(2, '16:00')]).map((r) => r.length)).toEqual([2, 1]);
});

test('every request gets its own key', () => {
  expect(newKey()).not.toBe(newKey());
});

test('one message for every date that couldn’t be booked (B1)', () => {
  expect(UNAVAILABLE).toBe('That time was taken or no longer exists.');
});
