import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { ApiError } from '../../shared/api/client';
import type { CoachApi, Profile } from '../api';
import { ProfileBusinessEmail, ProfileVisibility } from './Profile';

const DANA: Profile = {
  firstName: 'Dana', lastName: 'Whitfield', initials: 'DW', loginEmail: 'dana@gmail.com',
  businessEmail: 'dana@gmail.com', pendingBusinessEmail: null, emails: [], phone: null, coachTimezone: 'America/Chicago',
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

// ---- Business email (Batch 14; design: profile-email) ----

const LIST: Profile = {
  ...DANA,
  emails: [
    { address: 'dana@gmail.com', current: true, login: true, waiting: false, linkExpiresAt: null },
    { address: 'club@dana.com', current: false, login: false, waiting: false, linkExpiresAt: null },
    { address: 'lessons@dana.com', current: false, login: false, waiting: true, linkExpiresAt: '2099-11-19T20:15:00Z' },
    { address: 'old@dana.com', current: false, login: false, waiting: true, linkExpiresAt: '2020-01-01T00:00:00Z' },
  ],
};

test('Business email lists the login email, confirmed addresses and those waiting for their link', () => {
  render(<ProfileBusinessEmail api={{} as CoachApi} profile={LIST} onChange={vi.fn()} />);
  expect(screen.getByRole('link', { name: 'Business email' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('button', { name: /dana@gmail.com\s*Current · confirmed/ })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: /club@dana.com\s*Confirmed/ })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByText(/The link works until Thu, Nov 19 at 2:15 PM\./)).toBeInTheDocument();
  expect(screen.getByText('The link has expired. Resend it to get a new one.')).toBeInTheDocument();
  // the current address and the login email can't be removed; the others can
  expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(3);
  expect(screen.queryByRole('button', { name: 'I’ve clicked the link' })).not.toBeInTheDocument();
});

test('Use a new address sends its confirmation link', async () => {
  const addBusinessEmail = vi.fn(() => Promise.resolve(LIST));
  const onChange = vi.fn();
  render(<ProfileBusinessEmail api={{ addBusinessEmail } as unknown as CoachApi} profile={DANA} onChange={onChange} />);
  await userEvent.click(screen.getByRole('button', { name: 'Use a new address' }));
  await userEvent.type(screen.getByLabelText('New business email'), 'lessons');
  await userEvent.click(screen.getByRole('button', { name: 'Send confirmation link' }));
  expect(screen.getByText('Enter an email address like you@example.com.')).toBeInTheDocument();
  expect(addBusinessEmail).not.toHaveBeenCalled();

  await userEvent.type(screen.getByLabelText('New business email'), '@dana.com');
  await userEvent.click(screen.getByRole('button', { name: 'Send confirmation link' }));
  expect(addBusinessEmail).toHaveBeenCalledWith('lessons@dana.com');
  expect(await screen.findByText('Confirmation link sent to lessons@dana.com.')).toBeInTheDocument();
  expect(onChange).toHaveBeenCalledWith(LIST);
});

test('an address already on the list is refused by the box', async () => {
  const addBusinessEmail = vi.fn(() => Promise.reject(new ApiError(400, 'INVALID', 'That address is already on your list.', 'address')));
  render(<ProfileBusinessEmail api={{ addBusinessEmail } as unknown as CoachApi} profile={LIST} onChange={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Use a new address' }));
  await userEvent.type(screen.getByLabelText('New business email'), 'club@dana.com');
  await userEvent.click(screen.getByRole('button', { name: 'Send confirmation link' }));
  expect(await screen.findByText('That address is already on your list.')).toBeInTheDocument();
  expect(screen.getByLabelText('New business email')).toHaveAttribute('aria-invalid', 'true');
});

test('Resend link and Remove act on that address', async () => {
  const resendLink = vi.fn(() => Promise.resolve(LIST));
  const removeBusinessEmail = vi.fn(() => Promise.resolve(LIST));
  render(<ProfileBusinessEmail api={{ resendLink, removeBusinessEmail } as unknown as CoachApi} profile={LIST} onChange={vi.fn()} />);
  await userEvent.click(screen.getAllByRole('button', { name: 'Resend link' })[0]!);
  expect(resendLink).toHaveBeenCalledWith('lessons@dana.com');
  expect(await screen.findByText('Sent a new link to lessons@dana.com. The one sent before no longer works.')).toBeInTheDocument();
  await userEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]!);
  expect(removeBusinessEmail).toHaveBeenCalledWith('club@dana.com');
});

test('picking a confirmed address and saving makes it the business email', async () => {
  const chooseBusinessEmail = vi.fn(() => Promise.resolve({ ...LIST, businessEmail: 'club@dana.com' }));
  render(<ProfileBusinessEmail api={{ chooseBusinessEmail } as unknown as CoachApi} profile={LIST} onChange={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: /club@dana.com\s*Confirmed/ }));
  expect(screen.getByRole('button', { name: /club@dana.com\s*Current · confirmed/ })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(chooseBusinessEmail).toHaveBeenCalledWith('club@dana.com');
  expect(await screen.findByText('Saved.')).toBeInTheDocument();
});
