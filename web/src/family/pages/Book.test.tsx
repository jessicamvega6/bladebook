import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { App } from '../App';
import type { BookResult, BookingPage, Family } from '../api';
import { APPROVED, BEN_PAGE, DANA_PAGE, LESSONS, TWO_COACHES, WAITING, json } from '../testData';

type Sent = { coachId: string; studentId: string; idempotencyKey: string; picks: Array<{ date: string; startTime: string }> };

const booked = (body: Sent, outcomes: Record<string, BookResult['picks'][number]['outcome']> = {}): BookResult => ({
  coachFirstName: body.coachId === 'ben' ? 'Ben' : 'Dana', studentName: 'Ava Park',
  picks: body.picks.map((p) => {
    const outcome = outcomes[`${p.date} ${p.startTime}`] ?? 'BOOKED';
    return { ...p, outcome, message: outcome === 'UNAVAILABLE' ? 'That time was taken or no longer exists.' : null,
      durationMinutes: 30, priceMinor: 5000, currency: 'USD' };
  }),
});

/** A fake api-client. {@code book} answers each booking request; the default books everything. */
function server(family: Family, pages: Record<string, BookingPage>, book: (b: Sent) => Promise<Response> = (b) => json(200, booked(b))) {
  const sent: Sent[] = [];
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/client/me') return json(200, family);
    if (url === '/api/client/lessons') return json(200, LESSONS);
    if (url.startsWith('/api/client/booking?')) {
      const coach = new URLSearchParams(url.split('?')[1]).get('coachId')!;
      return pages[coach] ? json(200, pages[coach]) : json(404, { error: 'NOT_FOUND', message: 'That skater couldn’t be found. Reload the page.' });
    }
    if (url === '/api/client/bookings') {
      const body = JSON.parse(init!.body as string) as Sent;
      sent.push(body);
      return book(body);
    }
    return json(404, { error: 'NOT_FOUND', message: 'x' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { sent, fetchMock };
}

function open(hash: string) {
  sessionStorage.setItem('bb.family.idToken', 'tok');
  window.location.hash = hash;
  render(<App />);
}

beforeEach(() => { sessionStorage.clear(); window.location.hash = ''; });
afterEach(() => vi.unstubAllGlobals());

describe('1 · pick a day', () => {
  test('the three months of the window, each day’s open times, and Ava’s own lesson ticked', async () => {
    server(APPROVED, { dana: DANA_PAGE });
    open('#/book');

    expect(await screen.findByText('Pick a day to see Coach Dana’s open times for Ava.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Book a lesson' })).toBeInTheDocument();
    // Only Ava is bookable: Jack still waits for Coach Dana.
    expect(screen.getByText('Booking for').parentElement).toHaveTextContent('Ava Park');
    const months = screen.getByRole('heading', { name: 'Months' }).closest('section')!;
    expect(within(months).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'November4 open times', 'December1 open time', 'January0 open times']);
    // The 16th: 6:00 and 7:30 open; 6:30 taken; 7:00 is Ava's.
    const sixteenth = screen.getByRole('button', { name: 'Monday, November 16, 2 open times, Ava has a lesson' });
    // Only a tick in the square, no name (owner, 2026-11-11).
    expect(sixteenth).not.toHaveTextContent('Ava');
    expect(sixteenth.querySelector('.bk-calmine svg')).not.toBeNull();
    // No week links beside the month (owner, 2026-11-11).
    expect(screen.queryByText('Jump to')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Week \d/ })).not.toBeInTheDocument();
    expect(screen.getByText('Cancelling with Coach Dana')).toBeInTheDocument();

    await userEvent.click(sixteenth);
    expect(window.location.hash).toBe('#/book/day/2026-11-16');
  });

  test('the month arrows stop at the window’s edges', async () => {
    server(APPROVED, { dana: DANA_PAGE });
    open('#/book');
    const prev = await screen.findByRole('button', { name: 'Previous month' });
    expect(prev).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText('January 2027')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
  });

  test('a coach with no times yet says so, not that they’re full', async () => {
    server(APPROVED, { dana: { ...DANA_PAGE, hasSchedule: false, times: [], familyLessons: [] } });
    open('#/book');
    expect(await screen.findByRole('heading', { name: 'No lesson times yet' })).toBeInTheDocument();
    expect(screen.getByText('Dana hasn’t posted any times. Check back soon.')).toBeInTheDocument();
  });

  test('a waiting family never sees the booking pages', async () => {
    server(WAITING, {});
    open('#/book');
    expect(await screen.findByText('Booking opens once Coach Dana approves')).toBeInTheDocument();
  });

  test('a skater who can’t be booked any more is told why', async () => {
    server(APPROVED, {});
    vi.stubGlobal('fetch', vi.fn((url: string) => url === '/api/client/me' ? json(200, APPROVED)
      : json(409, { error: 'CONFLICT', message: 'Ava’s lessons are no longer available to book. Contact Coach Dana.' })));
    open('#/book');
    expect(await screen.findByText('Ava’s lessons are no longer available to book. Contact Coach Dana.')).toBeInTheDocument();
  });
});

