import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import type { CoachApi, Profile } from '../api';
import { SignupConfirm } from './SignupConfirm';

const WAITING: Profile = {
  firstName: 'Dana', lastName: 'Whitfield', initials: 'DW', loginEmail: 'dana@gmail.com',
  businessEmail: null, pendingBusinessEmail: 'lesons@dana.com', emails: [], phone: null, coachTimezone: 'America/Chicago',
  currency: 'USD', requiredNoticeHours: 24, coachCode: '7K2Q-M9XT', codeWorks: false, paymentInstructions: null,
  paymentTypes: [], showPhone: false, showEmail: false,
};

test('step 4 has the design’s three ways on and no stand-in button', () => {
  render(<SignupConfirm api={{} as CoachApi} profile={WAITING} onChange={vi.fn()} onFinish={vi.fn()} />);
  expect(screen.getByText('lesons@dana.com')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Resend link' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Change address' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Use my login email instead' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'I’ve clicked the link' })).not.toBeInTheDocument();
  expect(screen.queryByText('Local stand-in')).not.toBeInTheDocument();
});

test('Change address replaces the waiting address and sends a new link', async () => {
  const fixed = { ...WAITING, pendingBusinessEmail: 'lessons@dana.com' };
  const addBusinessEmail = vi.fn(() => Promise.resolve(fixed));
  const onChange = vi.fn();
  render(<SignupConfirm api={{ addBusinessEmail } as unknown as CoachApi} profile={WAITING} onChange={onChange} onFinish={vi.fn()} />);

  await userEvent.click(screen.getByRole('button', { name: 'Change address' }));
  const box = screen.getByLabelText('Business email address');
  expect(box).toHaveValue('lesons@dana.com');
  await userEvent.clear(box);
  await userEvent.type(box, 'lessons@dana.com');
  await userEvent.click(screen.getByRole('button', { name: 'Send confirmation link' }));

  expect(addBusinessEmail).toHaveBeenCalledWith('lessons@dana.com', 'lesons@dana.com');
  expect(onChange).toHaveBeenCalledWith(fixed);
  expect(await screen.findByText('We sent a link to lessons@dana.com.')).toBeInTheDocument();
});

test('Resend link sends a new link to the waiting address', async () => {
  const resendLink = vi.fn(() => Promise.resolve(WAITING));
  render(<SignupConfirm api={{ resendLink } as unknown as CoachApi} profile={WAITING} onChange={vi.fn()} onFinish={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Resend link' }));
  expect(resendLink).toHaveBeenCalledWith('lesons@dana.com');
  expect(await screen.findByText('Sent a new link to lesons@dana.com. The one sent before no longer works.')).toBeInTheDocument();
});

test('coming back to the tab looks again, so a link confirmed elsewhere moves sign-up on', async () => {
  const confirmed = { ...WAITING, businessEmail: 'lesons@dana.com', pendingBusinessEmail: null, codeWorks: true };
  const profile = vi.fn(() => Promise.resolve(confirmed));
  const onChange = vi.fn();
  render(<SignupConfirm api={{ profile } as unknown as CoachApi} profile={WAITING} onChange={onChange} onFinish={vi.fn()} />);
  fireEvent(window, new Event('focus'));
  await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(confirmed));
});
