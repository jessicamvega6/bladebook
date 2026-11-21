import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { lessonsApi, type PastLessonDto } from '../api';
import { Lessons } from './Lessons';

afterEach(() => vi.unstubAllGlobals());

const past = (startTime: string, fullName: string, status: PastLessonDto['skater']['status']): PastLessonDto => ({
  date: '2026-11-16', startTime, durationMinutes: 30, sharedWith: [],
  skater: { studentId: fullName, shortName: fullName, fullName, familyName: 'Sarah Park', status, outcomeAt: null },
});

test('a date range lists every lesson that happened, flags unrecorded ones, and corrects attendance', async () => {
  const puts: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      puts.push(JSON.parse(init.body as string));
      return Promise.resolve(new Response(JSON.stringify({ ...past('06:30', 'Jack Park', 'NO_SHOW').skater }), { status: 200 }));
    }
    return Promise.resolve(new Response(JSON.stringify([past('06:00', 'Ava Park', 'CHECKED_IN'), past('06:30', 'Jack Park', 'NOT_RECORDED')]), { status: 200 }));
  }));
  render(<Lessons api={lessonsApi('t')} onError={vi.fn()} />);
  expect(screen.getByText('Pick a date range')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-16' } });
  fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-16' } });

  expect(await screen.findByText('1 lesson has no attendance')).toBeInTheDocument();
  const card = screen.getByRole('heading', { name: '2 lessons' }).closest('section')!;
  expect(card).toHaveTextContent('Nov 16, 2026 – Nov 16, 2026 · 1 attended · 0 no-show · 1 not recorded');
  const jack = within(card).getByText('Jack Park').closest('.row') as HTMLElement;
  expect(jack).toHaveClass('row--attn');
  await userEvent.click(within(jack).getByRole('button', { name: 'No-show' }));
  expect(await screen.findByText('Jack Park, Nov 16 6:30 AM: marked no-show.')).toBeInTheDocument();
  expect(puts).toEqual([{ date: '2026-11-16', startTime: '06:30', studentId: 'Jack Park', outcome: 'NO_SHOW' }]);
  await waitFor(() => expect(within(jack).getByRole('button', { name: 'No-show' })).toHaveAttribute('aria-pressed', 'true'));
});

test('an end before the start is refused and nothing is fetched', () => {
  const f = vi.fn(); vi.stubGlobal('fetch', f);
  render(<Lessons api={lessonsApi('t')} onError={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-16' } });
  fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-15' } });
  expect(screen.getByText('The end date is before the start date.')).toBeInTheDocument();
  expect(f).not.toHaveBeenCalled();
});
