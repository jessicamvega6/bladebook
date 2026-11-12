import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from './App';
import { APPROVED, LESSONS, json, WAITING } from './testData';

beforeEach(() => { sessionStorage.clear(); window.location.hash = ''; });
afterEach(() => vi.unstubAllGlobals());

test('signed out, the local log-in stand-in shows', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /Log in/ })).toBeInTheDocument();
  expect(screen.getByText('Local stand-in')).toBeInTheDocument();
});

test('logging in shows a waiting family only Home and Profile', async () => {
  vi.stubGlobal('fetch', vi.fn((url: string) => url === '/api/client/local/token' ? json(200, { idToken: 'tok' }) : json(200, WAITING)));
  render(<App />);

  await userEvent.type(screen.getByLabelText('Email'), 'sarah@example.com');
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

  expect(await screen.findByRole('heading', { name: 'Welcome, Sarah' })).toBeInTheDocument();
  const nav = screen.getByRole('navigation', { name: 'Main' });
  expect(nav).toHaveTextContent('HomeProfile');
});

test('signed in with no family yet, sign-up starts at the coach code', async () => {
  sessionStorage.setItem('bb.family.idToken', 'tok');
  window.location.hash = '#/home';
  vi.stubGlobal('fetch', vi.fn(() => json(404, { error: 'NO_ACCOUNT', message: 'Finish signing up first.' })));
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Join your coach on BladeBook' })).toBeInTheDocument();
});

test('an old sign-in goes back to log in with a note', async () => {
  sessionStorage.setItem('bb.family.idToken', 'tok');
  window.location.hash = '#/home';
  vi.stubGlobal('fetch', vi.fn(() => json(401, { error: 'SIGN_IN_AGAIN', message: 'Please log in again.' })));
  render(<App />);
  expect(await screen.findByText('You’ve been logged in for a while. Please log in again.')).toBeInTheDocument();
});

test('opening the plain address starts at log in, signed out, even after a family logged in', () => {
  sessionStorage.setItem('bb.family.idToken', 'tok');
  render(<App />);
  expect(screen.getByRole('heading', { name: /Log in/ })).toBeInTheDocument();
  expect(sessionStorage.getItem('bb.family.idToken')).toBeNull();
});

test('a link to a page inside the site keeps the sign-in', async () => {
  sessionStorage.setItem('bb.family.idToken', 'tok');
  window.location.hash = '#/home';
  vi.stubGlobal('fetch', vi.fn(() => json(200, WAITING)));
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Welcome, Sarah' })).toBeInTheDocument();
});

test('an approved family’s menu opens Book a lesson and My bookings', async () => {
  sessionStorage.setItem('bb.family.idToken', 'tok');
  window.location.hash = '#/home';
  const fetchMock = vi.fn((url: string) => json(200, url === '/api/client/lessons' ? LESSONS : APPROVED));
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
  sessionStorage.setItem('bb.family.idToken', 'tok');
  window.location.hash = '#/bookings';
  vi.stubGlobal('fetch', vi.fn((url: string) => json(200, url === '/api/client/bookings' ? { upcoming: LESSONS, recent: [] } : APPROVED)));
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'My bookings' })).toBeInTheDocument();
  expect(await screen.findByText('Ava · 30 min · $50')).toBeInTheDocument();
});

test('a waiting family going to #/bookings gets Home', async () => {
  sessionStorage.setItem('bb.family.idToken', 'tok');
  window.location.hash = '#/bookings';
  vi.stubGlobal('fetch', vi.fn(() => json(200, WAITING)));
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Welcome, Sarah' })).toBeInTheDocument();
});
