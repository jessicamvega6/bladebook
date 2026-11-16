/** The rinkside Week tab (Batch 23, G-28; S8, S9, R5; design presets week, week-offline, week-confirm, week-all-confirm). */
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

const pick = async (day: string, name: RegExp) => {
  const section = screen.getByRole('region', { name: day });
  await userEvent.click(within(section).getByRole('checkbox', { name }));
  return section;
};

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
  expect(screen.getByRole('button', { name: 'Pick lessons to cancel' })).toBeDisabled();
});

test('picked lessons on two days, one held, are confirmed once and sent as one batch', async () => {
  const calls = server({ '/api/coach/rinkside/cancel': () => json({ cancelled: 2, held: 1, openHeld: 0, families: 2, skipped: 0 }) });
  render(<App />);
  await screen.findByText('Sam R. and Mia C.');
  await pick('Today, Nov 16', /Leo M\./);
  const wed = await pick('Wed, Nov 18', /Sam R\. and Mia C\./);
  // Release is the starting choice; the shared lesson is held.
  await userEvent.click(within(wed).getByRole('button', { name: 'Hold closed' }));
  await userEvent.click(screen.getByRole('button', { name: 'Cancel 2 lessons' }));

  const sheet = screen.getByRole('dialog', { name: 'Confirm cancellation' });
  expect(within(sheet).getByRole('heading', { name: 'Cancel 2 lessons?' })).toBeInTheDocument();
  const rows = within(sheet).getAllByRole('listitem');
  expect(rows[0]).toHaveTextContent('Today · 10amLeo M.Release');
  expect(rows[1]).toHaveTextContent('Wed, Nov 18 · 6amSam R. and Mia C.Hold');
  expect(sheet).toHaveTextContent('Kate Martin, Ana Rivera, Lily Chen will be emailed. 1 held time stays closed for good. This can’t be undone.');
  await userEvent.click(within(sheet).getByRole('button', { name: 'Cancel 2 lessons' }));

  expect(await screen.findByText('2 lessons cancelled, 1 held closed. 2 families will be emailed.')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(cancels(calls)).toHaveLength(1);
  expect(cancels(calls)[0]!.body).toEqual({ scope: 'SELECTION', picks: [
    { date: '2026-11-16', startTime: '10:00', after: 'RELEASE' },
    { date: '2026-11-18', startTime: '06:00', after: 'HOLD' },
  ] });
  // The week and today are read again afterwards.
  await waitFor(() => expect(calls.filter((c) => c.url === '/api/coach/rinkside/week')).toHaveLength(2));
});

test('Select whole day picks every lesson that day, and Clear day undoes it', async () => {
  server();
  render(<App />);
  await screen.findByText('Sam R. and Mia C.');
  const wed = screen.getByRole('region', { name: 'Wed, Nov 18' });
  await userEvent.click(within(wed).getByRole('button', { name: 'Select whole day' }));
  expect(within(wed).getAllByRole('checkbox').every((c) => (c as HTMLInputElement).checked)).toBe(true);
  expect(screen.getByRole('button', { name: 'Cancel 2 lessons' })).toBeEnabled();
  await userEvent.click(within(wed).getByRole('button', { name: 'Clear day' }));
  expect(within(wed).getAllByRole('checkbox').some((c) => (c as HTMLInputElement).checked)).toBe(false);
  expect(screen.getByRole('button', { name: 'Pick lessons to cancel' })).toBeDisabled();
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
  expect(rows[3]).toHaveTextContent('Today · 10:30amOpen');
  expect(within(sheet).queryByRole('button', { name: 'Release' })).not.toBeInTheDocument();
  expect(sheet).toHaveTextContent('Kate Martin, Ana Rivera, Lily Chen will be emailed. Your weekly schedule doesn’t change, so next week is untouched.');
  await userEvent.click(within(sheet).getByRole('button', { name: 'Cancel 3 lessons and 1 open time' }));

  expect(await screen.findByText('3 lessons cancelled and 1 open time closed. 3 families will be emailed.')).toBeInTheDocument();
  expect(cancels(calls)[0]!.body).toEqual({ scope: 'WEEK', weekStart: '2026-11-15' });
});

test('a lesson that started or went meanwhile is counted in the message afterwards', async () => {
  server({ '/api/coach/rinkside/cancel': () => json({ cancelled: 1, held: 0, openHeld: 0, families: 1, skipped: 1 }) });
  render(<App />);
  await screen.findByText('Sam R. and Mia C.');
  await pick('Today, Nov 16', /Leo M\./);
  await pick('Wed, Nov 18', /Leo M\./);
  await userEvent.click(screen.getByRole('button', { name: 'Cancel 2 lessons' }));
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
