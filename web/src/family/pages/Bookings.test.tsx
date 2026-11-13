import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { ApiError } from '../../shared/api/client';
import type { CancelResult, Family, FamilyApi, MyBookings, MyLesson } from '../api';
import { APPROVED, LESSONS, TWO_COACHES } from '../testData';
import { Bookings, SeriesChange, insideNotice } from './Bookings';

afterEach(() => vi.useRealTimers());

const lesson = (o: Partial<MyLesson>): MyLesson => ({ ...LESSONS[0]!, ...o });
/** Ava's Monday, Nov 16 at 7:00 AM in Chicago, and Tuesday's 4:00 PM. */
const MONDAY = LESSONS[0]!;
const TUESDAY = lesson({ date: '2026-11-17', startTime: '16:00', startsAtUtc: '2026-11-17T22:00:00Z', durationMinutes: 60, priceMinor: 8000 });

function fakeApi(data: MyBookings, cancel: (l: MyLesson) => Promise<CancelResult> = (l) => Promise.resolve({
  outcome: 'CANCELLED', late: false, coachFirstName: l.coachFirstName, studentName: l.studentName, date: l.date, startTime: l.startTime,
})) {
  let current = data;
  const api = {
    myBookings: vi.fn(() => Promise.resolve(current)),
    cancel: vi.fn(async (l: MyLesson) => {
      const r = await cancel(l);
      current = { ...current, upcoming: current.upcoming.filter((x) => x.date !== l.date || x.startTime !== l.startTime) };
      return r;
    }),
  };
  return api as unknown as FamilyApi & typeof api;
}

function show(family: Family, api: FamilyApi) {
  const onError = vi.fn();
  render(<Bookings family={family} api={api} onError={onError} />);
  return onError;
}

const at = (iso: string) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(iso)); };

test('upcoming lessons show the date, time, skater, length and price, with Cancel on each', async () => {
  at('2026-11-10T15:00:00Z');
  show(APPROVED, fakeApi({ upcoming: [MONDAY, TUESDAY], recent: [] }));

  expect(await screen.findByText('Lessons with Coach Dana Whitfield')).toBeInTheDocument();
  const up = screen.getByRole('heading', { name: 'Upcoming' }).closest('section')!;
  expect(up).toHaveTextContent('2 lessons. Cancelling one doesn’t change the rest of its series.');
  expect(within(up).getByText('Mon · 7:00 AM')).toBeInTheDocument();
  expect(within(up).getByText('Ava · 30 min · $50')).toBeInTheDocument();
  expect(within(up).getByText('Ava · 60 min · $80')).toBeInTheDocument();
  expect(within(up).getAllByRole('button', { name: 'Cancel' })).toHaveLength(2);
  expect(screen.getByRole('link', { name: 'Book a lesson' })).toHaveAttribute('href', '#/book');
  // One skater approved: no filter.
  expect(screen.queryByRole('group', { name: 'Skater' })).not.toBeInTheDocument();
});

test('a lesson today is marked Today', async () => {
  at('2026-11-16T12:00:00Z');
  show(APPROVED, fakeApi({ upcoming: [MONDAY], recent: [] }));
  const up = (await screen.findByRole('heading', { name: 'Upcoming' })).closest('section')!;
  expect(within(up).getByText('Today')).toBeInTheDocument();
});

test('nothing booked offers Book a lesson', async () => {
  show(APPROVED, fakeApi({ upcoming: [], recent: [] }));
  expect(await screen.findByText('Nothing booked')).toBeInTheDocument();
  expect(screen.getByText('Book a time with Coach Dana.')).toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: 'Book a lesson' })).toHaveLength(2);
});

test('more than ten shows the first ten and Show all', async () => {
  at('2026-11-10T15:00:00Z');
  const many = Array.from({ length: 12 }, (_, i) => lesson({ date: `2026-12-${String(i + 1).padStart(2, '0')}`, startsAtUtc: `2026-12-${String(i + 1).padStart(2, '0')}T13:00:00Z` }));
  show(APPROVED, fakeApi({ upcoming: many, recent: [] }));
  const up = (await screen.findByRole('heading', { name: 'Upcoming' })).closest('section')!;
  expect(within(up).getAllByRole('button', { name: 'Cancel' })).toHaveLength(10);
  await userEvent.click(within(up).getByRole('button', { name: 'Show all 12' }));
  expect(within(up).getAllByRole('button', { name: 'Cancel' })).toHaveLength(12);
  expect(within(up).getByRole('button', { name: 'Show fewer' })).toBeInTheDocument();
});

