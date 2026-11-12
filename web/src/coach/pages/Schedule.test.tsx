import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { scheduleApi, type PreviewDto, type Profile, type ScheduleDto, type TempDto, type TemplateDto } from '../api';
import { ChooseDates, ScheduleEditor, ScheduleHub, TimeOffForm, WeeklyEditor } from './Schedule';

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

const NOTHING: PreviewDto = { cancel: [], reprice: [], kept: [], families: 0, big: [] };

function serve(schedule: ScheduleDto, onPut?: (body: { scheduleVersion: number; templates: TemplateDto[] }, auth: string) => Promise<Response>,
  extra: { preview?: PreviewDto; temps?: TempDto[]; onTemp?: (body: TempDto, method: string) => Promise<Response> } = {}) {
  const f = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/coach/schedule/preview' || url === '/api/coach/schedule/temps/preview') return json(200, extra.preview ?? NOTHING);
    if (url === '/api/coach/schedule/temps' && (!init?.method || init.method === 'GET')) return json(200, extra.temps ?? []);
    if (url.startsWith('/api/coach/schedule/temps/') && (!init?.method || init.method === 'GET')) {
      return json(200, (extra.temps ?? []).find((t) => url.endsWith(`/${t.tempId}`)) ?? {});
    }
    if (url.startsWith('/api/coach/schedule/temps') && extra.onTemp) return extra.onTemp(JSON.parse(init!.body as string), init!.method!);
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
  await userEvent.click(await screen.findByRole('button', { name: 'Accept & save' }));

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
  await userEvent.click(await screen.findByRole('button', { name: 'Accept & save' }));

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
  await userEvent.click(await screen.findByRole('button', { name: 'Accept & save' }));
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

test('the hub offers to build the week and to add dates, and lists time off and special schedules', async () => {
  serve({ scheduleVersion: 0, exists: false, templates: [] }, undefined, { temps: [CAMP, THANKSGIVING] });
  render(<ScheduleHub api={scheduleApi('t')} profile={PROFILE} flash="" onError={vi.fn()} />);
  expect(await screen.findByRole('link', { name: /Build your teaching week/ })).toHaveAttribute('href', '#/schedule/weekly');
  expect(screen.getByRole('link', { name: /Add time off or a special schedule/ })).toHaveAttribute('href', '#/schedule/dates');
  const list = (await screen.findByRole('heading', { name: 'Time off and special schedules' })).closest('section')!;
  expect(list).toHaveTextContent('Holiday camp weekSpecial schedule');
  expect(list).toHaveTextContent('Dec 21 – 27');
  expect(list).toHaveTextContent('Thanksgiving breakNo lessons');
  // Only a special schedule has Edit, as drawn.
  expect(within(list).getAllByRole('link', { name: 'Edit' })).toHaveLength(1);
  expect(within(list).getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '#/schedule/special/camp');
});

const CAMP: TempDto = {
  tempId: 'camp', kind: 'SPECIAL', name: 'Holiday camp week', displayName: 'Holiday camp week', startDate: '2026-12-21', endDate: '2026-12-27',
  templates: [{ seq: 5, name: 'Camp ice', startTime: '09:00', endTime: '16:00', lessonMinutes: 60, priceMinor: 8000, maxSkaters: 1, iceType: 'BFSC_FREESTYLE', days: [], off: {} }],
};
const THANKSGIVING: TempDto = { tempId: 'tg', kind: 'TIME_OFF', name: 'Thanksgiving break', displayName: 'Thanksgiving break', startDate: '2026-11-22', endDate: '2026-11-28', templates: [] };

const IMPACT = (date: string, startTime: string, name: string, price: number, newPrice: number | null = null) =>
  ({ date, startTime, durationMinutes: 30, priceMinor: price, newPriceMinor: newPrice, skaters: [{ studentId: name, name, familyId: name }] });

test('the review lists what the save cancels and re-prices, and a big cut must be ticked before accepting', async () => {
  serve({ scheduleVersion: 1, exists: true, templates: [MORNING] }, (body) => json(200, { ...body, scheduleVersion: 2, exists: true }), {
    preview: {
      cancel: [IMPACT('2026-11-16', '07:00', 'Mia R.', 5000)],
      reprice: [IMPACT('2026-11-23', '06:00', 'Ava P.', 5000, 500)],
      kept: [IMPACT('2026-11-12', '06:00', 'Leo M.', 5000, 6000)],
      families: 2, big: [{ seq: 1, label: 'Morning ice', fromMinor: 5000, toMinor: 500, percent: 90, cut: true }],
    },
  });
  const props = editor();
  await screen.findByRole('heading', { name: 'Edit Morning ice' });
  await userEvent.click(screen.getByRole('button', { name: /Review changes/ }));

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Check this price — it’s a big change');
  expect(alert).toHaveTextContent('Morning ice drops from $50 to $5, a 90% cut.');
  expect(screen.getByRole('heading', { name: '1 lesson will be cancelled' }).closest('section')).toHaveTextContent('Mia R.Mon, Nov 16 · 7:00 AM');
  expect(screen.getByRole('heading', { name: '1 upcoming lesson will change price' }).closest('section')).toHaveTextContent('Good news — some lessons are now cheaper.');
  expect(screen.getByRole('heading', { name: 'Not changed — inside your 24-hour notice' }).closest('section')).toHaveTextContent('stays $50');
  expect(screen.getByText('Families emailed').nextElementSibling).toHaveTextContent('2');

  const accept = screen.getByRole('button', { name: 'Tick the box above to continue' });
  expect(accept).toBeDisabled();
  await userEvent.click(screen.getByLabelText('I’ve checked the new price'));
  await userEvent.click(screen.getByRole('button', { name: 'Accept & email 2 families' }));
  await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(expect.objectContaining({ lessons: 2, families: 2 })));
});

