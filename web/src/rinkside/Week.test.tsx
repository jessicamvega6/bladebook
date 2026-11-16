/**
 * The rinkside Week tab (Batch 23, G-28; S8, S9, R5; design presets week, week-offline, week-lesson, week-day, week-all-confirm).
 * Only three cancels: one lesson, a whole day, or the rest of the week (owner, 2026-11-16).
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { RinkDay, RinkWeek, WeekLesson } from './api';
import { App } from './App';

const sk = (id: string, short: string, familyName: string, familyId: string) => ({ studentId: id, shortName: short, familyName, familyId });
const wl = (date: string, startTime: string, skaters: ReturnType<typeof sk>[], durationMinutes = 30): WeekLesson =>
  ({ date, startTime, durationMinutes, skaters });

/** Monday, Nov 16 at 6:35 AM: two lessons have started today; Leo's 10:00 is left. Wednesday has Leo again and a shared lesson. */
const WEEK: RinkWeek = {
  coachTimezone: 'America/Chicago', today: '2026-11-16', now: '06:35', weekStart: '2026-11-15',
  days: [
    { date: '2026-11-16', lessons: [wl('2026-11-16', '10:00', [sk('leo', 'Leo M.', 'Kate Martin', 'f-martin')])], started: 2,
      open: [{ date: '2026-11-16', startTime: '10:30', durationMinutes: 30 }] },
    { date: '2026-11-17', lessons: [], started: 0, open: [] },
    { date: '2026-11-18', lessons: [
      wl('2026-11-18', '06:00', [sk('sam', 'Sam R.', 'Ana Rivera', 'f-rivera'), sk('mia', 'Mia C.', 'Lily Chen', 'f-chen')]),
      wl('2026-11-18', '10:00', [sk('leo', 'Leo M.', 'Kate Martin', 'f-martin')], 45),
    ], started: 0, open: [] },
    { date: '2026-11-19', lessons: [], started: 0, open: [] },
    { date: '2026-11-20', lessons: [], started: 0, open: [] },
    { date: '2026-11-21', lessons: [], started: 0, open: [] },
  ],
};
const DAY: RinkDay = { coachFirstName: 'Dana', coachTimezone: 'America/Chicago', today: '2026-11-16', now: '06:35', lessons: [] };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

function server(over: Record<string, (init?: RequestInit) => Response> = {}) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : null });
    const key = Object.keys(over).find((k) => url.startsWith(k));
    if (key) return Promise.resolve(over[key]!(init));
    if (url === '/api/coach/rinkside/today') return Promise.resolve(json(DAY));
    if (url === '/api/coach/rinkside/week') return Promise.resolve(json(WEEK));
    return Promise.resolve(json({}, 404));
  }));
  return calls;
}
const cancels = (calls: ReturnType<typeof server>) => calls.filter((c) => c.url === '/api/coach/rinkside/cancel');

