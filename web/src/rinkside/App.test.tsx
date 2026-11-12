import { act, render, screen, waitFor, within } from '@testing-library/react';
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

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); window.location.hash = ''; });
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

// ---------------------------------------------------------------- no signal (Batch 10; C_Rinkside Offline.md)

const DANA = 'dana@gmail.com';
const noSignal = () => () => { throw new TypeError('Failed to fetch'); };
/** The phone's clock on Monday 6:35 AM in Chicago, so the saved day is today's. Only Date is faked. */
const mondayMorning = () => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-16T12:35:00Z')); };
function signal(on: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(on);
  act(() => { window.dispatchEvent(new Event(on ? 'online' : 'offline')); });
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

test('with no signal a tap is saved on the phone, and sent when signal comes back', async () => {
  mondayMorning();
  signedIn();
  let up = false;
  const calls = server({ '/api/coach/rinkside/attendance': (init) => {
    if (!up) throw new TypeError('Failed to fetch');
    const b = JSON.parse(init!.body as string) as { outcome: string; outcomeAt: string };
    return new Response(JSON.stringify(skater('mia', 'Mia C.', 'Mia Chen', { status: 'NO_SHOW', outcomeAt: b.outcomeAt })), { status: 200 });
  } });
  render(<App />);
  const mia = (await screen.findByText('Mia C.')).closest('.rl') as HTMLElement;
  await userEvent.click(within(mia).getByRole('button', { name: /No-show/ }));
  expect(await within(mia).findByText('Saved on phone')).toBeInTheDocument();
  expect(screen.getByText(/^No signal since/)).toBeInTheDocument();
  expect(screen.getByText('1 check-in saved on this phone. They’ll send when signal comes back.')).toBeInTheDocument();
  expect(screen.getByText('1 saved on phone')).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem('bb.rink.queue')!)).toMatchObject([{ coach: DANA, studentId: 'mia', outcome: 'NO_SHOW' }]);

  up = true;
  signal(true);
  expect(await screen.findByText('Back online. 1 check-in sent.')).toBeInTheDocument();
  expect(within(mia).queryByText('Saved on phone')).not.toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem('bb.rink.queue')!)).toEqual([]);
  // Two tries with no signal (the client retries a network error once), then one send.
  const sends = calls.filter((c) => c.url === '/api/coach/rinkside/attendance');
  expect(sends).toHaveLength(3);
  expect(sends[2]!.body).toMatchObject({ studentId: 'mia', outcome: 'NO_SHOW', outcomeAt: sends[0]!.body && (sends[0]!.body as { outcomeAt: string }).outcomeAt });
});

