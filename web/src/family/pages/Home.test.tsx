import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import type { Family } from '../api';
import { APPROVED, WAITING } from '../testData';
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
    coaches: [...WAITING.coaches, { firstName: 'Ben', lastName: 'Ortiz', status: 'PENDING', skaterNames: ['Jack Park'], waitingNames: ['Jack Park'], details: null }],
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
