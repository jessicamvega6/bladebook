import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from './App';
import { json, WAITING } from './testData';

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
  vi.stubGlobal('fetch', vi.fn(() => json(404, { error: 'NO_ACCOUNT', message: 'Finish signing up first.' })));
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Join your coach on BladeBook' })).toBeInTheDocument();
});

test('an old sign-in goes back to log in with a note', async () => {
  sessionStorage.setItem('bb.family.idToken', 'tok');
  vi.stubGlobal('fetch', vi.fn(() => json(401, { error: 'SIGN_IN_AGAIN', message: 'Please log in again.' })));
  render(<App />);
  expect(await screen.findByText('You’ve been logged in for a while. Please log in again.')).toBeInTheDocument();
});
