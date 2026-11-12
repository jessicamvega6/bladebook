import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { RinkDay, RinkLesson, RinkSkater } from './api';
import { App } from './App';

const skater = (id: string, short: string, full: string, o: Partial<RinkSkater> = {}): RinkSkater =>
  ({ studentId: id, shortName: short, fullName: full, familyName: 'Sarah Park', status: 'BOOKED', outcomeAt: null, ...o });
const lesson = (startTime: string, skaters: RinkSkater[], o: Partial<RinkLesson> = {}): RinkLesson =>
  ({ date: '2026-11-16', startTime, durationMinutes: 30, startsAtUtc: '', lessonStatus: 'BOOKED', skaters, ...o });

/** Monday, Nov 16 at 6:35 AM: the 6:00 recorded, the 6:30 under way, the 8:30 to come, the 11:00 held. */
const DAY: RinkDay = {
  coachFirstName: 'Dana', coachTimezone: 'America/Chicago', today: '2026-11-16', now: '06:35',
  lessons: [
    lesson('06:00', [skater('sam', 'Sam R.', 'Sam Rivera', { status: 'CHECKED_IN', outcomeAt: '2026-11-16T12:02:00Z' })]),
    lesson('06:30', [skater('mia', 'Mia C.', 'Mia Chen')]),
    lesson('08:30', [skater('owen', 'Owen B.', 'Owen Baker')]),
    lesson('11:00', [], { lessonStatus: 'HELD' }),
  ],
};

function server(over: Record<string, (init?: RequestInit) => Response> = {}) {
  const calls: Array<{ url: string; body: unknown }> = [];
  const f = vi.fn((url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : null });
    const key = Object.keys(over).find((k) => url.startsWith(k));
    if (key) return Promise.resolve(over[key]!(init));
    if (url === '/api/coach/rinkside/today') return Promise.resolve(new Response(JSON.stringify(DAY), { status: 200 }));
    if (url === '/api/coach/local/token') return Promise.resolve(new Response(JSON.stringify({ idToken: 'h.eyJlbWFpbCI6ImRhbmFAZ21haWwuY29tIn0.s' }), { status: 200 }));
    return Promise.resolve(new Response('{}', { status: 404 }));
  });
  vi.stubGlobal('fetch', f);
  return calls;
}

beforeEach(() => { sessionStorage.clear(); window.location.hash = ''; });
afterEach(() => vi.unstubAllGlobals());

const signedIn = () => sessionStorage.setItem('bb.coach.idToken', 'h.eyJlbWFpbCI6ImRhbmFAZ21haWwuY29tIn0.s');

test('signed out, the log-in says what the page does, and logging in shows today', async () => {
  server();
  render(<App />);
  expect(screen.getByRole('heading', { name: 'BladeBook at the rink' })).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Login email'), 'dana@gmail.com');
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
  expect(await screen.findByText('Mia C.')).toBeInTheDocument();
});

test('today shows each lesson: recorded, under way with buttons, later with its start time, and held', async () => {
  signedIn();
  server();
  render(<App />);
  expect(await screen.findByText('1 of 3 recorded')).toBeInTheDocument();
  expect(screen.getByText('Next: Mia C. 6:30am')).toBeInTheDocument();
  expect(screen.getByText('Sam R.').closest('.rl')).toHaveTextContent(/Present · 6:02/);
  expect(screen.getByText('Mia C.').closest('.rl')).toHaveClass('rl--now');
  expect(within(screen.getByText('Mia C.').closest('.rl') as HTMLElement).getByRole('button', { name: /Present/ })).toBeInTheDocument();
  expect(screen.getByText('Starts at 8:30 AM')).toBeInTheDocument();
  expect(screen.getByText('Held slot')).toBeInTheDocument();
  // No Undo on the phone (R1).
  expect(screen.queryByRole('button', { name: /Undo/ })).not.toBeInTheDocument();
});