test('recent lessons are greyed, newest first, with no Cancel', async () => {
  at('2026-11-20T15:00:00Z');
  show(APPROVED, fakeApi({ upcoming: [], recent: [{ ...TUESDAY, attendance: 'NO_SHOW' }, { ...MONDAY, attendance: null }] }));
  const recent = (await screen.findByRole('heading', { name: 'Recent' })).closest('section')!;
  expect(recent.querySelectorAll('.row--muted')).toHaveLength(2);
  expect(recent.querySelector('.row')).toHaveTextContent('Tue · 4:00 PM');
  expect(within(recent).queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  // The attendance the coach recorded; nothing recorded shows no badge (G-27).
  expect(recent.querySelectorAll('.row')[0]).toHaveTextContent('No-show');
  expect(recent.querySelectorAll('.badge')).toHaveLength(1);
});

test('cancelling in time confirms first, and Keep lesson keeps it', async () => {
  at('2026-11-10T15:00:00Z');
  const api = fakeApi({ upcoming: [MONDAY], recent: [] });
  show(APPROVED, api);
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

  const dialog = screen.getByRole('dialog', { name: 'Cancel Ava’s lesson?' });
  expect(dialog).toHaveTextContent('Mon, Nov 16 · 7:00 AM');
  expect(dialog).toHaveTextContent('30 min · $50');
  expect(dialog).toHaveTextContent('Cancelling within 24 hours of a lesson may incur a late cancellation fee.');
  expect(dialog).toHaveTextContent('The time goes back on Dana’s calendar.');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Keep lesson' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(api.cancel).not.toHaveBeenCalled();
});

test('cancelling sends the lesson, says it’s cancelled, and the list reloads', async () => {
  at('2026-11-10T15:00:00Z');
  const api = fakeApi({ upcoming: [MONDAY, TUESDAY], recent: [] });
  show(APPROVED, api);
  await userEvent.click((await screen.findAllByRole('button', { name: 'Cancel' }))[0]!);
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel lesson' }));

  expect(await screen.findByText('Ava’s lesson on Mon, Nov 16 at 7:00 AM is cancelled.')).toBeInTheDocument();
  expect(api.cancel).toHaveBeenCalledWith(MONDAY);
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Upcoming' }).closest('section')).toHaveTextContent('1 lesson.'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('inside the notice period the dialog warns, and afterwards says the coach was told', async () => {
  at('2026-11-15T14:00:00Z'); // 23 hours before Monday's 7:00
  const api = fakeApi({ upcoming: [MONDAY], recent: [] }, (l) => Promise.resolve({
    outcome: 'CANCELLED', late: true, coachFirstName: 'Dana', studentName: l.studentName, date: l.date, startTime: l.startTime,
  }));
  show(APPROVED, api);
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent('Inside the 24-hour notice period');
  expect(dialog).toHaveTextContent('Dana may charge a late cancellation fee.');
  expect(dialog).toHaveTextContent('The time goes back on Dana’s calendar and Dana will be told, because it’s a late cancellation.');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel lesson' }));
  expect(await screen.findByText('Ava’s lesson on Mon, Nov 16 at 7:00 AM is cancelled. Coach Dana has been told, because it’s a late cancellation.')).toBeInTheDocument();
});

test('a lesson that started meanwhile says so in the dialog', async () => {
  at('2026-11-10T15:00:00Z');
  const api = fakeApi({ upcoming: [MONDAY], recent: [] }, () => Promise.reject(new ApiError(409, 'CONFLICT', 'This lesson has already started, so it can’t be cancelled.')));
  const onError = show(APPROVED, api);
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel lesson' }));
  expect(await within(screen.getByRole('dialog')).findByText('This lesson has already started, so it can’t be cancelled.')).toBeInTheDocument();
  expect(onError).not.toHaveBeenCalled();
});

test('two coaches: each lesson names its coach and a Coach filter appears', async () => {
  at('2026-11-10T15:00:00Z');
  const ben = lesson({ coachId: 'ben', coachFirstName: 'Ben', date: '2026-11-18', startsAtUtc: '2026-11-18T13:00:00Z' });
  show(TWO_COACHES, fakeApi({ upcoming: [MONDAY, ben], recent: [] }));

  expect(await screen.findByText('Lessons with all your coaches')).toBeInTheDocument();
  expect(screen.getByText('Ava · Coach Ben · 30 min · $50')).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText('Coach'), 'ben');
  const up = screen.getByRole('heading', { name: 'Upcoming' }).closest('section')!;
  expect(within(up).getAllByRole('button', { name: 'Cancel' })).toHaveLength(1);
  await userEvent.click(within(up).getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('dialog', { name: 'Cancel Ava’s lesson with Coach Ben?' })).toBeInTheDocument();
});

