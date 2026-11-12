import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import type { Profile } from '../api';
import { CodeCard, CodePendingBanner } from './CodeCard';

export const DANA: Profile = {
  firstName: 'Dana', lastName: 'Whitfield', initials: 'DW', loginEmail: 'dana@gmail.com',
  businessEmail: 'dana@gmail.com', pendingBusinessEmail: null, phone: null, coachTimezone: 'America/Chicago',
  currency: 'USD', requiredNoticeHours: 24, coachCode: '7K2Q-M9XT', codeWorks: true, paymentInstructions: null,
  paymentTypes: [], showPhone: false, showEmail: false,
};
const PENDING: Profile = { ...DANA, businessEmail: null, pendingBusinessEmail: 'lessons@dana.com', codeWorks: false };

test('a working code says families can use it', () => {
  render(<CodeCard profile={DANA} />);
  expect(screen.getByText('7K2Q-M9XT')).toBeInTheDocument();
  expect(screen.getByText('Families enter this to sign up with you.')).toBeInTheDocument();
  expect(screen.queryByText('Not working yet')).not.toBeInTheDocument();
});

test('a code waiting for the business email is marked Not working yet', () => {
  render(<CodeCard profile={PENDING} />);
  expect(screen.getByText('Not working yet')).toBeInTheDocument();
  expect(screen.getByText('Starts working once you confirm your business email.')).toBeInTheDocument();
});

test('the banner names the address and offers the login email instead', async () => {
  const onUseLogin = vi.fn();
  render(<CodePendingBanner profile={PENDING} onUseLogin={onUseLogin} />);
  expect(screen.getByText('lessons@dana.com')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Use my login email instead' }));
  expect(onUseLogin).toHaveBeenCalled();
});

test('no banner once the code works', () => {
  const { container } = render(<CodePendingBanner profile={DANA} onUseLogin={() => {}} />);
  expect(container).toBeEmptyDOMElement();
});
