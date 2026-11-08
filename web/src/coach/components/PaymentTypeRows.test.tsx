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

test('Venmo can’t switch on until it has a handle', async () => {
  render(<Harness />);
  await userEvent.click(screen.getByRole('switch', { name: 'Venmo' }));
  expect(of('VENMO').on).toBe(false);
  expect(screen.getByRole('alert')).toHaveTextContent('Add your Venmo handle first.');

  await userEvent.type(screen.getByLabelText(/Venmo handle/), '@dana');
  await userEvent.click(screen.getByRole('switch', { name: 'Venmo' }));
  expect(of('VENMO')).toEqual({ type: 'VENMO', on: true, handle: '@dana' });
});

test('switching off keeps the handle', async () => {
  render(<Harness start={allTypes([{ type: 'PAYPAL', on: true, handle: 'paypal.me/dana' }])} />);
  await userEvent.click(screen.getByRole('switch', { name: 'PayPal' }));
  expect(of('PAYPAL')).toEqual({ type: 'PAYPAL', on: false, handle: 'paypal.me/dana' });
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