describe('2 · pick your times', () => {
  test('the day’s times by block: open with the price, taken, the family’s own, and not on the ice between', async () => {
    server(APPROVED, { dana: DANA_PAGE });
    open('#/book/day/2026-11-16');

    expect(await screen.findByRole('heading', { name: 'Monday, November 16' })).toBeInTheDocument();
    expect(screen.getByText('2 of 4 times still open · picks are kept as you move between days')).toBeInTheDocument();
    expect(screen.getByText(/Times are in Coach Dana’s time zone, Central — Chicago\./)).toBeInTheDocument();
    expect(screen.getByText('Morning ice')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^6:00 AM/ })).toHaveTextContent('$50');
    const taken = screen.getByText('6:30 AM').closest('.slot')!;
    expect(taken.tagName).toBe('DIV');
    expect(taken).toHaveTextContent('Taken');
    expect(screen.getByText('7:00 AM').closest('.slot')).toHaveTextContent('Ava’s lesson');
  });

  test('an unnamed block is labelled from its number, and a longer lesson says so', async () => {
    server(APPROVED, { dana: DANA_PAGE });
    open('#/book/day/2026-11-18');
    expect(await screen.findByText('Block 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^4:00 PM/ })).toHaveTextContent('60 min');
  });

  test('the day strip stays inside the booking window (B5)', async () => {
    server(APPROVED, { dana: DANA_PAGE });
    open('#/book/day/2026-11-10');
    await screen.findByRole('heading', { name: 'Tuesday, November 10' });
    expect(screen.getByRole('button', { name: 'Previous week' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Monday, November 9: outside the booking window' })).toBeDisabled();
    expect(screen.getByText('No lessons with Dana on Tuesdays')).toBeInTheDocument();
  });

  test('a day of the coach’s time off says they’re away, and special hours are named (G-24)', async () => {
    const specials = [{ kind: 'TIME_OFF' as const, name: 'Fall break', startDate: '2026-11-10', endDate: '2026-11-11' },
      { kind: 'SPECIAL' as const, name: 'Holiday camp', startDate: '2026-11-16', endDate: '2026-11-16' }];
    server(APPROVED, { dana: { ...DANA_PAGE, specials } });
    open('#/book/day/2026-11-10');
    expect(await screen.findByText('Dana is away (Fall break)')).toBeInTheDocument();
    open('#/book/day/2026-11-16');
    expect(await screen.findByText('Special hours from Nov 16 to Nov 16.')).toBeInTheDocument();
  });


  test('tapping a time picks it and tapping again removes it; picks stay as the family moves between days', async () => {
    server(APPROVED, { dana: DANA_PAGE });
    open('#/book/day/2026-11-16');
    const six = await screen.findByRole('button', { name: /^6:00 AM/ });
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

    await userEvent.click(six);
    expect(six).toHaveAttribute('aria-pressed', 'true');
    const picks = screen.getByRole('heading', { name: 'Your picks' }).closest('section')!;
    expect(picks).toHaveTextContent('Mon 16 · 6:00 AM');
    expect(picks).toHaveTextContent('1 lesson · 30 min');

    await userEvent.click(screen.getByRole('button', { name: 'Next week' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Monday, November 23: 1 open' }));
    await userEvent.click(await screen.findByRole('button', { name: /^6:00 AM/ }));
    expect(picks).toHaveTextContent('2 lessons · 1 hr');
    expect(picks).toHaveTextContent('$100');

    await userEvent.click(within(picks).getByRole('button', { name: 'Remove Mon 16 6:00 AM' }));
    expect(picks).toHaveTextContent('1 lesson · 30 min');
  });
});

describe('3 · confirm and 4 · result', () => {
  test('booking sends one request with a key and shows what was booked and what wasn’t', async () => {
    const { sent } = server(APPROVED, { dana: DANA_PAGE }, (b) => json(200, booked(b, { '2026-11-16 07:30': 'UNAVAILABLE' })));
    open('#/book/day/2026-11-16');
    await userEvent.click(await screen.findByRole('button', { name: /^6:00 AM/ }));
    await userEvent.click(screen.getByRole('button', { name: /^7:30 AM/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    const dialog = screen.getByRole('dialog', { name: 'Book for Ava' });
    expect(dialog).toHaveTextContent('With Coach Dana Whitfield.');
    expect(dialog).toHaveTextContent('Monday · 6:00 AM');
    expect(dialog).toHaveTextContent('$100');
    expect(dialog).toHaveTextContent('You pay Dana directly. BladeBook only sends reminders.');
    expect(dialog).not.toHaveTextContent(/repeat/i);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Book 2 lessons' }));

    expect(await screen.findByRole('heading', { name: '1 lesson booked for Ava' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/book/result');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ coachId: 'dana', studentId: 'ava',
      picks: [{ date: '2026-11-16', startTime: '06:00' }, { date: '2026-11-16', startTime: '07:30' }] });
    expect(sent[0]!.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    const another = screen.getByRole('heading', { name: '1 date needs another time' }).closest('section')!;
    expect(another).toHaveTextContent('Mon, Nov 16 · 7:30 AM');
    expect(another).toHaveTextContent('That time was taken or no longer exists.');

    await userEvent.click(within(another).getByRole('button', { name: 'Pick another time' }));
    expect(window.location.hash).toBe('#/book/day/2026-11-16');
  });

  test('a time already the skater’s is recognised and never booked twice', async () => {
    server(APPROVED, { dana: DANA_PAGE }, (b) => json(200, booked(b, { '2026-11-16 06:00': 'ALREADY_BOOKED' })));
    open('#/book/day/2026-11-16');
    await userEvent.click(await screen.findByRole('button', { name: /^6:00 AM/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(screen.getByRole('button', { name: 'Book 1 lesson' }));

    expect(await screen.findByRole('heading', { name: 'Ava’s lessons, as they stand now' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Already booked for Ava' })).toBeInTheDocument();
  });

  test('a booking that fails is retried with the same key, so nothing is booked twice', async () => {
    let calls = 0;
    const { sent } = server(APPROVED, { dana: DANA_PAGE },
      (b) => (++calls <= 2 ? json(500, { error: 'SERVER', message: 'Something went wrong on our side. Try again.' }) : json(200, booked(b))));
    open('#/book/day/2026-11-16');
    await userEvent.click(await screen.findByRole('button', { name: /^6:00 AM/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(screen.getByRole('button', { name: 'Book 1 lesson' }));

    // The website already retried once by itself (ADR-006 d4b); both attempts failed.
    expect(await screen.findByRole('heading', { name: 'Nothing was booked for Ava' })).toBeInTheDocument();
    expect(screen.getByText('Didn’t go through')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: '1 lesson booked for Ava' })).toBeInTheDocument();
    expect(sent).toHaveLength(3);
    expect(new Set(sent.map((s) => s.idempotencyKey)).size).toBe(1);
  });
});

describe('more than one coach', () => {
  test('switching coach keeps the picks; booking sends one request per coach and reports each', async () => {
    const { sent } = server(TWO_COACHES, { dana: DANA_PAGE, ben: BEN_PAGE });
    open('#/book/day/2026-11-16');
    await userEvent.click(await screen.findByRole('button', { name: /^6:00 AM/ }));

    await userEvent.selectOptions(screen.getByLabelText('Coach'), 'ben');
    await userEvent.click(await screen.findByRole('button', { name: 'Tuesday, November 17: 1 open' }));
    await userEvent.click(await screen.findByRole('button', { name: /^5:00 PM/ }));
    expect(screen.getByText('Your picks with Coach Dana (1) are kept')).toBeInTheDocument();
    const picks = screen.getByRole('heading', { name: 'Your picks' }).closest('section')!;
    expect(picks).toHaveTextContent('Paid to each coach separately');

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const dialog = screen.getByRole('dialog', { name: 'Book for Ava' });
    expect(dialog).toHaveTextContent('With 2 coaches.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Book 2 lessons' }));

    expect(await screen.findByRole('heading', { name: '2 lessons booked for Ava' })).toBeInTheDocument();
    expect(sent.map((s) => s.coachId)).toEqual(['dana', 'ben']);
    expect(sent[0]!.idempotencyKey).not.toBe(sent[1]!.idempotencyKey);
    expect(screen.getByText('Coach Dana')).toBeInTheDocument();
    expect(screen.getByText('Coach Ben')).toBeInTheDocument();
  });

  test('switching skater clears the picks', async () => {
    const both: Family = { ...TWO_COACHES, skaters: [TWO_COACHES.skaters[0]!, { ...TWO_COACHES.skaters[1]!,
      coaches: [{ coachId: 'dana', firstName: 'Dana', lastName: 'Whitfield', status: 'ACTIVE' }] }] };
    server(both, { dana: DANA_PAGE, ben: BEN_PAGE });
    open('#/book/day/2026-11-16');
    await userEvent.click(await screen.findByRole('button', { name: /^6:00 AM/ }));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'Jack' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled());
    expect(screen.getByText('No times picked yet.')).toBeInTheDocument();
  });
});
