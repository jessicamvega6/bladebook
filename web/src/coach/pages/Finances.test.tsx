import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { financesApi, type FinanceMonthDto, type FinanceYearDto } from '../api';
import { Finances } from './Finances';

afterEach(() => vi.unstubAllGlobals());

const month = (m: number, o: Partial<FinanceMonthDto> = {}): FinanceMonthDto => ({
  month: `2026-${String(m).padStart(2, '0')}`, hasLessons: false, paidLessons: 0, gross: {}, unpaid: {}, earlierLessons: 0, earlierGross: {}, ...o,
});

const YEAR: FinanceYearDto = {
  year: 2026, closed: false, today: '2026-11-13', paidLessons: 3, gross: { USD: 12500 }, unpaid: { USD: 5000 }, earlierLessons: 0, earlierGross: {}, currency: 'USD',
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

test('a lesson from last year paid this year counts in the month it was paid, labelled with its year', async () => {
  const year: FinanceYearDto = {
    ...YEAR, paidLessons: 4, gross: { USD: 15500 }, earlierLessons: 1, earlierGross: { USD: 3000 },
    months: [month(1, { paidLessons: 1, gross: { USD: 3000 }, earlierLessons: 1, earlierGross: { USD: 3000 } }),
      ...YEAR.months.slice(1)],
  };
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(year), { status: 200 }))));
  render(<Finances api={financesApi('t')} year={2026} onError={vi.fn()} />);
  const rows = await screen.findAllByRole('row');
  // January has no lessons of its own but is listed, since a 2025 lesson was paid in it.
  expect(rows[1]).toHaveTextContent('January');
  expect(rows[1]).toHaveTextContent('$30');
  expect(rows[1]).toHaveTextContent('Includes $30 for 2025 lessons');
  expect(rows[2]).toHaveTextContent('February');
  expect(rows[2]).not.toHaveTextContent('Includes');
  expect(screen.getByText('4 lessons marked paid · $30 for 2025 lessons')).toBeInTheDocument();
  expect(rows[rows.length - 1]).toHaveTextContent('Includes $30 for 2025 lessons');
});
