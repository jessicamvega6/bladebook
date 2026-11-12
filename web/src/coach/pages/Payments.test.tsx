import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { paymentsApi, type PaymentRowDto, type PaymentsDto } from '../api';
import { Payments } from './Payments';

afterEach(() => vi.unstubAllGlobals());

const row = (startTime: string, fullName: string, o: Partial<PaymentRowDto> = {}): PaymentRowDto => ({
  date: '2026-11-16', startTime, durationMinutes: 30, studentId: fullName, fullName, familyName: 'Sarah Park', relationship: 'GUARDIAN',
  attendance: 'CHECKED_IN', amountMinor: 5000, currency: 'USD', status: 'UNPAID', paidVia: null, sharedWith: [], ...o,
});

const VIEW: PaymentsDto = {
  rows: [row('06:00', 'Ava Park'), row('06:30', 'Jack Park', { attendance: 'NO_SHOW' }), row('07:00', 'Mia Rossi', { status: 'PAID', paidVia: 'VENMO' }),
    row('07:30', 'Leo Martin', { status: 'WAIVED', attendance: 'NOT_RECORDED' })],
  totals: { unpaid: { USD: 10000 }, unpaidCount: 2, paid: { USD: 5000 }, paidCount: 1, noShows: 1, noShowsUnpaid: { USD: 5000 }, notRecorded: 1 },
  choices: ['VENMO', 'OTHER'], currency: 'USD',
};

function serve(onPost: (path: string, body: Record<string, unknown>) => Response = (_p, b) =>
  new Response(JSON.stringify(row(b.startTime as string, b.studentId as string, { status: 'PAID', paidVia: (b.paidVia as PaymentRowDto['paidVia']) ?? null })), { status: 200 })) {
  const posts: Array<{ path: string; body: Record<string, unknown> }> = [];
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      posts.push({ path: url, body });
      return Promise.resolve(onPost(url, body));
    }
    return Promise.resolve(new Response(JSON.stringify(VIEW), { status: 200 }));
  }));
  return posts;
}

const pick = () => {
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-16' } });
  fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-16' } });
};

test('a date range shows the figures and the unpaid lessons; All shows paid and waived too', async () => {
  serve();
  render(<Payments api={paymentsApi('t')} onError={vi.fn()} />);
  expect(screen.getByText('Pick a date range')).toBeInTheDocument();
  pick();
  expect(await screen.findByRole('heading', { name: 'Unpaid lessons' })).toBeInTheDocument();
  expect(document.querySelectorAll('.stat')[0]).toHaveTextContent('Unpaid$1002 lessons');
  expect(screen.getByText('No-shows').closest('.stat')).toHaveTextContent('$50 unpaid');
  expect(screen.getByRole('link', { name: 'Check attendance' })).toHaveAttribute('href', '#/lessons');
  expect(screen.getAllByRole('row')).toHaveLength(3); // header + 2 unpaid
  await userEvent.click(screen.getByRole('button', { name: 'All' }));
  const mia = screen.getByText('Mia Rossi').closest('tr')!;
  expect(mia).toHaveTextContent('Venmo · Change');
  expect(within(mia).getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  // Waived is final (R7): no Undo.
  const leo = screen.getByText('Leo Martin').closest('tr')!;
  expect(leo).toHaveTextContent('Final');
  expect(within(leo).queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
});

test('Mark paid asks how they paid, from the coach’s types and Other, and says what was recorded', async () => {
  const posts = serve();
  render(<Payments api={paymentsApi('t')} onError={vi.fn()} />);
  pick();
  const ava = (await screen.findByText('Ava Park')).closest('tr')!;
  await userEvent.click(within(ava).getByRole('button', { name: 'Mark paid' }));
  const dialog = screen.getByRole('dialog', { name: 'Mark paid' });
  expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual(['Venmo', 'Other', 'Cancel', 'Mark paid']);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Venmo' }));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Mark paid' }));
  expect(await screen.findByText('Ava Park, Nov 16: marked paid by Venmo.')).toBeInTheDocument();
  expect(posts).toEqual([{ path: '/api/coach/payments/paid', body: { date: '2026-11-16', startTime: '06:00', studentId: 'Ava Park', paidVia: 'VENMO' } }]);
});

test('Waive always asks first, and a lesson changed elsewhere says so', async () => {
  const posts = serve((path) => (path.endsWith('/waive')
    ? new Response(JSON.stringify({ error: 'CONFLICT', message: 'This lesson changed in another window. Reload the page and try again.' }), { status: 409 })
    : new Response('{}', { status: 200 })));
  render(<Payments api={paymentsApi('t')} onError={vi.fn()} />);
  pick();
  const ava = (await screen.findByText('Ava Park')).closest('tr')!;
  await userEvent.click(within(ava).getByRole('button', { name: 'Waive' }));
  const dialog = screen.getByRole('dialog', { name: 'Waive this lesson?' });
  expect(dialog).toHaveTextContent('The family won’t owe anything for it. This can’t be undone.');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Keep it unpaid' }));
  expect(posts).toEqual([]);
  await userEvent.click(within(ava).getByRole('button', { name: 'Waive' }));
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Waive lesson' }));
  expect(await screen.findByText('This lesson changed in another window. Reload the page and try again.')).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
