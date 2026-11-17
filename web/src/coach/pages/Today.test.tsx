import { render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { ApiError } from '../../shared/api/client';
import type { Profile, StudentDto, TodayApi, TodayDto } from '../api';
import { Today } from './Today';

const PROFILE: Profile = {
  firstName: 'Dana', lastName: 'Whitfield', initials: 'DW', loginEmail: 'dana@gmail.com', businessEmail: 'dana@gmail.com',
  pendingBusinessEmail: null, emails: [], phone: null, coachTimezone: 'America/Chicago', currency: 'USD', requiredNoticeHours: 24,
  coachCode: '7K2Q-M9XT', codeWorks: true, paymentInstructions: null, paymentTypes: [], showPhone: false, showEmail: false,
};

const kid = (id: string, name: string, family = 'park', parent = 'Sarah Park'): StudentDto => ({
  studentId: id, familyId: family, status: 'PENDING', studentName: name, isMinor: true, relationship: 'GUARDIAN',
  clientName: parent, clientEmail: 'sarah@example.com', clientPhone: '(205) 555-0196', skatingOrg: 'USFS',
  registrationNumber: '1234567', signedUpAt: '2026-11-09T15:00:00Z',
});

const skater = (studentId: string, name: string, amountMinor: number, attendance: TodayDto['lessons'][0]['skaters'][0]['attendance']) =>
  ({ studentId, name, amountMinor, currency: 'USD', attendance });

/** Wednesday at 8:15 AM: Sam and Leo shared the 6:00, Mia didn't come at 6:30, Owen is next, 11:00 is held. */
const DAY: TodayDto = {
  coachTimezone: 'America/Chicago', currency: 'USD', today: '2026-10-14', now: '08:15', weekStart: '2026-10-11', weekEnd: '2026-10-17',
  lessons: [
    { startTime: '06:00', durationMinutes: 30, held: false, next: false,
      skaters: [skater('sam', 'Sam Rivera', 2500, 'CHECKED_IN'), skater('leo', 'Leo Martin', 2500, 'CHECKED_IN')] },
    { startTime: '06:30', durationMinutes: 30, held: false, next: false, skaters: [skater('mia', 'Mia Chen', 5000, 'NO_SHOW')] },
    { startTime: '08:30', durationMinutes: 30, held: false, next: true, skaters: [skater('owen', 'Owen Brooks', 5000, 'BOOKED')] },
    { startTime: '11:00', durationMinutes: 30, held: true, next: false, skaters: [] },
  ],
  nextLessonDate: null, week: { count: 15, amounts: { USD: 73000 } }, unpaid: { count: 13, amounts: { USD: 68000 } },
};

const api = (d: TodayDto | Error): TodayApi => ({ today: vi.fn(() => (d instanceof Error ? Promise.reject(d) : Promise.resolve(d))) });

function show(d: TodayDto | Error, pending: StudentDto[] | undefined = [], onError = vi.fn()) {
  render(<Today profile={PROFILE} api={api(d)} onUseLogin={vi.fn()} onError={onError} busy={false} pending={pending} />);
  return onError;
}

test('the figures: this week’s lessons and amount booked, unpaid past lessons, and skaters waiting', async () => {
  show(DAY, [kid('a', 'Ava Park'), kid('j', 'Jack Park'), kid('o', 'Olivia Grant', 'grant', 'Olivia Grant')]);

  const week = (await screen.findByText('This week')).closest('.stat')!;
  expect(week).toHaveTextContent('This week15 lessons$730 booked');
  expect(screen.getByText('Unpaid').closest('.stat')).toHaveTextContent('Unpaid$68013 past lessons');
  expect(screen.getByText('Waiting for approval').closest('.stat')).toHaveTextContent('Waiting for approval3 skatersSarah Park, Olivia Grant');
});

test('today’s lessons: who, length and share, attendance per skater, the next one marked, the held time not bookable', async () => {
  show(DAY);

  const card = (await screen.findByRole('heading', { name: 'Today’s lessons' })).closest('section')!;
  expect(within(card).getByText('3 lessons · Pelham Civic Center')).toBeInTheDocument();
  expect(within(card).getByRole('link', { name: 'Day view' })).toHaveAttribute('href', '#/calendar/day/2026-10-14');
  const rows = card.querySelectorAll('.row');
  expect(rows).toHaveLength(4);

  expect(rows[0]).toHaveTextContent('6:00 AM');
  expect(within(rows[0] as HTMLElement).getByText('Sam Rivera & Leo Martin')).toBeInTheDocument();
  expect(rows[0]).toHaveTextContent('30 min · $25 + $25 · shared lesson');
  expect([...rows[0]!.querySelectorAll('.sh-badge')].map((b) => b.textContent)).toEqual(['SamAttended', 'LeoAttended']);
  expect(rows[0]).toHaveClass('row--muted');

  expect(rows[1]).toHaveTextContent('Mia Chen30 min · $50No-show');
  expect(rows[2]).toHaveTextContent('Owen Brooks30 min · $50NextBooked');
  expect(rows[2]).not.toHaveClass('row--muted');
  expect(rows[3]).toHaveTextContent('11:00 AMHeld slot30 min · not bookable');
  expect(rows[3]).not.toHaveTextContent('Booked');

  expect(within(card).getByText(/Attendance comes from the rinkside app/)).toBeInTheDocument();
  expect(within(card).getByRole('link', { name: 'Lessons' })).toHaveAttribute('href', '#/lessons');
});

test('the coach code card sits under the figures (owner, 2026-11-16)', async () => {
  show(DAY);
  await screen.findByText('This week');
  const code = screen.getByText('7K2Q-M9XT').closest('.codecard')!;
  expect(code).toHaveTextContent('Your coach code7K2Q-M9XTFamilies enter this to sign up with you.');
  expect(within(code as HTMLElement).getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  expect(document.querySelector('.stats')!.nextElementSibling).toBe(code);
});

test('the coach code card says it isn’t working yet until the business email is confirmed', async () => {
  render(<Today profile={{ ...PROFILE, codeWorks: false, pendingBusinessEmail: 'dana@whitfieldskating.com' }} api={api(DAY)}
    onUseLogin={vi.fn()} onError={vi.fn()} busy={false} pending={[]} />);
  await screen.findByText('This week');
  const code = screen.getByText('7K2Q-M9XT').closest('.codecard')!;
  expect(code).toHaveClass('codecard--pending');
  expect(code).toHaveTextContent('Not working yet');
  expect(code).toHaveTextContent('Starts working once you confirm your business email.');
});

test('the greeting and date are the coach’s own, with a way to the week view', async () => {
  show({ ...DAY, now: '14:05' });
  expect(await screen.findByRole('heading', { level: 1, name: 'Good afternoon, Dana' })).toBeInTheDocument();
  expect(screen.getByText('Wednesday, October 14')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open week view' })).toHaveAttribute('href', '#/calendar');
});

test('a day with no lessons says when the next one is', async () => {
  show({ ...DAY, lessons: [], nextLessonDate: '2026-10-16' });
  expect(await screen.findByText('No lessons today')).toBeInTheDocument();
  expect(screen.getByText('Your next lesson is on Friday, Oct 16.')).toBeInTheDocument();
  expect(screen.getByText('0 lessons · Pelham Civic Center')).toBeInTheDocument();
});

test('a day with no lessons and nothing booked after says so', async () => {
  show({ ...DAY, lessons: [], nextLessonDate: null, week: { count: 0, amounts: {} }, unpaid: { count: 0, amounts: {} } });
  expect(await screen.findByText('Nothing is booked after today yet.')).toBeInTheDocument();
  expect(screen.getByText('This week').closest('.stat')).toHaveTextContent('0 lessons$0 booked');
  expect(screen.getByText('Unpaid').closest('.stat')).toHaveTextContent('$00 past lessons');
});

test('nobody waiting: the figure says so and there is no sign-ups card', async () => {
  show(DAY, []);
  expect((await screen.findByText('Waiting for approval')).closest('.stat')).toHaveTextContent('0 skatersNobody waiting');
  expect(screen.queryByText('New families to approve')).not.toBeInTheDocument();
});

test('new families waiting for approval are listed with a way to review them', async () => {
  show(DAY, [kid('a', 'Ava Park'), kid('j', 'Jack Park')]);
  expect(await screen.findByRole('heading', { name: 'New families to approve' })).toBeInTheDocument();
  expect(screen.getByText('Ava Park & Jack Park · signed up Nov 9')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Review sign-ups' })).toHaveAttribute('href', '#/students/pending');
});

test('go to: a link to every page, and Email templates shown as Phase 2', async () => {
  show(DAY);
  const card = (await screen.findByRole('heading', { name: 'Go to' })).closest('section')!;
  const links = within(card).getAllByRole('link').map((a) => `${a.textContent} ${a.getAttribute('href')}`);
  expect(links).toEqual([
    'Edit weekly schedule #/schedule/weekly', 'Time off or special schedule #/schedule', 'Month #/calendar/month/2026-10-14',
    'Week #/calendar', 'Students #/students', 'Payments #/payments', 'Financial summary #/finances', 'Profile #/profile',
  ]);
  expect(within(card).getByText('Email templates').closest('.quick__item')).toHaveAttribute('aria-disabled', 'true');
  expect(within(card).getByText('Phase 2')).toBeInTheDocument();
});

test('lessons that fail to load say so, and the rest of the page still works', async () => {
  const onError = show(new Error('The server didn’t answer.'), [kid('a', 'Ava Park')]);
  expect(await screen.findByText('Couldn’t load today’s lessons')).toBeInTheDocument();
  expect(screen.getByText('The server didn’t answer.')).toBeInTheDocument();
  expect(screen.getByText('Heading to the rink?')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'New families to approve' })).toBeInTheDocument();
  expect(onError).not.toHaveBeenCalled();
});

test('a sign-in that has run out goes back to sign in', async () => {
  const onError = show(new ApiError(401, 'SIGN_IN', 'Please sign in.'));
  await vi.waitFor(() => expect(onError).toHaveBeenCalled());
});
