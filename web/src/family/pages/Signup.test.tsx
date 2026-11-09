import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { RegistrationBody } from '../api';
import { json, WAITING } from '../testData';
import { Signup } from './Signup';

const DANA = { firstName: 'Dana', lastName: 'Whitfield', initials: 'DW' };
const BEN = { firstName: 'Ben', lastName: 'Ortiz', initials: 'BO' };
let sent: RegistrationBody | undefined;

function serve() {
  sent = undefined;
  const f = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/client/coach-codes/7K2QM9XT') return json(200, DANA);
    if (url === '/api/client/coach-codes/4R8TWH6C') return json(200, BEN);
    if (url.startsWith('/api/client/coach-codes/')) return json(404, { error: 'NO_COACH', message: 'x' });
    if (url === '/api/client/local/token') return json(200, { idToken: 'tok' });
    if (url === '/api/client/registration') { sent = JSON.parse(init!.body as string); return json(201, WAITING); }
    return json(500, {});
  });
  vi.stubGlobal('fetch', f);
  return f;
}

beforeEach(() => { sessionStorage.clear(); serve(); });
afterEach(() => vi.unstubAllGlobals());

function start(token: string | null = null) {
  const props = { token, onToken: vi.fn(), onDone: vi.fn(), onSignInAgain: vi.fn() };
  const view = render(<Signup {...props} />);
  return { props, rerender: (t: string) => view.rerender(<Signup {...props} token={t} />) };
}

async function enterCode(code: string) {
  await userEvent.type(screen.getByLabelText(/code/i), code);
}

async function details(user = userEvent) {
  await user.type(screen.getByLabelText('Your first name'), 'Sarah');
  await user.type(screen.getByLabelText('Your last name'), 'Park');
  await user.type(screen.getByLabelText('Mobile phone'), '(205) 555-0196');
  await user.type(screen.getByLabelText('Email'), 'sarah@example.com');
  await user.type(screen.getByLabelText('Password'), 'Skate!2026');
  await user.type(screen.getByLabelText('Confirm password'), 'Skate!2026');
}

test('the code is looked up once it has 8 letters and numbers, and names the coach', async () => {
  start();
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await enterCode('7k2q-m9');
  expect(screen.getByText('It links your account to your coach’s lessons.')).toBeInTheDocument();

  await enterCode('xt');

  expect(await screen.findByText('Code found')).toBeInTheDocument();
  expect(screen.getByText('Coach Dana Whitfield')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Continue with Dana' })).toBeEnabled();
});

test('a code that matches no coach, and a share code, each get their message', async () => {
  start();
  await enterCode('AAAA-AAAA');
  expect(await screen.findByText('That code doesn’t match a coach. Check it with your coach. Codes are 8 letters and numbers.')).toBeInTheDocument();

  await userEvent.clear(screen.getByLabelText(/code/i));
  await enterCode('MIA-4K7QX');
  expect(await screen.findByText('That looks like a skater’s share code. Ask your coach for their coach code.')).toBeInTheDocument();
});

test('a second coach is added to the list, and the same coach twice is caught', async () => {
  start();
  await enterCode('7K2QM9XT');
  await userEvent.click(await screen.findByRole('button', { name: /Add another coach/ }));
  expect(screen.getByLabelText('Another coach’s code')).toHaveValue('');

  await enterCode('7K2Q-M9XT');
  expect(await screen.findByText('Coach Dana is already on your list.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Continue with Dana' })).toBeDisabled();

  await userEvent.clear(screen.getByLabelText('Another coach’s code'));
  await enterCode('4R8T-WH6C');
  expect(await screen.findByRole('button', { name: 'Continue with 2 coaches' })).toBeEnabled();
});

test('a guardian signs up two children and lands on the waiting page', async () => {
  const { props, rerender } = start();
  await enterCode('7K2QM9XT');
  await userEvent.click(await screen.findByRole('button', { name: 'Continue with Dana' }));

  await details();
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
  await waitFor(() => expect(props.onToken).toHaveBeenCalledWith('tok'));
  rerender('tok');

  expect(await screen.findByRole('heading', { name: 'Who’s skating?' })).toBeInTheDocument();
  const send = screen.getByRole('button', { name: /Send to Coach Dana/ });
  expect(send).toBeDisabled();
  await userEvent.type(screen.getByLabelText('Skater’s full name'), 'Ava Park');
  await userEvent.type(screen.getByLabelText('Member number'), '1234567');
  await userEvent.click(screen.getByRole('button', { name: 'Add skater' }));
  await userEvent.type(screen.getByLabelText('Skater’s full name'), 'Jack Park');
  await userEvent.click(screen.getByRole('button', { name: 'USA Hockey' }));
  await userEvent.type(screen.getByLabelText('Registration number'), '2027 kq48 15mx 3t');
  await userEvent.click(screen.getByRole('button', { name: 'Add another skater' }));
  await userEvent.click(send);

  expect(await screen.findByRole('heading', { name: 'You’re in' })).toBeInTheDocument();
  expect(sent).toEqual({
    firstName: 'Sarah', lastName: 'Park', phone: '(205) 555-0196', relationship: 'GUARDIAN', coachCodes: ['7K2QM9XT'],
    skaters: [
      { name: 'Ava Park', skatingOrg: 'USFS', registrationNumber: '1234567', coachCodes: ['7K2QM9XT'] },
      { name: 'Jack Park', skatingOrg: 'USA_HOCKEY', registrationNumber: '2027 kq48 15mx 3t', coachCodes: ['7K2QM9XT'] },
    ],
  });
  expect(screen.getAllByText('Waiting for approval')).toHaveLength(2);
  expect(screen.queryByText(/email you/i)).not.toBeInTheDocument(); // A10: no approval email is promised
  await userEvent.click(screen.getByRole('button', { name: 'Go to my account' }));
  expect(props.onDone).toHaveBeenCalledWith(WAITING);
});

