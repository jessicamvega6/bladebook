import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fakes } from '../test/fakeAuth';
import { App } from './App';
import type { Profile } from './api';


const PENDING: Profile = {
  firstName: 'Dana', lastName: 'Whitfield', initials: 'DW', loginEmail: 'dana@gmail.com',
  businessEmail: null, pendingBusinessEmail: 'lessons@dana.com', emails: [], phone: null, coachTimezone: 'America/New_York',
  currency: 'USD', requiredNoticeHours: 24, coachCode: '7K2Q-M9XT', codeWorks: false, paymentInstructions: null,
  paymentTypes: [], showPhone: false, showEmail: false,
};

/** GET /api/coach/today (Batch 22): one lesson, booked and still to come. */
const TODAY = {
  coachTimezone: 'America/New_York', currency: 'USD', today: '2026-11-16', now: '08:15', weekStart: '2026-11-15', weekEnd: '2026-11-21',
  lessons: [{ startTime: '09:00', durationMinutes: 30, held: false, next: true,
    skaters: [{ studentId: 'ava', name: 'Ava Park', amountMinor: 5000, currency: 'USD', attendance: 'BOOKED' }] }],
  nextLessonDate: null, week: { count: 1, amounts: { USD: 5000 } }, unpaid: { count: 0, amounts: {} },
};

