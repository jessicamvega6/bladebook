import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import type { Profile, StudentDto } from '../api';
import { Today } from './Today';

const PROFILE: Profile = {
  firstName: 'Dana', lastName: 'Whitfield', initials: 'DW', loginEmail: 'dana@gmail.com', businessEmail: 'dana@gmail.com',
  pendingBusinessEmail: null, phone: null, coachTimezone: 'America/Chicago', currency: 'USD', requiredNoticeHours: 24,
  coachCode: '7K2Q-M9XT', codeWorks: true, paymentInstructions: null, paymentTypes: [],
};

const kid = (id: string, name: string): StudentDto => ({
  studentId: id, familyId: 'park', status: 'PENDING', studentName: name, isMinor: true, relationship: 'GUARDIAN',
  clientName: 'Sarah Park', clientEmail: 'sarah@example.com', clientPhone: '(205) 555-0196', skatingOrg: 'USFS',
  registrationNumber: '1234567', signedUpAt: '2026-11-09T15:00:00Z',
});

test('new families waiting for approval are listed with a way to review them', () => {
  render(<Today profile={PROFILE} onUseLogin={vi.fn()} busy={false} pending={[kid('a', 'Ava Park'), kid('j', 'Jack Park')]} />);

  expect(screen.getByRole('heading', { name: 'New families to approve' })).toBeInTheDocument();
  expect(screen.getByText('Ava Park & Jack Park · signed up Nov 9')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Review sign-ups' })).toHaveAttribute('href', '#/students/pending');
});

test('with nobody waiting there is no card', () => {
  render(<Today profile={PROFILE} onUseLogin={vi.fn()} busy={false} />);
  expect(screen.queryByText('New families to approve')).not.toBeInTheDocument();
});
