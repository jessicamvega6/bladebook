import { beforeEach, expect, test } from 'vitest';
import { addUnsent, dequeue, enqueue, goesTomorrow, queue, queuedFor, removeUnsent, savedDay, saveDay, unsent, type Queued } from './offline';

beforeEach(() => localStorage.clear());

const q = (o: Partial<Queued> = {}): Queued => ({ coach: 'dana@gmail.com', date: '2026-11-16', startTime: '06:30', studentId: 'mia', shortName: 'Mia C.',
  outcome: 'NO_SHOW', outcomeAt: '2026-11-16T12:45:00Z', ...o });

test('the queue keeps one entry per skater and lesson, labelled with its coach, across reloads', () => {
  enqueue(q());
  enqueue(q({ outcome: 'CHECKED_IN' }));
  enqueue(q({ coach: 'ben@gmail.com' }));
  expect(queue()).toHaveLength(2);
  expect(queuedFor('dana@gmail.com')).toEqual([q({ outcome: 'CHECKED_IN' })]);
  dequeue(q());
  expect(queuedFor('dana@gmail.com')).toEqual([]);
  expect(queuedFor('ben@gmail.com')).toHaveLength(1);
});

test('a refused entry is kept seven days, marked the day before it goes, and Done removes it', () => {
  const day = 864e5, t0 = Date.parse('2026-11-16T15:00:00Z');
  addUnsent({ ...q(), reason: 'The phone’s time didn’t match the lesson, so it couldn’t be recorded.', refusedAt: t0 });
  expect(unsent(t0 + 5 * day)).toHaveLength(1);
  expect(goesTomorrow(unsent(t0 + 5 * day)[0]!, t0 + 5 * day)).toBe(false);
  expect(goesTomorrow(unsent(t0 + 6 * day)[0]!, t0 + 6 * day)).toBe(true);
  expect(unsent(t0 + 7 * day)).toEqual([]);
  addUnsent({ ...q(), reason: 'x', refusedAt: t0 });
  removeUnsent(unsent(t0)[0]!);
  expect(unsent(t0)).toEqual([]);
});

test('today’s lessons are kept per coach', () => {
  saveDay('dana@gmail.com', { coachFirstName: 'Dana', coachTimezone: 'America/Chicago', today: '2026-11-16', now: '06:35', lessons: [] });
  expect(savedDay('dana@gmail.com')?.today).toBe('2026-11-16');
  expect(savedDay('ben@gmail.com')).toBeNull();
});
