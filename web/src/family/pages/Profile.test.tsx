import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { familyApi } from '../api';
import { json, WAITING } from '../testData';
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