function json(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

beforeEach(() => {
  sessionStorage.clear();
  window.location.hash = '';
});
afterEach(() => vi.unstubAllGlobals());

test('with no sign-in, Log in shows, with no stand-in', async () => {
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Forgot your password?' })).toHaveAttribute('href', '#/forgot');
  expect(screen.getByRole('link', { name: 'Create a coach account' })).toHaveAttribute('href', '#/signup');
  expect(screen.queryByText(/stand-in/i)).not.toBeInTheDocument();
});

test('logging in goes to Today; a wrong password says so and clears the password', async () => {
  window.location.hash = '#/login';
  vi.stubGlobal('fetch', vi.fn((url: string) => url === '/api/coach/students'
    ? json(200, { active: [], pending: [] })
    : url === '/api/coach/today' ? json(200, TODAY) : json(200, PENDING)));
  render(<App />);
  await userEvent.type(await screen.findByLabelText('Login email'), 'dana@gmail.com');
  await userEvent.type(screen.getByLabelText('Password'), 'wrong');
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
  expect(await screen.findByText('That email and password don’t match. Check them and try again.')).toBeInTheDocument();
  expect(screen.getByLabelText('Password')).toHaveValue('');

  await userEvent.type(screen.getByLabelText('Password'), 'Right-pw1');
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
  expect(await screen.findByRole('heading', { name: /, Dana$/ })).toBeInTheDocument();
  expect(window.location.hash).toBe('#/today');
});

test('sign-up steps 1–2: the account at Cognito, the email code, then step 3 with the names from step 1', async () => {
  window.location.hash = '#/signup';
  vi.stubGlobal('fetch', vi.fn((url: string) => url === '/api/coach/profile'
    ? json(404, { error: 'NO_PROFILE', message: 'Finish setting up your account first.' }) : json(200, { active: [], pending: [] })));
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Start coaching on BladeBook' })).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('First name'), 'Dana');
  await userEvent.type(screen.getByLabelText('Last name'), 'Whitfield');
  await userEvent.type(screen.getByLabelText('Login email'), 'dana@gmail.com');
  await userEvent.type(screen.getByLabelText('Password'), 'short');
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
  expect(screen.getByText('Use a password that meets every rule below.')).toBeInTheDocument();
  expect(fakes.coach.calls).toEqual([]);

  await userEvent.clear(screen.getByLabelText('Password'));
  await userEvent.type(screen.getByLabelText('Password'), 'Skate!2026');
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
  expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
  expect(screen.getByText('dana@gmail.com')).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Code'), '123456');
  await userEvent.click(screen.getByRole('button', { name: 'Verify email' }));

  expect(await screen.findByRole('heading', { name: 'How families reach you' })).toBeInTheDocument();
  expect(fakes.coach.calls).toEqual(['signUp dana@gmail.com', 'confirmSignUp dana@gmail.com 123456']);
});

test('forgot password: a code to the login email, then a new password, back to log in with a note', async () => {
  window.location.hash = '#/forgot';
  render(<App />);
  await userEvent.type(await screen.findByLabelText('Login email'), 'dana@gmail.com');
  await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
  await userEvent.type(await screen.findByLabelText('Code'), '123456');
  await userEvent.type(screen.getByLabelText('New password'), 'New-pass1');
  await userEvent.click(screen.getByRole('button', { name: 'Set new password' }));
  expect(await screen.findByText('Password changed. Log in with your new password.')).toBeInTheDocument();
  expect(window.location.hash).toBe('#/login');
});

test('Profile → Account: the login email, Change password at Cognito, and Log out', async () => {
  fakes.coach.signedInAs('dana@gmail.com');
  window.location.hash = '#/profile/account';
  vi.stubGlobal('fetch', vi.fn((url: string) => url === '/api/coach/students' ? json(200, { active: [], pending: [] }) : json(200, PENDING)));
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Signing in' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByText('dana@gmail.com')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
  const dialog = within(screen.getByRole('dialog'));
  await userEvent.type(dialog.getByLabelText('Current password'), 'wrong');
  await userEvent.type(dialog.getByLabelText('New password'), 'New-pass1');
  await userEvent.click(dialog.getByRole('button', { name: 'Change password' }));
  expect(await dialog.findByText('Your current password isn’t right.')).toBeInTheDocument();
  await userEvent.clear(dialog.getByLabelText('Current password'));
  await userEvent.type(dialog.getByLabelText('Current password'), 'Old-pass1');
  await userEvent.click(dialog.getByRole('button', { name: 'Change password' }));
  expect(await screen.findByText('Password changed.')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
  expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  expect(fakes.coach.token).toBeNull();
});

test('a signed-in coach with no profile gets step 3, and a different email leads to step 4', async () => {
  fakes.coach.signedInAs('dana@gmail.com');
  window.location.hash = '#/today';
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
  expect(sent).toMatchObject({ firstName: 'Dana', useLoginEmail: false, businessEmail: 'lessons@dana.com', currency: 'USD',
    coachTimezone: 'America/Chicago' }); // Central by default
});

test('a field error from the API is shown on that field', async () => {
  fakes.coach.signedInAs('dana@gmail.com');
  window.location.hash = '#/today';
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
  fakes.coach.signedInAs('dana@gmail.com');
  window.location.hash = '#/today';
  vi.stubGlobal('fetch', vi.fn(() => json(401, { error: 'SIGN_IN_AGAIN', message: 'Please sign in again.' })));

  render(<App />);

  expect(await screen.findByText('You’ve been signed in for a while. Please sign in again.')).toBeInTheDocument();
  await waitFor(() => expect(fakes.coach.token).toBeNull());
});

test('a coach with a profile lands on Today with the pending-code banner', async () => {
  fakes.coach.signedInAs('dana@gmail.com');
  window.location.hash = '#/today';
  vi.stubGlobal('fetch', vi.fn((url: string) => url === '/api/coach/students'
    ? json(200, { active: [], pending: [] })
    : url === '/api/coach/today' ? json(200, TODAY) : json(200, PENDING)));

  render(<App />);

  expect(await screen.findByRole('heading', { name: /, Dana$/ })).toBeInTheDocument();
  expect(screen.getByText('Your code starts working once you confirm your business email')).toBeInTheDocument();
});

test('overview: a signed-in coach with a working code and a family waiting sees the whole Today screen', async () => {
  const profile: Profile = { ...PENDING, businessEmail: 'lessons@dana.com', pendingBusinessEmail: null, codeWorks: true };
  const kid = (id: string, name: string) => ({
    studentId: id, familyId: 'park', status: 'PENDING', studentName: name, isMinor: true, relationship: 'GUARDIAN',
    clientName: 'Sarah Park', clientEmail: 'sarah@example.com', clientPhone: '(205) 555-0196', skatingOrg: 'USFS',
    registrationNumber: '1234567', signedUpAt: '2026-11-09T15:00:00Z',
  });
  fakes.coach.signedInAs('dana@gmail.com');
  window.location.hash = '#/today';
  vi.stubGlobal('fetch', vi.fn((url: string) => url === '/api/coach/students'
    ? json(200, { active: [], pending: [kid('a', 'Ava Park'), kid('j', 'Jack Park')] })
    : url === '/api/coach/today' ? json(200, TODAY) : json(200, profile)));

  render(<App />);

  // Greeting
  expect(await screen.findByRole('heading', { level: 1, name: /, Dana$/ })).toBeInTheDocument();

  // Navigation: Today is the current page; the waiting count reaches the Students tab; later batches are shown disabled.
  const nav = within(screen.getByRole('navigation', { name: 'Main' }));
  expect(nav.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
  expect(nav.getByRole('link', { name: 'Calendar' })).toHaveAttribute('href', '#/calendar');
  expect(nav.getByRole('link', { name: 'Schedule' })).toHaveAttribute('href', '#/schedule');
  expect(nav.getByRole('link', { name: /^Students/ })).toHaveAttribute('href', '#/students');
  expect(await nav.findByLabelText('2 waiting')).toBeInTheDocument();
  expect(nav.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '#/profile');
  expect(nav.getByRole('link', { name: 'Lessons' })).toHaveAttribute('href', '#/lessons');
  expect(nav.getByRole('link', { name: 'Payments' })).toHaveAttribute('href', '#/payments');
  expect(screen.getByText('Dana Whitfield')).toBeInTheDocument();

  // The code works, so there is no "not working yet" banner.
  expect(screen.queryByText('Your code starts working once you confirm your business email')).not.toBeInTheDocument();

  // New families to approve
  expect(screen.getByRole('heading', { name: 'New families to approve' })).toBeInTheDocument();
  expect(screen.getByText('Sarah Park', { selector: '.row__title' })).toBeInTheDocument();
  expect(screen.getByText('Ava Park & Jack Park · signed up Nov 9')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Review sign-ups' })).toHaveAttribute('href', '#/students/pending');

  // The figures (Batch 22).
  expect(await screen.findByText('$50 booked')).toBeInTheDocument();
  expect(screen.getByText('Waiting for approval').closest('.stat')).toHaveTextContent('2 skatersSarah Park');

  // The way to the rinkside page (Batch 7).
  expect(screen.getByText('Heading to the rink?')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open the rinkside page' })).toHaveAttribute('href', '/rinkside/');
  // Today's lessons
  expect(screen.getByRole('heading', { name: 'Today’s lessons' })).toBeInTheDocument();
  expect(screen.getByText('1 lesson · Pelham Civic Center')).toBeInTheDocument();
  expect(screen.getByText('Ava Park', { selector: '.row__title' })).toBeInTheDocument();
  expect(screen.getByText('Next')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Day view' })).toHaveAttribute('href', '#/calendar/day/2026-11-16');
  expect(screen.getByRole('link', { name: 'Edit weekly schedule' })).toHaveAttribute('href', '#/schedule/weekly');
});

test('opening the plain address starts at sign-in, signed out, even after a coach signed in', async () => {
  fakes.coach.signedInAs('dana@gmail.com');
  window.location.hash = '';
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  expect(fakes.coach.token).toBeNull();
});
