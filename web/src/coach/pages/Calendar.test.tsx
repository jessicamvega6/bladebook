import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { scheduleApi, type CalendarDto, type LessonDto } from '../api';
import { Calendar } from './Calendar';

const open = (startTime: string, durationMinutes = 30): LessonDto => ({
  startTime, durationMinutes, priceMinor: 5000, currency: 'USD', lessonStatus: 'OPEN', maxSkaters: 1, seatsTaken: 0, skaters: [],
});
const booked = (startTime: string): LessonDto => ({
  ...open(startTime), lessonStatus: 'BOOKED', seatsTaken: 1,
  skaters: [{ studentId: 'ava', shortName: 'Ava P.', fullName: 'Ava Park', familyName: 'Sarah Park', familyId: 'park' }],
});
const bookedFor = (startTime: string, who: string, family: string, familyId: string): LessonDto => ({
  ...booked(startTime), skaters: [{ studentId: who, shortName: `${who} P.`, fullName: who, familyName: family, familyId }],
});

function days(from: string, n: number, lessons: (date: string) => LessonDto[]) {
  const out: CalendarDto['days'] = [];
  const d = new Date(`${from}T00:00:00Z`);
  for (let i = 0; i < n; i++) {
    const date = d.toISOString().slice(0, 10);
    out.push({ date, override: false, lessons: lessons(date) });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function serve(body: CalendarDto) {
  const f = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status: 200 })));
  vi.stubGlobal('fetch', f);
  return f;
}

afterEach(() => vi.unstubAllGlobals());

// Monday, November 9, 2026, 6:40 AM in the coach's time zone.
const BASE = { coachTimezone: 'America/Chicago', today: '2026-11-09', now: '06:40', hasSchedule: true };

