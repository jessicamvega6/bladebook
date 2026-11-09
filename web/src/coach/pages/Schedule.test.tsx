import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { scheduleApi, type Profile, type ScheduleDto, type TemplateDto } from '../api';
import { ScheduleHub, WeeklyEditor } from './Schedule';

const PROFILE: Profile = {
  firstName: 'Dana', lastName: 'Whitfield', initials: 'DW', loginEmail: 'dana@gmail.com', businessEmail: 'dana@gmail.com',
  pendingBusinessEmail: null, phone: null, coachTimezone: 'America/Chicago', currency: 'USD', requiredNoticeHours: 24,
  coachCode: '7K2Q-M9XT', codeWorks: true, paymentInstructions: null, paymentTypes: [],
};

const MORNING: TemplateDto = {
  seq: 1, name: 'Morning ice', startTime: '06:00', endTime: '08:00', lessonMinutes: 30, priceMinor: 5000, maxSkaters: 1,
  iceType: 'BFSC_FREESTYLE', days: [1, 3], off: {},
};

function json(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

function serve(schedule: ScheduleDto, onPut?: (body: { scheduleVersion: number; templates: TemplateDto[] }, auth: string) => Promise<Response>) {
  const f = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/coach/schedule' && (!init?.method || init.method === 'GET')) return json(200, schedule);
    if (url === '/api/coach/schedule' && init?.method === 'PUT' && onPut) {
      return onPut(JSON.parse(init.body as string), new Headers(init.headers).get('Authorization') ?? '');
    }
    if (url === '/api/coach/local/token') return json(200, { idToken: 'fresh' });
    return json(500, {});
  });
  vi.stubGlobal('fetch', f);
  return f;
}

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.unstubAllGlobals());

const editor = (over: Partial<Parameters<typeof WeeklyEditor>[0]> = {}) => {
  const props = { api: scheduleApi('old'), profile: PROFILE, onSaved: vi.fn(), onToken: vi.fn(), onError: vi.fn(), ...over };
  render(<WeeklyEditor {...props} />);
  return props;
};

test('a coach with no schedule starts with one empty block and is told what it needs', async () => {
  serve({ scheduleVersion: 0, exists: false, templates: [] });
  editor();

  expect(await screen.findByRole('heading', { name: 'Edit Block 1' })).toBeInTheDocument();
  expect(screen.getByLabelText('Starts')).toHaveValue('05:00');
  expect(screen.getByLabelText('Ends')).toHaveValue('19:00');
  expect(screen.getByLabelText('Lesson length')).toHaveValue('');
  const problems = screen.getByRole('alert');
  expect(problems).toHaveTextContent('Block 1 needs a lesson length.');
  expect(problems).toHaveTextContent('Block 1 has no ice type. Pick one.');
  expect(screen.getByRole('button', { name: /Review changes/ })).toBeDisabled();
});

test('times run 12:00 AM to 11:45 PM in quarter hours (S3)', async () => {
  serve({ scheduleVersion: 0, exists: false, templates: [] });
  editor();
  const starts = await screen.findByLabelText('Starts');
  const options = within(starts).getAllByRole('option').map((o) => o.textContent);
  expect(options[0]).toBe('12:00 AM');
  expect(options[options.length - 1]).toBe('11:45 PM');
  expect(options).toHaveLength(96); // no blank choice
});