beforeEach(() => {
  sessionStorage.clear(); localStorage.clear();
  sessionStorage.setItem('bb.coach.idToken', 'h.eyJlbWFpbCI6ImRhbmFAZ21haWwuY29tIn0.s');
  window.location.hash = '#/week';
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

test('the Week tab lists today to Saturday: what can be cancelled, what has started, and the rest-of-week card', async () => {
  server();
  render(<App />);
  expect(await screen.findByText('Mon, Nov 16 – Sat, Nov 21 · cancel lessons')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Week' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByText(/Holds everything left from now to Saturday: 3 lessons and 1 open time\./)).toBeInTheDocument();
  const today = screen.getByRole('region', { name: 'Today, Nov 16' });
  expect(within(today).getByText('Leo M.')).toBeInTheDocument();
  expect(within(today).getByText('2 lessons already started and can’t be cancelled.')).toBeInTheDocument();
  expect(screen.getByText('Tue, Nov 17').closest('.rk-day')).toHaveTextContent('No lessons');
  const wed = screen.getByRole('region', { name: 'Wed, Nov 18' });
  expect(within(wed).getByText('Sam R. and Mia C.')).toBeInTheDocument();
  expect(within(wed).getByText('Shared · cancels both skaters')).toBeInTheDocument();
  expect(within(wed).getByText('45 min')).toBeInTheDocument();
  // Every lesson has its own Cancel; only a day with two or more lessons has Cancel whole day. Nothing is picked across days.
  expect(within(wed).getByRole('button', { name: 'Cancel whole day' })).toBeInTheDocument();
  expect(within(today).queryByRole('button', { name: 'Cancel whole day' })).not.toBeInTheDocument();
  expect(within(today).getByRole('button', { name: 'Cancel Leo M. at 10:00 AM' })).toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});

test('one lesson: its own confirmation asks release or hold and sends LESSON', async () => {
  const calls = server({ '/api/coach/rinkside/cancel': () => json({ cancelled: 1, held: 1, openHeld: 0, families: 2, skipped: 0 }) });
  render(<App />);
  const wed = await screen.findByRole('region', { name: 'Wed, Nov 18' });
  await userEvent.click(within(wed).getByRole('button', { name: 'Cancel Sam R. and Mia C. at 6:00 AM' }));

  const sheet = screen.getByRole('dialog', { name: 'Cancel lesson' });
  expect(within(sheet).getByRole('heading', { name: 'Cancel Sam R. and Mia C. · Wed, Nov 18 · 6:00 AM?' })).toBeInTheDocument();
  expect(sheet).toHaveTextContent('It’s a shared lesson, so both skaters are cancelled. Ana Rivera, Lily Chen will be emailed. This can’t be undone.');
  // Release is the starting choice.
  expect(within(sheet).getByRole('button', { name: 'Release for rebooking' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(within(sheet).getByRole('button', { name: 'Hold it closed' }));
  expect(sheet).toHaveTextContent('A held time stays closed for good.');
  await userEvent.click(within(sheet).getByRole('button', { name: 'Cancel lesson' }));

  expect(await screen.findByText('1 lesson cancelled, 1 held closed. 2 families will be emailed.')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(cancels(calls)).toHaveLength(1);
  expect(cancels(calls)[0]!.body).toEqual({ scope: 'LESSON', picks: [{ date: '2026-11-18', startTime: '06:00', after: 'HOLD' }] });
  // The week and today are read again afterwards.
  await waitFor(() => expect(calls.filter((c) => c.url === '/api/coach/rinkside/week')).toHaveLength(2));
});

test('a whole day: one confirmation asks release or hold for each lesson and sends DAY', async () => {
  const calls = server({ '/api/coach/rinkside/cancel': () => json({ cancelled: 2, held: 1, openHeld: 0, families: 3, skipped: 0 }) });
  render(<App />);
  const wed = await screen.findByRole('region', { name: 'Wed, Nov 18' });
  await userEvent.click(within(wed).getByRole('button', { name: 'Cancel whole day' }));

  const sheet = screen.getByRole('dialog', { name: 'Cancel day' });
  expect(within(sheet).getByRole('heading', { name: 'Cancel all of Wed, Nov 18?' })).toBeInTheDocument();
  expect(sheet).toHaveTextContent('2 lessons. For each one, choose whether the time can be booked again.');
  await userEvent.click(within(within(sheet).getByRole('group', { name: 'After cancelling Leo M. at 10:00 AM' })).getByRole('button', { name: 'Hold closed' }));
  expect(sheet).toHaveTextContent('Ana Rivera, Lily Chen, Kate Martin will be emailed. 1 held time stays closed for good. This can’t be undone.');
  await userEvent.click(within(sheet).getByRole('button', { name: 'Cancel 2 lessons' }));

  expect(await screen.findByText('2 lessons cancelled, 1 held closed. 3 families will be emailed.')).toBeInTheDocument();
  expect(cancels(calls)[0]!.body).toEqual({ scope: 'DAY', picks: [
    { date: '2026-11-18', startTime: '06:00', after: 'RELEASE' },
    { date: '2026-11-18', startTime: '10:00', after: 'HOLD' },
  ] });
});

test('Keep lesson closes the confirmation and sends nothing', async () => {
  const calls = server();
  render(<App />);
  const today = await screen.findByRole('region', { name: 'Today, Nov 16' });
  await userEvent.click(within(today).getByRole('button', { name: 'Cancel Leo M. at 10:00 AM' }));
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Keep lesson' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(cancels(calls)).toHaveLength(0);
});

test('Cancel rest of week lists everything it holds, asks nothing per lesson, and sends only its Sunday', async () => {
  const calls = server({ '/api/coach/rinkside/cancel': () => json({ cancelled: 3, held: 3, openHeld: 1, families: 3, skipped: 0 }) });
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel rest of week' }));
  const sheet = screen.getByRole('dialog', { name: 'Confirm cancellation' });
  expect(within(sheet).getByRole('heading', { name: 'Cancel the rest of the week?' })).toBeInTheDocument();
  const rows = within(sheet).getAllByRole('listitem');
  expect(rows).toHaveLength(4);
  expect(rows.every((r) => r.textContent!.endsWith('Hold'))).toBe(true);
  expect(rows[3]).toHaveTextContent('Today · 10:30 AMOpen');
  expect(within(sheet).queryByRole('button', { name: 'Release' })).not.toBeInTheDocument();
  expect(sheet).toHaveTextContent('Kate Martin, Ana Rivera, Lily Chen will be emailed. Your weekly schedule doesn’t change, so next week is untouched.');
  await userEvent.click(within(sheet).getByRole('button', { name: 'Cancel 3 lessons and 1 open time' }));

  expect(await screen.findByText('3 lessons cancelled and 1 open time closed. 3 families will be emailed.')).toBeInTheDocument();
  expect(cancels(calls)[0]!.body).toEqual({ scope: 'WEEK', weekStart: '2026-11-15' });
});

test('a lesson that started or went meanwhile is counted in the message afterwards', async () => {
  server({ '/api/coach/rinkside/cancel': () => json({ cancelled: 1, held: 0, openHeld: 0, families: 1, skipped: 1 }) });
  render(<App />);
  const wed = await screen.findByRole('region', { name: 'Wed, Nov 18' });
  await userEvent.click(within(wed).getByRole('button', { name: 'Cancel whole day' }));
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel 2 lessons' }));
  expect(await screen.findByText('1 lesson cancelled. 1 family will be emailed. 1 lesson had already started or gone, so it was left alone.')).toBeInTheDocument();
});

test('when nothing is left to cancel the confirmation says so and stays open', async () => {
  server({ '/api/coach/rinkside/cancel': () => json({ message: 'These lessons have already started or were cancelled.' }, 409) });
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel rest of week' }));
  const sheet = screen.getByRole('dialog', { name: 'Confirm cancellation' });
  await userEvent.click(within(sheet).getByRole('button', { name: 'Cancel 3 lessons and 1 open time' }));
  expect(await within(sheet).findByText('These lessons have already started or were cancelled.')).toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Confirm cancellation' })).toBeInTheDocument();
});

test('with no signal the Week tab shows no lessons, only that the week needs a connection (R5)', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  localStorage.setItem('bb.rink.day.dana@gmail.com', JSON.stringify(DAY));
  const calls = server();
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'The week needs a connection' })).toBeInTheDocument();
  expect(screen.getByText('Cancelling needs signal too. Today’s lessons are on the Today tab.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Go to Today' })).toHaveAttribute('href', '#/today');
  expect(screen.getByText('No signal', { selector: '.phone__sub' })).toBeInTheDocument();
  expect(screen.queryByText('Sam R. and Mia C.')).not.toBeInTheDocument();
  expect(calls.find((c) => c.url === '/api/coach/rinkside/week')).toBeUndefined();
});

test('losing signal on the Week tab hides the week; signal back reads it again', async () => {
  const calls = server();
  render(<App />);
  expect(await screen.findByText('Sam R. and Mia C.')).toBeInTheDocument();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  act(() => { window.dispatchEvent(new Event('offline')); });
  expect(screen.getByRole('heading', { name: 'The week needs a connection' })).toBeInTheDocument();
  expect(screen.queryByText('Sam R. and Mia C.')).not.toBeInTheDocument();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  act(() => { window.dispatchEvent(new Event('online')); });
  expect(await screen.findByText('Sam R. and Mia C.')).toBeInTheDocument();
  expect(calls.filter((c) => c.url === '/api/coach/rinkside/week').length).toBeGreaterThanOrEqual(2);
});

test('a week that can’t be reached is treated as no signal', async () => {
  server({ '/api/coach/rinkside/week': () => { throw new TypeError('Failed to fetch'); } });
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'The week needs a connection' })).toBeInTheDocument();
});