test('the week shows each open time, greys the past ones, and asks for exactly that week', async () => {
  const f = serve({ ...BASE, days: days('2026-11-08', 7, (d) => (d === '2026-11-09' ? [open('06:00'), open('07:00', 60)] : [])) });
  render(<Calendar api={scheduleApi('t')} route={{ view: 'week', date: '2026-11-08' }} onError={vi.fn()} />);

  expect(await screen.findByRole('heading', { name: 'Week of Nov 8' })).toBeInTheDocument();
  expect(f).toHaveBeenCalledWith('/api/coach/calendar?from=2026-11-08&to=2026-11-14', expect.anything());
  const past = screen.getByText('6:00').closest('.wl');
  expect(past).toHaveClass('wl--open', 'wl--past');
  expect(screen.getByText('7:00 · 60m').closest('.wl')).not.toHaveClass('wl--past');
  expect(screen.getByText('It’s Monday 6:40 AM. Past lessons are greyed and can’t be cancelled.')).toBeInTheDocument();
  // Only open times: nothing to cancel on its own, but the rest of the week can be held closed.
  expect(screen.queryByRole('button', { name: 'Cancel day' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cancel rest of week: Mon, Nov 9 (0 lessons, 1 open time)' })).toBeInTheDocument();
});

test('clicking a month date opens that day (S7), and open times left are counted', async () => {
  const f = serve({ ...BASE, days: days('2026-11-01', 35, (d) => (d >= '2026-11-09' && d <= '2026-11-10' ? [open('06:00'), open('09:00')] : [])) });
  render(<Calendar api={scheduleApi('t')} route={{ view: 'month', date: '2026-11-01' }} onError={vi.fn()} />);

  expect(await screen.findByText('November: 0 lessons booked, 3 open times left.')).toBeInTheDocument(); // today's 6:00 is past
  expect(f).toHaveBeenCalledWith('/api/coach/calendar?from=2026-11-01&to=2026-12-05', expect.anything());
  expect(screen.getByRole('link', { name: 'Tuesday, November 10: 0 booked, 2 open' })).toHaveAttribute('href', '#/calendar/day/2026-11-10');
});

test('the day view lists every time with its length and price', async () => {
  serve({ ...BASE, days: days('2026-11-10', 1, () => [open('06:00'), open('06:30')]) });
  render(<Calendar api={scheduleApi('t')} route={{ view: 'day', date: '2026-11-10' }} onError={vi.fn()} />);

  expect(await screen.findByRole('heading', { name: 'Tuesday, November 10' })).toBeInTheDocument();
  expect(screen.getAllByText('Families can book this time')).toHaveLength(2);
  expect(screen.getAllByText('30 min · $50')).toHaveLength(2);
  expect(screen.getByRole('link', { name: /Week of Nov 8/ })).toHaveAttribute('href', '#/calendar/week/2026-11-10');
});

test('a coach with no schedule is prompted to build one', async () => {
  serve({ ...BASE, hasSchedule: false, days: days('2026-11-10', 1, () => []) });
  render(<Calendar api={scheduleApi('t')} route={{ view: 'day', date: '2026-11-10' }} onError={vi.fn()} />);
  expect(await screen.findByRole('link', { name: 'Build your repeating weekly schedule' })).toHaveAttribute('href', '#/schedule/weekly');
  expect(screen.getByText('No lessons on Tuesdays')).toBeInTheDocument();
});

test('a booked time names the skater: short in the week, in full with the family in the day', async () => {
  serve({ ...BASE, days: days('2026-11-15', 7, (d) => (d === '2026-11-16' ? [booked('07:00'), open('07:30')] : [])) });
  const week = render(<Calendar api={scheduleApi('t')} route={{ view: 'week', date: '2026-11-15' }} onError={vi.fn()} />);
  expect(await screen.findByText('Ava P.')).toBeInTheDocument();
  expect(screen.getByText('Ava P.').closest('.wl')).not.toHaveClass('wl--open');
  week.unmount();

  serve({ ...BASE, days: days('2026-11-16', 1, () => [booked('07:00'), open('07:30')]) });
  render(<Calendar api={scheduleApi('t')} route={{ view: 'day', date: '2026-11-16' }} onError={vi.fn()} />);
  expect(await screen.findByText('Ava Park')).toBeInTheDocument();
  expect(screen.getByText('Sarah Park')).toBeInTheDocument();
  expect(screen.getByText('1 lesson booked · 1 open time')).toBeInTheDocument();
});

/** The calendar answers GETs; a POST to cancel records its body and answers {@code result}. */
function serveWithCancel(body: CalendarDto, result: unknown = { cancelled: 1, held: 0, openHeld: 0, families: 1, skipped: 0 }) {
  const sent: unknown[] = [];
  const f = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/coach/calendar/cancel') {
      sent.push(JSON.parse(init!.body as string));
      return Promise.resolve(new Response(JSON.stringify(result), { status: 200 }));
    }
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  });
  vi.stubGlobal('fetch', f);
  return { f, sent };
}

// Sunday, November 15 to Saturday the 21st; it's Monday the 16th at 6:40 AM.
const WEEK = { ...BASE, today: '2026-11-16', now: '06:40' };

