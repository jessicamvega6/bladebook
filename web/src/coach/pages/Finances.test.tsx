import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { financesApi, type FinanceMonthDto, type FinanceYearDto } from '../api';
import { Finances } from './Finances';

afterEach(() => vi.unstubAllGlobals());

const month = (m: number, o: Partial<FinanceMonthDto> = {}): FinanceMonthDto => ({
  month: `2026-${String(m).padStart(2, '0')}`, hasLessons: false, paidLessons: 0, gross: {}, unpaid: {}, ...o,
});

const YEAR: FinanceYearDto = {
  year: 2026, closed: false, today: '2026-11-13', paidLessons: 3, gross: { USD: 12500 }, unpaid: { USD: 5000 }, currency: 'USD',
  months: [...Array.from({ length: 8 }, (_, i) => month(i + 1)),
    month(9, { hasLessons: true, paidLessons: 2, gross: { USD: 7500 } }),
    month(10, { hasLessons: true, paidLessons: 1, gross: { USD: 5000 }, unpaid: { USD: 5000 } }),
    month(11)],
};

function serve() {
  const urls: string[] = [];
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    urls.push(url);
    const body = url.includes('/download')
      ? { fileName: 'bladebook-summary-2025.csv', csv: 'Month,Paid lessons,Gross received (USD)\r\n' }
      : YEAR;
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  }));
  return urls;
}

test('this year: gross so far, still unpaid, and month by month from the first month with lessons', async () => {
  const urls = serve();
  render(<Finances api={financesApi('t')} year={2026} onError={vi.fn()} />);
  expect(await screen.findByText('Gross, 2026 to date')).toBeInTheDocument();
  expect(urls[0]).toBe('/api/coach/finances?year=2026');
  expect(screen.getByText('3 lessons marked paid')).toBeInTheDocument();
  const table = screen.getByRole('table');
  const rows = within(table).getAllByRole('row');
  expect(rows[1]).toHaveTextContent('January – August');
  expect(rows[1]).toHaveTextContent('No lessons in BladeBook');
  expect(rows[2]).toHaveTextContent('September');
  expect(rows[2]).toHaveTextContent('2 lessons');
  expect(rows[2]).toHaveTextContent('$75');
  expect(rows[3]).toHaveTextContent('$50 still unpaid');
  expect(rows[4]).toHaveTextContent('NovemberTo Nov 13');
  expect(rows[5]).toHaveTextContent('2026 to date');
  expect(rows[5]).toHaveTextContent('$125');
  expect(screen.getByText(/Rink fee calculation is coming/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Past years/ })).toBeDisabled();
});

test('Download summary saves last year’s CSV', async () => {
  const urls = serve();
  render(<Finances api={financesApi('t')} year={2026} onError={vi.fn()} />);
  await screen.findByText('Gross, 2026 to date');
  await userEvent.click(await screen.findByRole('button', { name: /Download summary/ }));
  const dialog = screen.getByRole('dialog');
  await userEvent.click(within(dialog).getByRole('button', { name: '2025' }));
  expect(within(dialog).getByText('2025 is closed, so its figures won’t change.')).toBeInTheDocument();
  const click = vi.fn();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
  const realCreate = document.createElement.bind(document);
  const spy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = realCreate(tag);
    if (tag === 'a') (el as HTMLAnchorElement).click = click;
    return el;
  });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Download CSV' }));
  await waitFor(() => expect(screen.getByText('Saved bladebook-summary-2025.csv.')).toBeInTheDocument());
  expect(urls).toContain('/api/coach/finances/download?year=2025');
  expect(click).toHaveBeenCalled();
  spy.mockRestore();
});
