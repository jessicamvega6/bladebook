import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, test } from 'vitest';
import type { PaymentType, PaymentTypeName } from '../api';
import { allTypes, PaymentTypeRows } from './PaymentTypeRows';

function Harness({ start = allTypes(), kept = [] as PaymentTypeName[] }) {
  const [v, setV] = useState<PaymentType[]>(start);
  return (
    <>
      <PaymentTypeRows value={v} onChange={setV} kept={new Set(kept)} />
      <output data-testid="state">{JSON.stringify(v)}</output>
    </>
  );
}
const state = () => JSON.parse(screen.getByTestId('state').textContent!) as PaymentType[];
const of = (t: PaymentTypeName) => state().find((p) => p.type === t)!;

test('every type starts off', () => {
  render(<Harness />);
  for (const s of screen.getAllByRole('switch')) expect(s).toHaveAttribute('aria-checked', 'false');
});

test('cash switches on with no handle', async () => {
  render(<Harness />);
  await userEvent.click(screen.getByRole('switch', { name: 'Cash' }));
  expect(of('CASH').on).toBe(true);
});

test('a handle box shows only while its switch is on', async () => {
  render(<Harness />);
  expect(screen.queryByLabelText(/Venmo handle/)).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('switch', { name: 'Venmo' }));
  expect(of('VENMO').on).toBe(true);
  expect(screen.getByLabelText(/Venmo handle/)).toBeInTheDocument();
  expect(screen.getByText('Add your handle below to finish switching it on.')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('switch', { name: 'Venmo' }));
  expect(screen.queryByLabelText(/Venmo handle/)).not.toBeInTheDocument();
});

test.each([
  ['Venmo', 'VENMO', '@', 'dana-skates', '@dana-skates'],
  ['Cash App', 'CASHAPP', '$', 'danaskates', '$danaskates'],
  ['PayPal', 'PAYPAL', 'paypal.me/', 'dana', 'paypal.me/dana'],
] as const)('%s shows its prefix and stores the handle with it', async (label, type, prefix, typed, stored) => {
  render(<Harness />);
  await userEvent.click(screen.getByRole('switch', { name: label }));
  expect(screen.getByText(prefix)).toBeInTheDocument();

  await userEvent.type(screen.getByLabelText(new RegExp(`${label} handle`)), typed);
  expect(of(type).handle).toBe(stored);
});

test('typing the prefix too doesn’t double it', async () => {
  render(<Harness />);
  await userEvent.click(screen.getByRole('switch', { name: 'Cash App' }));
  await userEvent.type(screen.getByLabelText(/Cash App handle/), '$dana');
  expect(of('CASHAPP').handle).toBe('$dana');
  expect(screen.getByLabelText(/Cash App handle/)).toHaveValue('dana');
});

test('clearing the box leaves no handle, not a bare prefix', async () => {
  render(<Harness start={allTypes([{ type: 'VENMO', on: true, handle: '@dana' }])} />);
  await userEvent.clear(screen.getByLabelText(/Venmo handle/));
  expect(of('VENMO').handle).toBe('');
});

test('switching off hides the box but keeps the handle', async () => {
  render(<Harness start={allTypes([{ type: 'PAYPAL', on: true, handle: 'paypal.me/dana' }])} />);
  await userEvent.click(screen.getByRole('switch', { name: 'PayPal' }));
  expect(of('PAYPAL')).toEqual({ type: 'PAYPAL', on: false, handle: 'paypal.me/dana' });
  expect(screen.queryByLabelText(/PayPal handle/)).not.toBeInTheDocument();
});

test('switching a kept handle back on asks the coach to check it first', async () => {
  render(<Harness start={allTypes([{ type: 'CASHAPP', on: false, handle: '$dana' }])} kept={['CASHAPP']} />);
  await userEvent.click(screen.getByRole('switch', { name: 'Cash App' }));

  const dialog = screen.getByRole('dialog', { name: 'Is this still your Cash App?' });
  expect(dialog).toBeInTheDocument();
  expect(of('CASHAPP').on).toBe(false);

  await userEvent.click(screen.getByRole('button', { name: 'Yes, switch it on' }));
  expect(of('CASHAPP').on).toBe(true);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('cancelling the check leaves the type off', async () => {
  render(<Harness start={allTypes([{ type: 'CASHAPP', on: false, handle: '$dana' }])} kept={['CASHAPP']} />);
  await userEvent.click(screen.getByRole('switch', { name: 'Cash App' }));
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(of('CASHAPP').on).toBe(false);
});
