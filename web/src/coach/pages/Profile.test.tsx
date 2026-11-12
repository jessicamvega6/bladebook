import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { ApiError } from '../../shared/api/client';
import type { CoachApi, Profile } from '../api';
import { ProfileVisibility } from './Profile';

const DANA: Profile = {
  firstName: 'Dana', lastName: 'Whitfield', initials: 'DW', loginEmail: 'dana@gmail.com',
  businessEmail: 'dana@gmail.com', pendingBusinessEmail: null, phone: null, coachTimezone: 'America/Chicago',
  currency: 'USD', requiredNoticeHours: 24, coachCode: '7K2Q-M9XT', codeWorks: true, paymentInstructions: null,
  paymentTypes: [], showPhone: false, showEmail: false,
};
const WITH: Profile = { ...DANA, phone: '(205) 555-0142', businessEmail: 'lessons@dana.com',
  paymentTypes: [{ type: 'CASH', on: true, handle: null }, { type: 'VENMO', on: true, handle: 'dana-skates' }, { type: 'PAYPAL', on: false, handle: 'dana' }] };

test('Visibility & texts shows what families can see, both switches off to start, and saves them', async () => {
  const saveVisibility = vi.fn((b: { showPhone: boolean; showEmail: boolean }) => Promise.resolve({ ...WITH, ...b }));
  const onChange = vi.fn();
  render(<ProfileVisibility api={{ saveVisibility } as unknown as CoachApi} profile={WITH} onChange={onChange} />);
  expect(screen.getByRole('link', { name: 'Visibility & texts' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByText('Only families you’ve approved. Never someone who has only entered your coach code.')).toBeInTheDocument();
  const phone = screen.getByRole('switch', { name: 'Phone number' });
  const email = screen.getByRole('switch', { name: 'Email address' });
  expect(phone).toHaveAttribute('aria-checked', 'false');
  expect(email).toHaveAttribute('aria-checked', 'false');
  expect(screen.getByText('(205) 555-0142')).toBeInTheDocument();
  expect(screen.getByText('Payment types').closest('.toggle-row')).toHaveTextContent('Cash · Venmo @dana-skates Each has its own switch under Payments.');
  expect(screen.getByRole('switch', { name: 'Text me when a family cancels late' })).toBeDisabled();

  await userEvent.click(phone);
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(saveVisibility).toHaveBeenCalledWith({ showPhone: true, showEmail: false });
  expect(await screen.findByText('Saved.')).toBeInTheDocument();
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ showPhone: true }));
});

test('switching on a phone that isn’t there shows the server’s reason by the switch', async () => {
  const saveVisibility = vi.fn(() => Promise.reject(new ApiError(400, 'INVALID', 'Add your phone number under Details first.', 'showPhone')));
  render(<ProfileVisibility api={{ saveVisibility } as unknown as CoachApi} profile={DANA} onChange={vi.fn()} />);
  expect(screen.getByText('No phone number yet. Add one under Details.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('switch', { name: 'Phone number' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Add your phone number under Details first.')).toBeInTheDocument();
});
