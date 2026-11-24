import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { paymentsApi, type PaymentRowDto, type PaymentsDto } from '../api';
import { Payments } from './Payments';

afterEach(() => vi.unstubAllGlobals());

const row = (startTime: string, fullName: string, o: Partial<PaymentRowDto> = {}): PaymentRowDto => ({
  date: '2026-11-16', startTime, durationMinutes: 30, studentId: fullName, fullName, familyName: 'Sarah Park', relationship: 'GUARDIAN',
  attendance: 'CHECKED_IN', amountMinor: 5000, currency: 'USD', status: 'UNPAID', paidVia: null, sharedWith: [], closedYear: null, viewOnly: false, paidAt: null, ...o,
});

const VIEW: PaymentsDto = {
  rows: [row('06:00', 'Ava Park'), row('06:30', 'Jack Park', { attendance: 'NO_SHOW' }), row('07:00', 'Mia Rossi', { status: 'PAID', paidVia: 'VENMO', paidAt: '2026-11-16T14:00:00Z' }),
    row('07:30', 'Leo Martin', { status: 'WAIVED', attendance: 'NOT_RECORDED' })],
  totals: { unpaid: { USD: 10000 }, unpaidCount: 2, paid: { USD: 5000 }, paidCount: 1, noShows: 1, noShowsUnpaid: { USD: 5000 }, notRecorded: 1 },
  choices: ['VENMO', 'OTHER'], currency: 'USD', thisYear: 2026,
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
  expect(posts).toEqual([{ path: '/api/coach/payments/paid', body: { date: '2026-11-16', startTime: '06:00', studentId: 'Ava Park', paidVia: 'VENMO',
    seen: { status: 'UNPAID', paidAt: null, paidVia: null } } }]);
});

test('a write carries the lesson as the page showed it, so a change made in another window is caught', async () => {
  const posts = serve();
  render(<Payments api={paymentsApi('t')} onError={vi.fn()} />);
  pick();
  await screen.findByRole('heading', { name: 'Unpaid lessons' });
  await userEvent.click(screen.getByRole('button', { name: 'All' }));
  const mia = screen.getByText('Mia Rossi').closest('tr')!;
  await userEvent.click(within(mia).getByRole('link', { name: 'Change' }));
  const dialog = screen.getByRole('dialog');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Other' }));
  await userEvent.click(within(dialog).getAllByRole('button').at(-1)!);
  await waitFor(() => expect(posts).toHaveLength(1));
  expect(posts[0].body).toEqual({ date: '2026-11-16', startTime: '07:00', studentId: 'Mia Rossi', paidVia: 'OTHER',
    seen: { status: 'PAID', paidAt: '2026-11-16T14:00:00Z', paidVia: 'VENMO' } });
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

test('Undo on a payment that counted in a closed year asks first; other paid lessons undo at once', async () => {
  // Owner, 2026-11-16: the server says which payments counted in a closed year; the page never works it out.
  const view: PaymentsDto = { ...VIEW, rows: [row('06:00', 'Ava Park', { date: '2025-12-29', status: 'PAID', closedYear: 2025, amountMinor: 4500 }),
    row('07:00', 'Mia Rossi', { status: 'PAID', paidVia: 'VENMO' })] };
  const posts: string[] = [];
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      posts.push(`${url} ${body.studentId as string}`);
      return Promise.resolve(new Response(JSON.stringify(row(body.startTime as string, body.studentId as string)), { status: 200 }));
    }
    return Promise.resolve(new Response(JSON.stringify(view), { status: 200 }));
  }));
  render(<Payments api={paymentsApi('t')} onError={vi.fn()} />);
  pick();
  await screen.findByRole('heading', { name: 'Unpaid lessons' });
  await userEvent.click(screen.getByRole('button', { name: 'All' }));
  const ava = (await screen.findByText('Ava Park')).closest('tr')!;
  await userEvent.click(within(ava).getByRole('button', { name: 'Undo' }));
  const dialog = screen.getByRole('dialog', { name: 'Undo a payment from 2025?' });
  expect(dialog).toHaveTextContent('2025 is closed, so its figures won’t change. Undoing this takes $45 off 2026’s figures, in this month.');
  expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual(['Cancel', 'Undo payment']);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(posts).toEqual([]);
  await userEvent.click(within(ava).getByRole('button', { name: 'Undo' }));
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Undo payment' }));
  expect(await screen.findByText('Ava Park, Dec 29: back to unpaid.')).toBeInTheDocument();
  expect(posts).toEqual(['/api/coach/payments/undo Ava Park']);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

  await userEvent.click(within(screen.getByText('Mia Rossi').closest('tr')!).getByRole('button', { name: 'Undo' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await waitFor(() => expect(posts).toEqual(['/api/coach/payments/undo Ava Park', '/api/coach/payments/undo Mia Rossi']));
});

test('a lesson from before last year is view only: a paid one says so, an unpaid one offers Waive alone', async () => {
  // G-39, Batch 27 (owner, 2026-11-15 and 2026-11-16): the server says which rows are view only.
  const view: PaymentsDto = { ...VIEW, rows: [
    row('06:00', 'Ava Park', { date: '2024-12-30', status: 'PAID', paidVia: 'VENMO', viewOnly: true }),
    row('06:30', 'Jack Park', { date: '2024-12-30', viewOnly: true }),
    row('07:00', 'Mia Rossi', { date: '2024-12-30', status: 'WAIVED', viewOnly: true }),
    row('07:30', 'Leo Martin', { date: '2025-01-06', status: 'PAID', paidVia: 'VENMO' })] };
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(view), { status: 200 }))));
  render(<Payments api={paymentsApi('t')} onError={vi.fn()} />);
  pick();
  await screen.findByRole('heading', { name: 'Unpaid lessons' });
  await userEvent.click(screen.getByRole('button', { name: 'All' }));

  const ava = (await screen.findByText('Ava Park')).closest('tr')!;
  expect(within(ava).queryAllByRole('button')).toEqual([]);
  expect(within(ava).getByText('View only')).toHaveAttribute('title', 'Lessons from before January 1, 2025 can be viewed but not changed.');
  expect(within(ava).getByText('Venmo')).toBeInTheDocument();                 // how they paid still shows…
  expect(within(ava).queryByRole('link')).not.toBeInTheDocument();              // …but can't be changed

  const jack = screen.getByText('Jack Park').closest('tr')!;
  expect(within(jack).getAllByRole('button').map((b) => b.textContent)).toEqual(['Waive']);
  expect(within(screen.getByText('Mia Rossi').closest('tr')!).getByText('Final')).toBeInTheDocument();

  const leo = screen.getByText('Leo Martin').closest('tr')!;                    // last year's lesson stays editable
  expect(within(leo).getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  expect(within(leo).getByRole('link', { name: 'Change' })).toBeInTheDocument();
});