test('tapping a booked lesson in the week opens the preview, asking release or hold, and confirming cancels it', async () => {
  const { sent } = serveWithCancel({ ...WEEK, days: days('2026-11-15', 7, (d) => (d === '2026-11-17' ? [booked('07:00'), open('07:30')] : [])) });
  render(<Calendar api={scheduleApi('t')} route={{ view: 'week', date: '2026-11-15' }} onError={vi.fn()} />);

  await userEvent.click(await screen.findByRole('button', { name: /Ava P\./ }));
  expect(screen.getByRole('heading', { name: 'Cancel Tue, Nov 17' })).toBeInTheDocument();
  expect(screen.getByText('For each lesson, choose whether families can book the time again.')).toBeInTheDocument();
  expect(screen.getByText('Tue, Nov 17 · 7:00 AM · 30 min')).toBeInTheDocument();
  expect(screen.getByText(/Sarah Park will each get one email listing their cancelled lesson/)).toBeInTheDocument();
  expect(screen.getByText('1 family will be emailed. Nothing changes until you confirm.')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Hold — keep closed' }));
  expect(screen.getByText('Held closed').nextElementSibling).toHaveTextContent('1');
  await userEvent.click(screen.getByRole('button', { name: 'Cancel 1 lesson' }));

  expect(sent).toEqual([{ scope: 'LESSON', picks: [{ date: '2026-11-17', startTime: '07:00', after: 'HOLD' }] }]);
  expect(await screen.findByText('1 lesson cancelled. 1 family will be emailed.')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Week of Nov 15' })).toBeInTheDocument();
});

test('Back leaves the preview without cancelling anything', async () => {
  const { sent } = serveWithCancel({ ...WEEK, days: days('2026-11-15', 7, (d) => (d === '2026-11-17' ? [booked('07:00')] : [])) });
  render(<Calendar api={scheduleApi('t')} route={{ view: 'week', date: '2026-11-15' }} onError={vi.fn()} />);
  await userEvent.click(await screen.findByRole('button', { name: /Ava P\./ }));
  await userEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('heading', { name: 'Week of Nov 15' })).toBeInTheDocument();
  expect(sent).toEqual([]);
});

test('Cancel day takes the lessons left that day, each with its own choice, and counts families once', async () => {
  const { sent } = serveWithCancel({ ...WEEK, days: days('2026-11-15', 7, (d) => (d === '2026-11-16'
    ? [bookedFor('06:00', 'Mia', 'Gina Rossi', 'rossi'), bookedFor('07:00', 'Ava', 'Sarah Park', 'park'), bookedFor('07:30', 'Jack', 'Sarah Park', 'park')]
    : [])) }, { cancelled: 2, held: 1, openHeld: 0, families: 1, skipped: 0 });
  render(<Calendar api={scheduleApi('t')} route={{ view: 'week', date: '2026-11-15' }} onError={vi.fn()} />);

  // Today's 6:00 has started: it can't be tapped, and Cancel day leaves it out.
  expect(await screen.findByText('Mia P.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Mia P\./ })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel day' }));

  expect(screen.getByRole('heading', { name: 'Cancel Mon, Nov 16' })).toBeInTheDocument();
  expect(screen.getAllByRole('group', { name: /After cancelling/ })).toHaveLength(2);
  expect(screen.getByText('Families emailed').nextElementSibling).toHaveTextContent('1');
  await userEvent.click(within(screen.getByRole('group', { name: 'After cancelling Jack’s lesson' })).getByRole('button', { name: 'Hold — keep closed' }));
  await userEvent.click(screen.getByRole('button', { name: 'Cancel 2 lessons' }));

  expect(sent).toEqual([{ scope: 'DAY', picks: [
    { date: '2026-11-16', startTime: '07:00', after: 'RELEASE' }, { date: '2026-11-16', startTime: '07:30', after: 'HOLD' }] }]);
  expect(await screen.findByText('2 lessons cancelled, 1 held closed. 1 family will be emailed.')).toBeInTheDocument();
});

test('Cancel rest of week states the range and count, and holds everything with no question (S8)', async () => {
  const { sent } = serveWithCancel({ ...WEEK, days: days('2026-11-15', 7, (d) => (d === '2026-11-16' ? [booked('06:00'), open('08:00')]
    : d === '2026-11-18' ? [booked('07:00'), open('07:30')] : [])) }, { cancelled: 1, held: 1, openHeld: 2, families: 1, skipped: 0 });
  render(<Calendar api={scheduleApi('t')} route={{ view: 'week', date: '2026-11-15' }} onError={vi.fn()} />);

  await userEvent.click(await screen.findByRole('button', { name: 'Cancel rest of week: Mon, Nov 16 – Wed, Nov 18 (1 lesson, 2 open times)' }));
  expect(screen.getByRole('heading', { name: 'Cancel the rest of the week, Mon, Nov 16 – Wed, Nov 18' })).toBeInTheDocument();
  expect(screen.getByText(/Everything left this week is held closed/)).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: /After cancelling/ })).not.toBeInTheDocument();
  expect(screen.getAllByText('Held closed')).toHaveLength(4); // the stat, one lesson and two open times
  await userEvent.click(screen.getByRole('button', { name: 'Cancel 1 lesson and 2 open times' }));

  expect(sent).toEqual([{ scope: 'WEEK', weekStart: '2026-11-15' }]);
  expect(await screen.findByText('1 lesson cancelled, 1 held closed, 2 open times closed. 1 family will be emailed.')).toBeInTheDocument();
});