test('an adult skating themselves sends one skater under their own name', async () => {
  const { rerender } = start();
  await enterCode('7K2QM9XT');
  await userEvent.click(await screen.findByRole('button', { name: 'Continue with Dana' }));
  await userEvent.click(screen.getByRole('button', { name: 'Me (18 or older)' }));
  await userEvent.type(screen.getByLabelText('First name'), 'Priya');
  await userEvent.type(screen.getByLabelText('Last name'), 'Shah');
  await userEvent.type(screen.getByLabelText('Mobile phone'), '205-555-0144');
  await userEvent.type(screen.getByLabelText('Email'), 'priya@example.com');
  await userEvent.type(screen.getByLabelText('Password'), 'Skate!2026');
  await userEvent.type(screen.getByLabelText('Confirm password'), 'Skate!2026');
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
  rerender('tok');

  expect(await screen.findByRole('heading', { name: 'You’re the skater' })).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Member number'), 'lts 4815');
  await userEvent.click(screen.getByRole('button', { name: /Send to Coach Dana/ }));

  await waitFor(() => expect(sent?.relationship).toBe('SELF'));
  expect(sent?.skaters).toEqual([{ name: 'Priya Shah', skatingOrg: 'USFS', registrationNumber: 'lts 4815', coachCodes: ['7K2QM9XT'] }]);
});

test('the account is not created until every detail is right', async () => {
  const { props } = start();
  await enterCode('7K2QM9XT');
  await userEvent.click(await screen.findByRole('button', { name: 'Continue with Dana' }));
  await details();
  await userEvent.clear(screen.getByLabelText('Confirm password'));
  await userEvent.type(screen.getByLabelText('Confirm password'), 'Skate!2027');

  await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

  expect(screen.getByText('The passwords don’t match.')).toBeInTheDocument();
  expect(props.onToken).not.toHaveBeenCalled();
});

test('pasting into the confirm-password box is turned off', async () => {
  start();
  await enterCode('7K2QM9XT');
  await userEvent.click(await screen.findByRole('button', { name: 'Continue with Dana' }));
  await userEvent.click(screen.getByLabelText('Confirm password'));
  await userEvent.paste('Skate!2026');
  expect(screen.getByLabelText('Confirm password')).toHaveValue('');
});

test('a USA Hockey number is flagged as it is typed and blocks adding the skater', async () => {
  start('tok');
  await enterCode('7K2QM9XT');
  await userEvent.click(await screen.findByRole('button', { name: 'Continue with Dana' }));
  expect(screen.getByLabelText('Email')).toHaveValue(''); // a fake token holds no email
  await userEvent.type(screen.getByLabelText('Your first name'), 'Sarah');
  await userEvent.type(screen.getByLabelText('Your last name'), 'Park');
  await userEvent.type(screen.getByLabelText('Mobile phone'), '(205) 555-0196');
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

  await userEvent.type(screen.getByLabelText('Skater’s full name'), 'Jack Park');
  await userEvent.click(screen.getByRole('button', { name: 'USA Hockey' }));
  await userEvent.type(screen.getByLabelText('Registration number'), '20270481500X3T');

  expect(screen.getByText('USA Hockey numbers are 14 characters: 9 digits and 5 letters.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add skater' })).toBeDisabled();
});

test('with two coaches each skater picks which coaches, at least one', async () => {
  start('tok');
  await enterCode('7K2QM9XT');
  await userEvent.click(await screen.findByRole('button', { name: /Add another coach/ }));
  await enterCode('4R8TWH6C');
  await userEvent.click(await screen.findByRole('button', { name: 'Continue with 2 coaches' }));
  await userEvent.type(screen.getByLabelText('Your first name'), 'Sarah');
  await userEvent.type(screen.getByLabelText('Your last name'), 'Park');
  await userEvent.type(screen.getByLabelText('Mobile phone'), '(205) 555-0196');
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

  await userEvent.type(screen.getByLabelText('Skater’s full name'), 'Ava Park');
  await userEvent.type(screen.getByLabelText('Member number'), '1234567');
  await userEvent.click(screen.getByLabelText('Coach Dana Whitfield'));
  await userEvent.click(screen.getByLabelText('Coach Ben Ortiz'));
  expect(screen.getByText('Pick at least one coach.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add skater' })).toBeDisabled();

  await userEvent.click(screen.getByLabelText('Coach Ben Ortiz'));
  await userEvent.click(screen.getByRole('button', { name: 'Add skater' }));
  await userEvent.click(screen.getByRole('button', { name: /Send to your coaches/ }));

  await waitFor(() => expect(sent?.coachCodes).toEqual(['7K2QM9XT', '4R8TWH6C']));
  expect(sent?.skaters[0]?.coachCodes).toEqual(['4R8TWH6C']);
});