test('Present sends the tap time and shows what was recorded', async () => {
  signedIn();
  const calls = server({ '/api/coach/rinkside/attendance': () => new Response(JSON.stringify(
    skater('mia', 'Mia C.', 'Mia Chen', { status: 'CHECKED_IN', outcomeAt: '2026-11-16T12:36:00Z' })), { status: 200 }) });
  render(<App />);
  const mia = (await screen.findByText('Mia C.')).closest('.rl') as HTMLElement;
  await userEvent.click(within(mia).getByRole('button', { name: /Present/ }));
  await waitFor(() => expect(mia).toHaveTextContent(/Present · 6:36/));
  const sent = calls.find((c) => c.url === '/api/coach/rinkside/attendance')!.body as Record<string, string>;
  expect(sent).toMatchObject({ date: '2026-11-16', startTime: '06:30', studentId: 'mia', outcome: 'CHECKED_IN' });
  expect(Date.parse(sent.outcomeAt!)).not.toBeNaN();
});

test('a tap on a name fetches the family’s contact details for that tap only', async () => {
  signedIn();
  server({ '/api/coach/rinkside/contact/mia': () => new Response(JSON.stringify({ studentName: 'Mia Chen', isMinor: true, relationship: 'GUARDIAN',
    clientName: 'Lily Chen', phone: '(205) 555-0110', email: 'lily@example.com' }), { status: 200 }) });
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'Mia C.' }));
  const sheet = await screen.findByRole('dialog', { name: 'Contact details' });
  expect(await within(sheet).findByText('(205) 555-0110')).toBeInTheDocument();
  expect(sheet).toHaveTextContent('Lily Chen · guardian · minor');
  expect(sheet).toHaveTextContent('Shown for this tap only. Not saved on this phone.');
});

test('cancelling from the list always confirms, names the skater, date and time, and asks release or hold (R6)', async () => {
  signedIn();
  const calls = server({ '/api/coach/rinkside/cancel': () => new Response(JSON.stringify({ cancelled: 1 }), { status: 200 }) });
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'More for Owen B.' }));
  await userEvent.click(within(screen.getByRole('dialog', { name: 'More' })).getByRole('button', { name: /Cancel this lesson/ }));
  const sheet = screen.getByRole('dialog', { name: 'Cancel lesson' });
  expect(sheet).toHaveTextContent('Cancel Owen B. · Today, Mon, Nov 16 · 8:30 AM?');
  expect(sheet).toHaveTextContent('Sarah Park will be emailed. This can’t be undone.');
  await userEvent.click(within(sheet).getByRole('button', { name: 'Hold it closed' }));
  await userEvent.click(within(sheet).getByRole('button', { name: 'Cancel lesson' }));
  expect(await screen.findByText('Owen B.’s 8:30 AM lesson cancelled. The family will be emailed. The time stays closed.')).toBeInTheDocument();
  expect(calls.find((c) => c.url === '/api/coach/rinkside/cancel')!.body).toEqual({ scope: 'LESSON', picks: [{ date: '2026-11-16', startTime: '08:30', after: 'HOLD' }] });
});

test('a lesson under way can’t be cancelled from the sheet', async () => {
  signedIn();
  server();
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'More for Mia C.' }));
  expect(within(screen.getByRole('dialog', { name: 'More' })).getByRole('button', { name: /Cancel this lesson/ })).toBeDisabled();
});

test('an old sign-in goes back to the log-in with a note, and Account logs out', async () => {
  signedIn();
  server({ '/api/coach/rinkside/today': () => new Response(JSON.stringify({ error: 'SIGN_IN_AGAIN', message: 'Please sign in again.' }), { status: 401 }) });
  render(<App />);
  expect(await screen.findByText('You’ve been logged in for a while. Please log in again.')).toBeInTheDocument();
  expect(sessionStorage.getItem('bb.coach.idToken')).toBeNull();
});
