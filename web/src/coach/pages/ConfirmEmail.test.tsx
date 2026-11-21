import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { ApiError } from '../../shared/api/client';
import type { CoachApi, Profile } from '../api';
import { ConfirmEmail } from './ConfirmEmail';

const WAITING: Profile = {
  firstName: 'Dana', lastName: 'Whitfield', initials: 'DW', loginEmail: 'dana@gmail.com',
  businessEmail: null, pendingBusinessEmail: 'lessons@dana.com', phone: null, coachTimezone: 'America/Chicago',
  emails: [{ address: 'dana@gmail.com', current: false, login: true, waiting: false, linkExpiresAt: null },
    { address: 'lessons@dana.com', current: false, login: false, waiting: true, linkExpiresAt: '2026-11-19T20:15:00Z' }],
  currency: 'USD', requiredNoticeHours: 24, coachCode: '7K2Q-M9XT', codeWorks: false, paymentInstructions: null,
  paymentTypes: [], showPhone: false, showEmail: false,
};
const CONFIRMED: Profile = { ...WAITING, businessEmail: 'lessons@dana.com', pendingBusinessEmail: null, codeWorks: true };
const DOESNT_WORK = 'This link doesn’t work any more. It may have been used already, replaced by a newer link, or be more than 3 days old.';

test('opening the link only asks: nothing is confirmed until the coach chooses Confirm', async () => {
  const checkLink = vi.fn(() => Promise.resolve({ address: 'lessons@dana.com' }));
  const confirmLink = vi.fn(() => Promise.resolve({ address: 'lessons@dana.com', profile: CONFIRMED }));
  const onChange = vi.fn();
  render(<ConfirmEmail api={{ checkLink, confirmLink } as unknown as CoachApi} token="tok-1" profile={WAITING} onChange={onChange} onError={vi.fn()} />);

  expect(await screen.findByRole('heading', { name: 'Confirm your business email' })).toBeInTheDocument();
  expect(screen.getByText('lessons@dana.com')).toBeInTheDocument();
  expect(checkLink).toHaveBeenCalledWith('tok-1');
  expect(confirmLink).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

  expect(confirmLink).toHaveBeenCalledWith('tok-1');
  expect(await screen.findByRole('heading', { name: 'Business email confirmed' })).toBeInTheDocument();
  expect(screen.getByText('Your coach code works now. Families can sign up with it.')).toBeInTheDocument();
  expect(onChange).toHaveBeenCalledWith(CONFIRMED);
  expect(screen.getByRole('link', { name: 'Go to my dashboard' })).toHaveAttribute('href', '#/today');
});

test('a coach whose code already worked isn’t told it started working', async () => {
  const working = { ...WAITING, businessEmail: 'dana@gmail.com', codeWorks: true };
  const api = {
    checkLink: () => Promise.resolve({ address: 'club@dana.com' }),
    confirmLink: () => Promise.resolve({ address: 'club@dana.com', profile: { ...working, businessEmail: 'club@dana.com' } }),
  } as unknown as CoachApi;
  render(<ConfirmEmail api={api} token="t" profile={working} onChange={vi.fn()} onError={vi.fn()} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
  expect(await screen.findByText('club@dana.com')).toBeInTheDocument();
  expect(screen.queryByText(/Your coach code works now/)).not.toBeInTheDocument();
});

test('a used, replaced or expired link is refused with a way to a new one', async () => {
  const checkLink = vi.fn(() => Promise.reject(new ApiError(409, 'CONFLICT', DOESNT_WORK)));
  const onError = vi.fn();
  render(<ConfirmEmail api={{ checkLink } as unknown as CoachApi} token="old" profile={WAITING} onChange={vi.fn()} onError={onError} />);

  expect(await screen.findByRole('heading', { name: 'This link doesn’t work any more' })).toBeInTheDocument();
  expect(screen.getByText(DOESNT_WORK)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Go to Business email' })).toHaveAttribute('href', '#/profile/email');
  expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
  expect(onError).not.toHaveBeenCalled();
});

test('a link that stops working between opening and Confirm is refused too', async () => {
  const api = {
    checkLink: () => Promise.resolve({ address: 'lessons@dana.com' }),
    confirmLink: () => Promise.reject(new ApiError(409, 'CONFLICT', DOESNT_WORK)),
  } as unknown as CoachApi;
  const onChange = vi.fn();
  render(<ConfirmEmail api={api} token="t" profile={WAITING} onChange={onChange} onError={vi.fn()} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
  expect(await screen.findByText(DOESNT_WORK)).toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});

test('a signed-out or failed request goes to the app, not the refused page', async () => {
  const err = new ApiError(401, 'UNAUTHORIZED', 'Please sign in.');
  const onError = vi.fn();
  render(<ConfirmEmail api={{ checkLink: () => Promise.reject(err) } as unknown as CoachApi} token="t" profile={WAITING} onChange={vi.fn()} onError={onError} />);
  await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(err));
  expect(screen.queryByRole('heading', { name: 'This link doesn’t work any more' })).not.toBeInTheDocument();
});