test('building a week and saving sends the templates with the version it opened', async () => {
  let sent: { scheduleVersion: number; templates: TemplateDto[] } | undefined;
  serve({ scheduleVersion: 0, exists: false, templates: [] }, (body) => { sent = body; return json(200, { ...body, scheduleVersion: 1, exists: true }); });
  const props = editor();
  await screen.findByRole('heading', { name: 'Edit Block 1' });

  await userEvent.type(screen.getByLabelText(/^Name/), 'Morning ice');
  await userEvent.selectOptions(screen.getByLabelText('Starts'), '06:00');
  await userEvent.selectOptions(screen.getByLabelText('Ends'), '08:00');
  await userEvent.selectOptions(screen.getByLabelText('Lesson length'), '30');
  await userEvent.type(screen.getByLabelText('Price per lesson'), '45.01');
  await userEvent.selectOptions(screen.getByLabelText('Ice type'), 'PUBLIC');
  await userEvent.click(screen.getByRole('button', { name: 'Mon' }));

  expect(screen.getByText('No clashes · 4 lessons a week')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /Review changes/ }));
  expect(screen.getByRole('heading', { name: 'Review your changes' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Accept & save' }));

  await waitFor(() => expect(props.onSaved).toHaveBeenCalled());
  expect(sent).toEqual({ scheduleVersion: 0, templates: [{ seq: 1, name: 'Morning ice', startTime: '06:00', endTime: '08:00',
    lessonMinutes: 30, priceMinor: 4501, maxSkaters: 1, iceType: 'PUBLIC', days: [1], off: {} }] });
});

test('a new block starts 5:00 AM to 7:00 PM with length and days cleared and the next number (S2, S4)', async () => {
  serve({ scheduleVersion: 3, exists: true, templates: [{ ...MORNING, seq: 4 }] });
  editor();
  await screen.findByRole('heading', { name: 'Edit Morning ice' });

  await userEvent.click(screen.getByRole('button', { name: /Add a block/ }));

  expect(screen.getByRole('heading', { name: 'Edit Block 5' })).toBeInTheDocument();
  expect(screen.getByLabelText(/^Name/)).toHaveAttribute('placeholder', 'Block 5');
  expect(screen.getByLabelText('Starts')).toHaveValue('05:00');
  expect(screen.getByLabelText('Ends')).toHaveValue('19:00');
  expect(screen.getByLabelText('Lesson length')).toHaveValue('');
  expect(screen.queryAllByRole('button', { pressed: true, name: /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/ })).toHaveLength(0);
});

test('a saved block with no end opens ending at 7:00 PM, and clicking a slot with no length sets 30 (S6)', async () => {
  serve({ scheduleVersion: 1, exists: true, templates: [{ ...MORNING, startTime: '18:00', endTime: null, lessonMinutes: null }] });
  editor();
  await screen.findByRole('heading', { name: 'Edit Morning ice' });

  const monday = screen.getAllByRole('button', { name: /^Mon .* on$/ }).map((b) => b.textContent);
  expect(monday).toEqual(['6:00', '6:30']);

  await userEvent.click(screen.getByRole('button', { name: 'Mon 6:30 PM on' }));

  expect(screen.getByLabelText('Lesson length')).toHaveValue('30');
  expect(screen.getByRole('button', { name: 'Mon 6:30 PM switched off' })).toBeInTheDocument();
});

test('an overlap is named with both blocks and their times', async () => {
  serve({ scheduleVersion: 1, exists: true, templates: [MORNING, { ...MORNING, seq: 2, name: '', startTime: '07:00', endTime: '09:00', days: [1] }] });
  editor();
  expect(await screen.findByText('Monday: Morning ice (6–8 AM) and Block 2 (7–9 AM) overlap in time.')).toBeInTheDocument();
});

test('a shared lesson whose price splits unevenly shows the odd-cents warning (S1)', async () => {
  serve({ scheduleVersion: 1, exists: true, templates: [{ ...MORNING, priceMinor: 4501, maxSkaters: 2 }] });
  editor();
  expect(await screen.findByText('Split 2 ways, $45.01 is $22.51 and $22.50. One family will pay a cent more.')).toBeInTheDocument();
  expect(screen.getByText('USD')).toBeInTheDocument();
});

test('a save past 15 minutes asks to sign in again, keeps the edits and retries with the new sign-in', async () => {
  const auths: string[] = [];
  serve({ scheduleVersion: 1, exists: true, templates: [MORNING] }, (body, auth) => {
    auths.push(auth);
    return auth === 'Bearer old'
      ? json(401, { error: 'SIGN_IN_TO_SAVE', message: 'Enter your password again to save your schedule.' })
      : json(200, { ...body, scheduleVersion: 2, exists: true });
  });
  const props = editor();
  await screen.findByRole('heading', { name: 'Edit Morning ice' });
  await userEvent.click(screen.getByRole('button', { name: /Review changes/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Accept & save' }));

  expect(await screen.findByRole('dialog', { name: 'Confirm it’s you' })).toBeInTheDocument();
  expect(props.onError).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Sign in again and save' }));

  await waitFor(() => expect(props.onSaved).toHaveBeenCalled());
  expect(props.onToken).toHaveBeenCalledWith('fresh');
  expect(auths).toEqual(['Bearer old', 'Bearer fresh']);
});

test('a save from a stale window shows why and stays on the review', async () => {
  serve({ scheduleVersion: 1, exists: true, templates: [MORNING] },
    () => json(409, { error: 'CONFLICT', message: 'Your schedule changed in another window. Reload the page and try again.' }));
  editor();
  await screen.findByRole('heading', { name: 'Edit Morning ice' });
  await userEvent.click(screen.getByRole('button', { name: /Review changes/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Accept & save' }));
  expect(await screen.findByText('Your schedule changed in another window. Reload the page and try again.')).toBeInTheDocument();
});

test('Undo edits puts the saved week back', async () => {
  serve({ scheduleVersion: 1, exists: true, templates: [MORNING] });
  editor();
  await screen.findByRole('heading', { name: 'Edit Morning ice' });
  await userEvent.click(screen.getByRole('button', { name: /Add a block/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Undo edits' }));
  expect(screen.queryByText(/Block 2/)).not.toBeInTheDocument();
});

test('the hub offers to build the week, and time off is not available yet', async () => {
  serve({ scheduleVersion: 0, exists: false, templates: [] });
  render(<ScheduleHub api={scheduleApi('t')} profile={PROFILE} flash="" onError={vi.fn()} />);
  expect(await screen.findByRole('link', { name: /Build your teaching week/ })).toHaveAttribute('href', '#/schedule/weekly');
  expect(screen.getByText('Add time off or a special schedule').closest('[aria-disabled]')).toHaveAttribute('aria-disabled', 'true');
});