test('two approved skaters get a skater filter, and an empty filter offers Show everything', async () => {
  at('2026-11-10T15:00:00Z');
  const both: Family = { ...APPROVED, skaters: [APPROVED.skaters[0]!, { ...APPROVED.skaters[1]!, coaches: APPROVED.skaters[0]!.coaches }] };
  show(both, fakeApi({ upcoming: [MONDAY], recent: [] }));
  await userEvent.click(await screen.findByRole('button', { name: 'Jack' }));
  expect(screen.getByText('Nothing booked for Jack')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Show everything' }));
  expect(screen.getByText('Ava · 30 min · $50')).toBeInTheDocument();
});

test('inside the notice period means strictly under the lesson’s hours, before it starts', () => {
  const start = Date.parse(MONDAY.startsAtUtc);
  expect(insideNotice(MONDAY, start - 24 * 3_600_000)).toBe(false);
  expect(insideNotice(MONDAY, start - 24 * 3_600_000 + 1000)).toBe(true);
  expect(insideNotice(MONDAY, start)).toBe(false);
});

test('a series shows on its lessons and in Repeating lessons, and Change ends it earlier with late lessons named', async () => {
  at('2026-11-22T14:00:00Z'); // Sunday 8 AM in Chicago: Monday's 7:00 is 23 hours away
  const series = (date: string): MyLesson => lesson({ date, startsAtUtc: `${date}T13:00:00Z`, recurrenceId: 'r1', intervalWeeks: 1 });
  const lessons = ['2026-11-23', '2026-11-30', '2026-12-07', '2026-12-14'].map(series);
  const data: MyBookings = { upcoming: lessons, recent: [], series: [{ coachId: 'dana', recurrenceId: 'r1', studentId: 'ava', studentName: 'Ava Park',
    coachFirstName: 'Dana', weekday: 'MONDAY', startTime: '07:00', intervalWeeks: 1, endDate: '2026-12-14', lessonsLeft: 4, lastLesson: '2026-12-14' }] };
  const api = { ...fakeApi(data), changeSeries: vi.fn(() => Promise.resolve({ cancelled: 3, late: true, coachFirstName: 'Dana', studentName: 'Ava Park',
    endDate: '2026-11-22', intervalWeeks: 1, status: 'ACTIVE' })) } as unknown as FamilyApi & { changeSeries: ReturnType<typeof vi.fn> };
  const view = render(<Bookings family={APPROVED} api={api} onError={vi.fn()} />);
  const up = (await screen.findByRole('heading', { name: 'Upcoming' })).closest('section')!;
  expect(within(up).getAllByText('Repeats weekly')).toHaveLength(4);
  const card = screen.getByRole('heading', { name: 'Repeating lessons' }).closest('section')!;
  expect(card).toHaveTextContent('Ava · Mondays 7:00 AM, every week');
  expect(card).toHaveTextContent('Until Dec 14 · 4 lessons left');
  expect(within(card).getByRole('link', { name: 'Change' })).toHaveAttribute('href', '#/bookings/series/dana/r1');
  view.unmount();

  render(<SeriesChange api={api} coachId="dana" recurrenceId="r1" onError={vi.fn()} />);
  expect(await screen.findByRole('heading', { name: 'Ava · Mondays 7:00 AM' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('New last date'), { target: { value: '2026-11-22' } });
  const what = screen.getByRole('heading', { name: 'What this will do' }).closest('section')!;
  expect(what).toHaveTextContent('Mon, Nov 23 · 7:00 AMCancelled · late');
  expect(what).toHaveTextContent('Mon, Nov 23 · 7:00 AM is less than 24 hours away. Cancelling it may incur a late cancellation fee from Coach Dana.');
  await userEvent.click(screen.getByRole('button', { name: 'Cancel 4 lessons' }));
  expect(api.changeSeries).toHaveBeenCalledWith({ coachId: 'dana', recurrenceId: 'r1', change: 'END_EARLIER', endDate: '2026-11-22' });
});

test('less often keeps the next lesson and every other one; stopping keeps nothing after today', async () => {
  at('2026-11-22T13:00:00Z');
  const series = (date: string): MyLesson => lesson({ date, startsAtUtc: `${date}T13:00:00Z`, recurrenceId: 'r1', intervalWeeks: 1 });
  const data: MyBookings = { upcoming: ['2026-11-23', '2026-11-30', '2026-12-07', '2026-12-14'].map(series), recent: [], series: [{ coachId: 'dana',
    recurrenceId: 'r1', studentId: 'ava', studentName: 'Ava Park', coachFirstName: 'Dana', weekday: 'MONDAY', startTime: '07:00', intervalWeeks: 1,
    endDate: '2026-12-14', lessonsLeft: 4, lastLesson: '2026-12-14' }] };
  render(<SeriesChange api={fakeApi(data)} coachId="dana" recurrenceId="r1" onError={vi.fn()} />);
  await userEvent.click(await screen.findByRole('button', { name: /Make it less frequent/ }));
  const what = screen.getByRole('heading', { name: 'What this will do' }).closest('section')!;
  expect(what).toHaveTextContent('2 lessons cancelled · 2 lessons kept');
  expect(what.querySelectorAll('.tli--keep')).toHaveLength(2);
  await userEvent.click(screen.getByRole('button', { name: /Cancel all future lessons/ }));
  expect(what).toHaveTextContent('4 lessons cancelled · 0 lessons kept');
});
