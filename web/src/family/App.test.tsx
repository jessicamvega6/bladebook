import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fakes } from '../test/fakeAuth';
import { App } from './App';
import { APPROVED, LESSONS, json, WAITING } from './testData';

beforeEach(() => { sessionStorage.clear(); window.location.hash = ''; });
afterEach(() => vi.unstubAllGlobals());

test('signed out, Log in shows, with Forgot/change password (I32) and no stand-in', async () => {
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Forgot/change password' })).toHaveAttribute('href', '#/forgot');
  expect(screen.queryByText(/stand-in/i)).not.toBeInTheDocument();
});

test('a wrong password says so the same way for any email, and clears the password', async () => {
  render(<App />);
  await userEvent.type(await screen.findByLabelText('Email'), 'sarah@example.com');
  await userEvent.type(screen.getByLabelText('Password'), 'wrong');
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
  expect(await screen.findByText('That email and password don’t match. Check them and try again.')).toBeInTheDocument();
  expect(screen.getByLabelText('Password')).toHaveValue('');
});

test('forgot password: a code, then a new password, back to log in with a note', async () => {
  window.location.hash = '#/forgot';
  render(<App />);
  await userEvent.type(await screen.findByLabelText('Email'), 'sarah@example.com');
  await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
  expect(await screen.findByText(/We sent a code to/)).toHaveTextContent('sarah@example.com');
  await userEvent.type(screen.getByLabelText('Code'), '123456');
  await userEvent.type(screen.getByLabelText('New password'), 'New-pass1');
  await userEvent.click(screen.getByRole('button', { name: 'Set new password' }));
  expect(await screen.findByText('Password changed. Log in with your new password.')).toBeInTheDocument();
  expect(fakes.family.calls).toEqual(['forgotPassword sarah@example.com', 'confirmForgotPassword sarah@example.com 123456']);
});

test('a log-in whose email was never verified goes to the code, then sign-up from the coach code', async () => {
  fakes.family.unconfirmed.add('sarah@example.com');
  vi.stubGlobal('fetch', vi.fn(() => json(404, { error: 'NO_ACCOUNT', message: 'Finish signing up first.' })));
  render(<App />);
  await userEvent.type(await screen.findByLabelText('Email'), 'sarah@example.com');
  await userEvent.type(screen.getByLabelText('Password'), 'Right-pw1');
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
  expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
  expect(fakes.family.calls).toContain('resendSignUpCode sarah@example.com');
  await userEvent.type(screen.getByLabelText('Code'), '123456');
  await userEvent.click(screen.getByRole('button', { name: 'Verify email' }));
  expect(await screen.findByRole('heading', { name: 'Join your coach on BladeBook' })).toBeInTheDocument();
});

test('logging in shows a waiting family only Home and Profile', async () => {
  vi.stubGlobal('fetch', vi.fn(() => json(200, WAITING)));
  render(<App />);

  await userEvent.type(await screen.findByLabelText('Email'), 'sarah@example.com');
  await userEvent.type(screen.getByLabelText('Password'), 'Right-pw1');
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

  expect(await screen.findByRole('heading', { name: 'Welcome, Sarah' })).toBeInTheDocument();
  const nav = screen.getByRole('navigation', { name: 'Main' });
  expect(nav).toHaveTextContent('HomeProfile');
});

test('signed in with no family yet, sign-up starts at the coach code', async () => {
  fakes.family.signedInAs('sarah@example.com');
  window.location.hash = '#/home';
  vi.stubGlobal('fetch', vi.fn(() => json(404, { error: 'NO_ACCOUNT', message: 'Finish signing up first.' })));
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Join your coach on BladeBook' })).toBeInTheDocument();
});

test('an old sign-in goes back to log in with a note', async () => {
  fakes.family.signedInAs('sarah@example.com');
  window.location.hash = '#/home';
  vi.stubGlobal('fetch', vi.fn(() => json(401, { error: 'SIGN_IN_AGAIN', message: 'Please log in again.' })));
  render(<App />);
  expect(await screen.findByText('You’ve been logged in for a while. Please log in again.')).toBeInTheDocument();
});

test('opening the plain address starts at log in, signed out, even after a family logged in', async () => {
  fakes.family.signedInAs('sarah@example.com');
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  expect(fakes.family.token).toBeNull();
});

test('a link to a page inside the site keeps the sign-in', async () => {
  fakes.family.signedInAs('sarah@example.com');
  window.location.hash = '#/home';
  vi.stubGlobal('fetch', vi.fn(() => json(200, WAITING)));
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Welcome, Sarah' })).toBeInTheDocument();
});

test('an approved family’s menu opens Book a lesson and My bookings', async () => {
  fakes.family.signedInAs('sarah@example.com');
  window.location.hash = '#/home';
  const fetchMock = vi.fn((url: string) => json(200, url === '/api/client/lessons' ? LESSONS : url === '/api/client/invitations' ? [] : APPROVED));
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);

  const nav = await screen.findByRole('navigation', { name: 'Main' });
  expect(within(nav).getByRole('link', { name: 'Book a lesson' })).toHaveAttribute('href', '#/book');
  expect(within(nav).getByRole('link', { name: 'My bookings' })).toHaveAttribute('href', '#/bookings');
  // Home reads the family's lessons for Today and Coming up.
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/client/lessons', expect.anything()));
  expect(await screen.findByRole('heading', { name: 'Coming up' })).toBeInTheDocument();
});

test('#/bookings opens My bookings for an approved family', async () => {
  fakes.family.signedInAs('sarah@example.com');
  window.location.hash = '#/bookings';
  vi.stubGlobal('fetch', vi.fn((url: string) => json(200, url === '/api/client/bookings' ? { upcoming: LESSONS, recent: [] } : APPROVED)));
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'My bookings' })).toBeInTheDocument();
  expect(await screen.findByText('Ava · 30 min · $50')).toBeInTheDocument();
});

test('a waiting family going to #/bookings gets Home', async () => {
  fakes.family.signedInAs('sarah@example.com');
  window.location.hash = '#/bookings';
  vi.stubGlobal('fetch', vi.fn(() => json(200, WAITING)));
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Welcome, Sarah' })).toBeInTheDocument();
});
