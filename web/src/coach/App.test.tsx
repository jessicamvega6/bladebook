import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from './App';
import type { Profile } from './api';

// A token whose payload carries the login email, as the stub's does.
const TOKEN = `h.${btoa(JSON.stringify({ email: 'dana@gmail.com' }))}.s`;

const PENDING: Profile = {
  firstName: 'Dana', lastName: 'Whitfield', initials: 'DW', loginEmail: 'dana@gmail.com',
  businessEmail: null, pendingBusinessEmail: 'lessons@dana.com', phone: null, coachTimezone: 'America/New_York',
  currency: 'USD', requiredNoticeHours: 24, coachCode: '7K2Q-M9XT', codeWorks: false, paymentInstructions: null,
  paymentTypes: [],
};

function json(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

beforeEach(() => {
  sessionStorage.clear();
  window.location.hash = '';
});
afterEach(() => vi.unstubAllGlobals());

test('with no sign-in, the local sign-in stand-in shows and says so', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /Sign in on this computer/ })).toBeInTheDocument();
  expect(screen.getAllByText('Local stand-in').length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: /Gaps & shortcuts/ })).toBeInTheDocument();
});

test('a signed-in coach with no profile gets step 3, and a different email leads to step 4', async () => {
  sessionStorage.setItem('bb.coach.idToken', TOKEN);
  sessionStorage.setItem('bb.coach.signupNames', JSON.stringify({ firstName: 'Dana', lastName: 'Whitfield' }));
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/coach/profile') return json(404, { error: 'NO_PROFILE', message: 'Finish setting up your account first.' });
    if (url === '/api/coach/signup' && init?.method === 'POST') return json(201, PENDING);
    return json(500, {});
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<App />);
  expect(await screen.findByRole('heading', { name: 'How families reach you' })).toBeInTheDocument();

  await userEvent.type(screen.getByLabelText('Business email address'), 'lessons@dana.com');
  await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }));

  expect(await screen.findByRole('heading', { name: 'Confirm your business email' })).toBeInTheDocument();
  expect(screen.getByText('Not working yet')).toBeInTheDocument();

  const sent = JSON.parse(fetchMock.mock.calls.find(([u]) => u === '/api/coach/signup')![1]!.body as string);
  expect(sent).toMatchObject({ firstName: 'Dana', useLoginEmail: false, businessEmail: 'lessons@dana.com', currency: 'USD' });
});

test('a field error from the API is shown on that field', async () => {
  sessionStorage.setItem('bb.coach.idToken', TOKEN);
  sessionStorage.setItem('bb.coach.signupNames', JSON.stringify({ firstName: 'Dana', lastName: 'Whitfield' }));
  vi.stubGlobal('fetch', vi.fn((url: string) => url === '/api/coach/profile'
    ? json(404, { error: 'NO_PROFILE', message: 'x' })
    : json(400, { error: 'INVALID', message: 'Enter an email address like name@example.com.', field: 'businessEmail' })));

  render(<App />);
  await screen.findByRole('heading', { name: 'How families reach you' });
  await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }));

  expect(await screen.findByText('Enter an email address like name@example.com.')).toBeInTheDocument();
  expect(screen.getByLabelText('Business email address')).toHaveAttribute('aria-invalid', 'true');
});

test('an expired sign-in returns to sign-in with a note', async () => {
  sessionStorage.setItem('bb.coach.idToken', TOKEN);
  vi.stubGlobal('fetch', vi.fn(() => json(401, { error: 'SIGN_IN_AGAIN', message: 'Please sign in again.' })));

  render(<App />);

  expect(await screen.findByText('You’ve been signed in for a while. Please sign in again.')).toBeInTheDocument();
  await waitFor(() => expect(sessionStorage.getItem('bb.coach.idToken')).toBeNull());
});

test('a coach with a profile lands on Today with the pending-code banner', async () => {
  sessionStorage.setItem('bb.coach.idToken', TOKEN);
  vi.stubGlobal('fetch', vi.fn(() => json(200, PENDING)));

  render(<App />);

  expect(await screen.findByRole('heading', { name: /, Dana$/ })).toBeInTheDocument();
  expect(screen.getByText('Your code starts working once you confirm your business email')).toBeInTheDocument();
});
