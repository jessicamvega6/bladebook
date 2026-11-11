import { render, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { Family } from '../api';
import { APPROVED, LESSONS, TWO_COACHES, WAITING } from '../testData';
import { Home } from './Home';

test('a waiting family is told who they are waiting for, and sees nothing of the coach', () => {
  render(<Home family={WAITING} />);

  expect(screen.getByRole('heading', { name: 'Welcome, Sarah' })).toBeInTheDocument();
  expect(screen.getByText('You’re signed up with Coach Dana.')).toBeInTheDocument();
  expect(screen.getByText('Waiting for Coach Dana to approve your skaters')).toBeInTheDocument();
  expect(screen.getByText(/Until then you won’t see Coach Dana’s times and can’t book\./)).toBeInTheDocument();
  expect(screen.getAllByText('Waiting for approval')).toHaveLength(2);
  expect(screen.queryByText(/555-0142/)).not.toBeInTheDocument();
  expect(screen.queryByText(/email/i)).not.toBeInTheDocument(); // A10: no approval email is promised
});

test('waiting for two coaches lists each one', () => {
  const two: Family = {
    ...WAITING,
    coaches: [...WAITING.coaches, { coachId: null, firstName: 'Ben', lastName: 'Ortiz', status: 'PENDING', skaterNames: ['Jack Park'], waitingNames: ['Jack Park'], details: null }],
  };
  render(<Home family={two} />);

  expect(screen.getByText('Waiting for Coach Dana and Coach Ben to approve your skaters')).toBeInTheDocument();
  expect(screen.getByText('Waiting to approve Jack')).toBeInTheDocument();
  expect(screen.getByText('You’re signed up with Coach Dana and Coach Ben.')).toBeInTheDocument();
});

test('once a coach approves, their chosen contact details and payment types show', () => {
  render(<Home family={APPROVED} />);

  expect(screen.getByText('Jack is waiting for Coach Dana’s approval')).toBeInTheDocument();
  expect(screen.getByText('(205) 555-0142')).toBeInTheDocument();
  expect(screen.getByText('Venmo @dana-skates')).toBeInTheDocument();
  expect(screen.getByText('Cash')).toBeInTheDocument();
  expect(screen.getByText('Approved')).toBeInTheDocument();
});

test('a skater a coach declined is shown with no coach', () => {
  const declined: Family = { ...APPROVED, skaters: [APPROVED.skaters[0]!, { ...APPROVED.skaters[1]!, coaches: [] }] };
  render(<Home family={declined} />);
  expect(screen.getByText('Not with a coach yet')).toBeInTheDocument();
});

afterEach(() => vi.useRealTimers());

test('an approved family can book from Home, and sees what’s coming up', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-10T15:00:00Z'));
  render(<Home family={APPROVED} lessons={LESSONS} />);

  // The header button and the Go to card both open booking.
  expect(screen.getAllByRole('link', { name: 'Book a lesson' }).map((a) => a.getAttribute('href'))).toEqual(['#/book', '#/book']);
  const today = screen.getByRole('heading', { name: 'Today' }).closest('section')!;
  expect(today).toHaveTextContent('No lessons today');
  expect(today).toHaveTextContent('Next: Ava, Mon, Nov 16 at 7am');
  const next = screen.getByRole('heading', { name: 'Coming up' }).closest('section')!;
  expect(within(next).getByText('Ava Park')).toBeInTheDocument();
  expect(next).toHaveTextContent('Mon, Nov 16');
  expect(next).toHaveTextContent('30 min');
  expect(next).not.toHaveTextContent('Coach Dana');
  const goTo = screen.getByRole('heading', { name: 'Go to' }).closest('section')!;
  expect(within(goTo).getByText('My bookings').closest('.quick__item')).toHaveAttribute('aria-disabled', 'true');
});

test('a lesson today is under Today, and with two coaches each lesson names its coach', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
  render(<Home family={TWO_COACHES} lessons={LESSONS} />);

  const today = screen.getByRole('heading', { name: 'Today' }).closest('section')!;
  expect(today).toHaveTextContent('Ava Park');
  expect(today).toHaveTextContent('Today');
  expect(today).toHaveTextContent('Coach Dana · 30 min');
});

test('nothing booked yet points to booking', () => {
  render(<Home family={APPROVED} lessons={[]} />);
  expect(screen.getByText('Nothing booked yet.')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Coming up' }).closest('section')!).toHaveTextContent('Nothing booked');
});