test('Add dates offers time off or a special schedule, and points a sick day to Cancel this day', () => {
  render(<ChooseDates />);
  expect(screen.getByRole('link', { name: /No lessons/ })).toHaveAttribute('href', '#/schedule/time-off');
  expect(screen.getByRole('link', { name: /Special schedule/ })).toHaveAttribute('href', '#/schedule/special/new');
  expect(screen.getByText('Sick today?')).toBeInTheDocument();
});

describe('time off', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-14T15:00:00Z')); });
  afterEach(() => vi.useRealTimers());

  test('an overlap is named and blocks review; clear dates show the booked count, review, and save', async () => {
    let saved: TempDto | undefined;
    serve({ scheduleVersion: 1, exists: true, templates: [MORNING] }, undefined, {
      temps: [THANKSGIVING], preview: { ...NOTHING, cancel: [IMPACT('2026-10-26', '06:00', 'Mia C.', 5000)], families: 1 },
      onTemp: (body) => { saved = body; return json(200, { ...body, tempId: 'new' }); },
    });
    const onSaved = vi.fn();
    render(<TimeOffForm api={scheduleApi('t')} profile={PROFILE} onSaved={onSaved} onToken={vi.fn()} onError={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Time off' });

    fireEvent.change(screen.getByLabelText('First day off'), { target: { value: '2026-11-23' } });
    fireEvent.change(screen.getByLabelText('Last day off'), { target: { value: '2026-11-24' } });
    expect(screen.getByText('These dates overlap Thanksgiving break (Nov 22 – 28) on Nov 23 – 24. Edit Thanksgiving break to change those days, or choose dates outside it.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Review changes/ })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('First day off'), { target: { value: '2026-10-26' } });
    fireEvent.change(screen.getByLabelText('Last day off'), { target: { value: '2026-10-27' } });
    await userEvent.type(screen.getByLabelText(/^Name/), 'Fall break');
    expect(await screen.findByText('1 booked lesson will be cancelled')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Review changes/ }));

    expect(await screen.findByText('Fall break · no lessons Oct 26 – 27')).toBeInTheDocument();
    expect(screen.getByText(/These times stop existing, so nobody can rebook them./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Accept & email 1 family' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(saved).toEqual({ tempId: null, kind: 'TIME_OFF', name: 'Fall break', startDate: '2026-10-26', endDate: '2026-10-27', templates: [] });
  });
});

test('a special schedule shows one column per date and switches a time off on that date only', async () => {
  let saved: TempDto | undefined;
  serve({ scheduleVersion: 1, exists: true, templates: [MORNING] }, undefined, {
    temps: [CAMP], onTemp: (body, method) => { saved = { ...body, tempId: method === 'PUT' ? 'camp' : null }; return json(200, body); },
  });
  const onSaved = vi.fn();
  render(<ScheduleEditor api={scheduleApi('t')} profile={PROFILE} special="camp" onSaved={onSaved} onToken={vi.fn()} onError={vi.fn()} />);
  expect(await screen.findByRole('heading', { name: 'Holiday camp week' })).toBeInTheDocument();
  expect(screen.getByLabelText('Start date')).toHaveValue('2026-12-21');
  expect(screen.queryByRole('group', { name: 'Days' })).not.toBeInTheDocument();
  expect(screen.getByText(/Every date · 9am–4pm · 60 min · \$80/)).toBeInTheDocument();
  expect(screen.getByText('7 dates · 49 lessons')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Tue 22 10:00 AM on' }));
  expect(screen.getByText('7 dates · 48 lessons')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Wed 23 10:00 AM on' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /Review changes/ }));
  expect(await screen.findByText('Holiday camp week · Dec 21 – 27 · weekly schedule resumes after Dec 27')).toBeInTheDocument();
  await userEvent.click(await screen.findByRole('button', { name: 'Accept & save' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(saved?.tempId).toBe('camp');
  expect(saved?.templates[0]?.off).toEqual({ '2026-12-22': ['10:00'] });
});
