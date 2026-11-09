import { render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { scheduleApi, type CalendarDto, type LessonDto } from '../api';
import { Calendar } from './Calendar';

const open = (startTime: string, durationMinutes = 30): LessonDto => ({
  startTime, durationMinutes, priceMinor: 5000, currency: 'USD', lessonStatus: 'OPEN', maxSkaters: 1, seatsTaken: 0,
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
  expect(screen.getByText('It’s Monday 6:40 AM. Past times are greyed.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Cancel/ })).not.toBeInTheDocument(); // cancelling is Batch 5
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
  expect(await screen.findByRole('link', { name: 'Build your teaching week' })).toHaveAttribute('href', '#/schedule/weekly');
  expect(screen.getByText('No lessons on Tuesdays')).toBeInTheDocument();
});
