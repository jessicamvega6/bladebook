import { render, screen, waitFor, within } from '@testing-library/react';
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
});

test('a signed-in coach with no profile gets step 3, and a different email leads to step 4', async () => {
  sessionStorage.setItem('bb.coach.idToken', TOKEN);
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
  sessionStorage.setItem('bb.coach.idToken', TOKEN);
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
  sessionStorage.setItem('bb.coach.idToken', TOKEN);
  window.location.hash = '#/today';
  vi.stubGlobal('fetch', vi.fn(() => json(401, { error: 'SIGN_IN_AGAIN', message: 'Please sign in again.' })));

  render(<App />);

  expect(await screen.findByText('You’ve been signed in for a while. Please sign in again.')).toBeInTheDocument();
  await waitFor(() => expect(sessionStorage.getItem('bb.coach.idToken')).toBeNull());
});

test('a coach with a profile lands on Today with the pending-code banner', async () => {
  sessionStorage.setItem('bb.coach.idToken', TOKEN);
  window.location.hash = '#/today';
  vi.stubGlobal('fetch', vi.fn((url: string) => url === '/api/coach/students'
    ? json(200, { active: [], pending: [] })
    : json(200, PENDING)));

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
  sessionStorage.setItem('bb.coach.idToken', TOKEN);
  window.location.hash = '#/today';
  vi.stubGlobal('fetch', vi.fn((url: string) => url === '/api/coach/students'
    ? json(200, { active: [], pending: [kid('a', 'Ava Park'), kid('j', 'Jack Park')] })
    : json(200, profile)));

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
  expect(screen.getByText('Sarah Park')).toBeInTheDocument();
  expect(screen.getByText('Ava Park & Jack Park · signed up Nov 9')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Review sign-ups' })).toHaveAttribute('href', '#/students/pending');

  // Coach code
  expect(screen.getByRole('heading', { name: 'Your coach code' })).toBeInTheDocument();
  expect(screen.getByLabelText('Coach code 7 K 2 Q - M 9 X T')).toBeInTheDocument();
  expect(screen.getByText('Families enter this to sign up with you.')).toBeInTheDocument();

  // The way to the rinkside page (Batch 7).
  expect(screen.getByText('Heading to the rink?')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open the rinkside page' })).toHaveAttribute('href', '/coach/rinkside/');
  // Today's lessons
  expect(screen.getByRole('heading', { name: 'Today’s lessons' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'calendar' })).toHaveAttribute('href', '#/calendar');
  expect(screen.getByRole('link', { name: 'edit your teaching week' })).toHaveAttribute('href', '#/schedule/weekly');
});

test('opening the plain address starts at sign-in, signed out, even after a coach signed in', () => {
  sessionStorage.setItem('bb.coach.idToken', TOKEN);
  window.location.hash = '';
  render(<App />);
  expect(screen.getByRole('heading', { name: /Sign in on this computer/ })).toBeInTheDocument();
  expect(sessionStorage.getItem('bb.coach.idToken')).toBeNull();
});
