import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { familyApi } from '../api';
import { APPROVED, json, WAITING } from '../testData';
import type { Family } from '../api';
import { Profile } from './Profile';

afterEach(() => vi.unstubAllGlobals());

function show(onChange = vi.fn()) {
  render(<Profile family={WAITING} api={familyApi('tok')} onChange={onChange} onSignOut={vi.fn()} onError={vi.fn()} />);
  return onChange;
}

test('skaters show with their numbers and their status with the coach', () => {
  show();
  expect(screen.getByText('How Coach Dana and BladeBook reach you.')).toBeInTheDocument();
  expect(screen.getByText('#2027KQ4815MX3T')).toBeInTheDocument();
  expect(screen.getAllByText('Waiting for approval')).toHaveLength(3); // two skaters and the coach
  expect(screen.getByText('Ava (waiting), Jack (waiting)')).toBeInTheDocument();
  expect(screen.getByLabelText('Email')).toBeDisabled();
});

test('saving sends the name and mobile number', async () => {
  const sent: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => { sent.push(JSON.parse(init!.body as string)); return json(200, WAITING); }));
  const onChange = show();

  await userEvent.clear(screen.getByLabelText('Mobile phone'));
  await userEvent.type(screen.getByLabelText('Mobile phone'), '(205) 555-0100');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByText('Saved. Your coaches see the change too.')).toBeInTheDocument();
  expect(sent).toEqual([{ firstName: 'Sarah', lastName: 'Park', phone: '(205) 555-0100' }]);
  expect(onChange).toHaveBeenCalledWith(WAITING);
});

test('a refused field is marked', async () => {
  vi.stubGlobal('fetch', vi.fn(() => json(400, { error: 'INVALID', message: 'Enter a mobile phone number.', field: 'phone' })));
  show();
  await userEvent.clear(screen.getByLabelText('Mobile phone'));
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Enter a mobile phone number.')).toBeInTheDocument();
});

// ---------------------------------------------------------- Add a skater and Add a coach (A9; Batch 15)

const LILY: Family['skaters'][number] = { studentId: 'lily', name: 'Lily Park', isMinor: true, skatingOrg: 'USFS', registrationNumber: '3407715', coaches: [] };

function server(routes: Record<string, (body: unknown) => Promise<Response>>) {
  const sent: Array<{ url: string; body: unknown }> = [];
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : null;
    sent.push({ url, body });
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    return key ? routes[key]!(body) : json(404, { error: 'NOT_FOUND', message: 'nope' });
  }));
  return sent;
}

test('adding a skater asks which coaches, offers only approved ones, and none clears the ticks', async () => {
  const sent = server({ '/api/client/me/skaters': () => json(200, { ...APPROVED, skaters: [...APPROVED.skaters, LILY] }) });
  const onChange = vi.fn();
  render(<Profile family={APPROVED} api={familyApi('tok')} onChange={onChange} onSignOut={vi.fn()} onError={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Add a skater' }));
  await userEvent.type(screen.getByLabelText('Skater’s full name'), 'Lily Park');
  await userEvent.type(screen.getByLabelText(/member number/i), '3407715');
  const add = screen.getByRole('button', { name: 'Add skater' });
  expect(add).toBeDisabled(); // nothing is ticked to start

  const dana = screen.getByRole('checkbox', { name: 'Coach Dana Whitfield' });
  const none = screen.getByRole('checkbox', { name: /None of my coaches yet/ });
  await userEvent.click(dana);
  expect(screen.getByText('Coach Dana approves new skaters')).toBeInTheDocument();
  await userEvent.click(none);
  expect(dana).not.toBeChecked();
  expect(screen.getByText('Not with a coach yet')).toBeInTheDocument();
  await userEvent.click(add);

  expect(sent[0]).toEqual({ url: '/api/client/me/skaters', body: { name: 'Lily Park', skatingOrg: 'USFS', registrationNumber: '3407715', coachIds: [], noCoach: true } });
  expect(await screen.findByText('Lily Park added. They’re not with a coach yet. When you have the coach’s code, use Add a coach.')).toBeInTheDocument();
  expect(onChange).toHaveBeenCalled();
});

test('a coach still waiting to approve anyone isn’t offered, and the hint says how to reach them', async () => {
  render(<Profile family={WAITING} api={familyApi('tok')} onChange={vi.fn()} onSignOut={vi.fn()} onError={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Add a skater' }));
  expect(screen.queryByRole('checkbox', { name: /Coach Dana/ })).not.toBeInTheDocument();
  expect(screen.getByText(/Coach Dana isn’t listed until they approve one of your skaters/)).toBeInTheDocument();
});

test('adding a coach finds them by code, marks who is already with them, and sends the ticked skaters', async () => {
  const family: Family = { ...APPROVED, skaters: [...APPROVED.skaters, LILY] };
  const sent = server({
    '/api/client/coach-codes/6P2DNB4K': () => json(404, { error: 'NO_COACH', message: 'x' }),
    '/api/client/coach-codes/6P2DNB4Y': () => json(200, { firstName: 'Marcus', lastName: 'Lee', initials: 'ML' }),
    '/api/client/coach-codes/7K2QM9XT': () => json(200, { firstName: 'Dana', lastName: 'Whitfield', initials: 'DW' }),
    '/api/client/me/coaches': () => json(200, family),
  });
  render(<Profile family={family} api={familyApi('tok')} onChange={vi.fn()} onSignOut={vi.fn()} onError={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Add a coach' }));
  const box = screen.getByLabelText('Coach code');

  await userEvent.type(box, '6P2D-NB4K');
  expect(await screen.findByText('That code doesn’t match a coach. Check it with the coach who gave it to you. Codes are 8 letters and numbers.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();

  await userEvent.clear(box);
  await userEvent.type(box, '7K2Q-M9XT');
  const ava = (await screen.findByText('Already Coach Dana’s student')).closest('.check')!;
  expect(ava).toHaveTextContent('Ava Park');
  expect(screen.getByText('Already waiting for Coach Dana')).toBeInTheDocument();

  await userEvent.clear(box);
  await userEvent.type(box, '6P2D-NB4Y');
  expect(await screen.findByText('Coach Marcus Lee')).toBeInTheDocument();
  const send = screen.getByRole('button', { name: 'Send to Coach Marcus' });
  expect(send).toBeDisabled();
  const kids = screen.getByText('Who will skate with Coach Marcus?').closest('.fieldset') as HTMLElement;
  expect(within(kids).getByRole('checkbox', { name: /Ava Park/ })).toBeInTheDocument();
  expect(within(kids).getAllByText('Also with Coach Dana')).toHaveLength(2); // Ava and Jack; Lily has no coach yet
  await userEvent.click(within(kids).getByRole('checkbox', { name: /Lily Park/ }));
  await userEvent.click(send);

  expect(sent.at(-1)).toEqual({ url: '/api/client/me/coaches', body: { coachCode: '6P2DNB4Y', studentIds: ['lily'] } });
  expect(await screen.findByText('Sent to Coach Marcus Lee. Lily can book with Coach Marcus once they approve.')).toBeInTheDocument();
});

test('someone who skates themselves isn’t offered Add a skater', () => {
  const self: Family = { ...APPROVED, contact: { ...APPROVED.contact, relationship: 'SELF' } };
  render(<Profile family={self} api={familyApi('tok')} onChange={vi.fn()} onSignOut={vi.fn()} onError={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Add a skater' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add a coach' })).toBeInTheDocument();
});