test('opened with no signal, today comes from the phone; contact details need a connection', async () => {
  mondayMorning();
  localStorage.setItem(`bb.rink.day.${DANA}`, JSON.stringify(DAY));
  signedIn();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  const calls = server();
  render(<App />);
  expect(await screen.findByText('Mia C.')).toBeInTheDocument();
  expect(calls.find((c) => c.url === '/api/coach/rinkside/today')).toBeUndefined();
  expect(screen.getByText('Contact details and cancelling need a connection.', { exact: false })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Mia C.' }));
  expect(within(screen.getByRole('dialog', { name: 'Contact details' })).getByText('Contact details need a connection.')).toBeInTheDocument();
  expect(calls.find((c) => c.url.includes('/contact/'))).toBeUndefined();
});

test('opened with no signal and nothing saved for today, it says so instead of an empty day', async () => {
  mondayMorning();
  localStorage.setItem(`bb.rink.day.${DANA}`, JSON.stringify({ ...DAY, today: '2026-11-15' }));
  signedIn();
  server({ '/api/coach/rinkside/today': noSignal() });
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Today’s lessons haven’t loaded' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  expect(screen.queryByText('Mia C.')).not.toBeInTheDocument();
});

test('sending later: a family’s cancel shows the lesson cancelled; a wrong clock goes to Not sent with Done', async () => {
  mondayMorning();
  signedIn();
  localStorage.setItem('bb.rink.queue', JSON.stringify([
    { coach: DANA, date: '2026-11-16', startTime: '06:30', studentId: 'mia', shortName: 'Mia C.', outcome: 'NO_SHOW', outcomeAt: '2026-11-16T12:45:00Z' },
    { coach: DANA, date: '2026-11-16', startTime: '08:30', studentId: 'owen', shortName: 'Owen B.', outcome: 'CHECKED_IN', outcomeAt: '2026-11-17T03:12:00Z' },
    { coach: 'ben@gmail.com', date: '2026-11-16', startTime: '07:00', studentId: 'zoe', shortName: 'Zoe K.', outcome: 'CHECKED_IN', outcomeAt: '2026-11-16T13:05:00Z' },
  ]));
  server({ '/api/coach/rinkside/attendance': (init) => {
    const b = JSON.parse(init!.body as string) as { studentId: string };
    return b.studentId === 'mia'
      ? new Response(JSON.stringify({ error: 'CONFLICT', message: 'This lesson was cancelled by the family at 6:20 AM, after you recorded it.' }), { status: 409 })
      : new Response(JSON.stringify({ error: 'INVALID', message: 'The phone’s time didn’t match the lesson, so it couldn’t be recorded.' }), { status: 400 });
  } });
  render(<App />);
  expect(await screen.findByText('Back online. Everything is up to date. A family had cancelled; see Today.')).toBeInTheDocument();
  const cancelled = screen.getByText('Mia C.').closest('.rl')!;
  expect(cancelled).toHaveClass('rl--cancelled');
  expect(cancelled).toHaveTextContent('This lesson was cancelled by the family at 6:20 AM, after you recorded it. Nothing more to do.');
  // Another coach's check-in waits for that coach (R2).
  expect(JSON.parse(localStorage.getItem('bb.rink.queue')!)).toMatchObject([{ coach: 'ben@gmail.com' }]);

  await userEvent.click(screen.getByRole('link', { name: /1 check-in couldn’t be sent/ }));
  const card = (await screen.findByText('Owen B.')).closest('.rl')!;
  expect(card).toHaveTextContent('Recorded Present at 9:12 PM, by the phone’s clock');
  expect(card).toHaveTextContent('The phone’s time didn’t match the lesson, so it couldn’t be recorded.');
  expect(within(card as HTMLElement).getByRole('link', { name: 'Record on the website' })).toHaveAttribute('href', '/coach/#/lessons');
  await userEvent.click(within(card as HTMLElement).getByRole('button', { name: 'Done' }));
  expect(await screen.findByRole('heading', { name: 'Everything was sent' })).toBeInTheDocument();
});

test('logging out with check-ins waiting warns, keeps them, and the log-in page says they’re waiting (R2)', async () => {
  mondayMorning();
  signedIn();
  server({ '/api/coach/rinkside/attendance': noSignal() });
  render(<App />);
  const mia = (await screen.findByText('Mia C.')).closest('.rl') as HTMLElement;
  await userEvent.click(within(mia).getByRole('button', { name: /Present/ }));
  await within(mia).findByText('Saved on phone');
  window.location.hash = '#/account';
  await userEvent.click(await screen.findByRole('button', { name: 'Log out' }));
  const warn = screen.getByRole('dialog', { name: 'Log out' });
  expect(warn).toHaveTextContent('1 check-in hasn’t been sent');
  expect(warn).toHaveTextContent('If you log out, they’ll send the next time you log in here. Only your login can send them.');
  await userEvent.click(within(warn).getByRole('button', { name: 'Log out' }));
  expect(await screen.findByText('1 check-in waiting on this phone')).toBeInTheDocument();
  expect(screen.getByText('Saved before you logged out. They send after you log in.')).toBeInTheDocument();
});