test('a future week says to tap a lesson; the day view has Cancel on each lesson and Cancel this day', async () => {
  serveWithCancel({ ...WEEK, days: days('2026-11-22', 7, (d) => (d === '2026-11-23' ? [booked('07:00')] : [])) });
  const week = render(<Calendar api={scheduleApi('t')} route={{ view: 'week', date: '2026-11-22' }} onError={vi.fn()} />);
  expect(await screen.findByText('Nov 22 – Nov 28. Tap a booked lesson to cancel just that one.')).toBeInTheDocument();
  week.unmount();

  serveWithCancel({ ...WEEK, days: days('2026-11-23', 1, () => [booked('07:00'), open('07:30')]) });
  render(<Calendar api={scheduleApi('t')} route={{ view: 'day', date: '2026-11-23' }} onError={vi.fn()} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('heading', { name: 'Cancel Mon, Nov 23' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Monday, November 23/ })).toBeInTheDocument();
});

test('a lesson gone since the preview shows the server’s message on the preview', async () => {
  const f = vi.fn((url: string) => url === '/api/coach/calendar/cancel'
    ? Promise.resolve(new Response(JSON.stringify({ error: 'CONFLICT', message: 'These lessons have already started or were cancelled.' }), { status: 409 }))
    : Promise.resolve(new Response(JSON.stringify({ ...WEEK, days: days('2026-11-15', 7, (d) => (d === '2026-11-17' ? [booked('07:00')] : [])) }), { status: 200 })));
  vi.stubGlobal('fetch', f);
  const onError = vi.fn();
  render(<Calendar api={scheduleApi('t')} route={{ view: 'week', date: '2026-11-15' }} onError={onError} />);
  await userEvent.click(await screen.findByRole('button', { name: /Ava P\./ }));
  await userEvent.click(screen.getByRole('button', { name: 'Cancel 1 lesson' }));
  expect(await screen.findByText('These lessons have already started or were cancelled.')).toBeInTheDocument();
  await waitFor(() => expect(onError).not.toHaveBeenCalled());
});

test('time off and a special schedule are named on the week and day views', async () => {
  const off = { kind: 'TIME_OFF' as const, name: 'Thanksgiving break', startDate: '2026-11-22', endDate: '2026-11-28' };
  const camp = { kind: 'SPECIAL' as const, name: 'Holiday camp', startDate: '2026-11-17', endDate: '2026-11-18' };
  const body = { ...WEEK, days: days('2026-11-15', 7, (d) => (d === '2026-11-17' ? [open('09:00')] : [])) };
  body.days = body.days.map((d) => ({ ...d, special: d.date === '2026-11-17' || d.date === '2026-11-18' ? camp : d.date === '2026-11-21' ? off : null }));
  serveWithCancel(body);
  const week = render(<Calendar api={scheduleApi('t')} route={{ view: 'week', date: '2026-11-15' }} onError={vi.fn()} />);
  expect(await screen.findAllByText('Holiday camp')).toHaveLength(2);
  expect(screen.getByText('Thanksgiving break')).toBeInTheDocument();
  week.unmount();

  serveWithCancel({ ...WEEK, days: days('2026-11-21', 1, () => []).map((d) => ({ ...d, special: off })) });
  const day = render(<Calendar api={scheduleApi('t')} route={{ view: 'day', date: '2026-11-21' }} onError={vi.fn()} />);
  expect(await screen.findByText('Time off: Thanksgiving break')).toBeInTheDocument();
  expect(screen.getByText('Nov 22 – Nov 28. Families can’t book these days.')).toBeInTheDocument();
  day.unmount();

  serveWithCancel({ ...WEEK, days: days('2026-11-17', 1, () => [open('09:00')]).map((d) => ({ ...d, special: camp })) });
  render(<Calendar api={scheduleApi('t')} route={{ view: 'day', date: '2026-11-17' }} onError={vi.fn()} />);
  expect(await screen.findByText('Special schedule: Holiday camp')).toBeInTheDocument();
  expect(screen.getByText('Nov 17 – Nov 18. These times replace your weekly schedule.')).toBeInTheDocument();
});
