import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { studentApi, type Profile, type StudentDto, type StudentsDto } from '../api';
import { Students } from './Students';

const PROFILE: Profile = {
  firstName: 'Dana', lastName: 'Whitfield', initials: 'DW', loginEmail: 'dana@gmail.com', businessEmail: 'dana@gmail.com',
  pendingBusinessEmail: null, phone: null, coachTimezone: 'America/Chicago', currency: 'USD', requiredNoticeHours: 24,
  coachCode: '7K2Q-M9XT', codeWorks: true, paymentInstructions: null, paymentTypes: [],
};

const kid = (id: string, name: string, over: Partial<StudentDto> = {}): StudentDto => ({
  studentId: id, familyId: 'park', status: 'PENDING', studentName: name, isMinor: true, relationship: 'GUARDIAN',
  clientName: 'Sarah Park', clientEmail: 'sarah@example.com', clientPhone: '(205) 555-0196', skatingOrg: 'USFS',
  registrationNumber: '1234567', signedUpAt: '2026-11-09T15:00:00Z', ...over,
});

const AVA = kid('ava', 'Ava Park');
const JACK = kid('jack', 'Jack Park', { skatingOrg: 'USA_HOCKEY', registrationNumber: '2027KQ4815MX3T' });
const PRIYA = kid('priya', 'Priya Shah', { familyId: 'shah', isMinor: false, relationship: 'SELF', clientName: 'Priya Shah', clientEmail: 'priya@example.com' });

function json(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

afterEach(() => vi.unstubAllGlobals());

function show(data: StudentsDto, tab: 'students' | 'pending') {
  const onChange = vi.fn();
  render(<Students api={studentApi('tok')} profile={PROFILE} data={data} tab={tab} onChange={onChange} onError={vi.fn()} />);
  return onChange;
}

test('waiting sign-ups are grouped by family, with each skater’s organization and number', () => {
  show({ active: [], pending: [AVA, JACK, PRIYA] }, 'pending');

  expect(screen.getByText('Guardian · 2 skaters')).toBeInTheDocument();
  expect(screen.getByText('Signing up for themselves')).toBeInTheDocument();
  expect(screen.getByText('2027KQ4815MX3T')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Approve all' })).toHaveLength(1); // only the family of two
  expect(screen.getByRole('link', { name: /Waiting for approval 3/ })).toHaveAttribute('aria-current', 'page');
});

test('approve all sends the whole family and says they can book', async () => {
  const sent: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn((_u: string, init?: RequestInit) => { sent.push(JSON.parse(init!.body as string)); return json(200, { active: [AVA, JACK], pending: [] }); }));
  const onChange = show({ active: [], pending: [AVA, JACK] }, 'pending');

  await userEvent.click(screen.getByRole('button', { name: 'Approve all' }));

  expect(await screen.findByText('Ava Park and Jack Park approved. Sarah Park can now book.')).toBeInTheDocument();
  expect(sent).toEqual([{ studentIds: ['ava', 'jack'] }]);
  expect(onChange).toHaveBeenCalled();
});

test('declining asks first, then removes the skater', async () => {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn((u: string, init?: RequestInit) => { calls.push(`${init?.method} ${u}`); return json(200, { active: [], pending: [JACK] }); }));
  show({ active: [], pending: [AVA, JACK] }, 'pending');

  const avaRow = screen.getByText('Ava Park').closest('.row') as HTMLElement;
  await userEvent.click(within(avaRow).getByRole('button', { name: 'Decline' }));
  const dialog = screen.getByRole('dialog', { name: 'Decline Ava Park?' });
  expect(within(dialog).getByText('Ava Park is deleted')).toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Keep waiting' }));
  expect(calls).toEqual([]);

  await userEvent.click(within(avaRow).getByRole('button', { name: 'Decline' }));
  await userEvent.click(screen.getByRole('button', { name: 'Decline and email' }));

  expect(await screen.findByText('Ava Park declined. Sarah Park has been emailed.')).toBeInTheDocument();
  expect(calls).toEqual(['DELETE /api/coach/students/ava']);
});

test('nobody waiting reminds the coach of their code', () => {
  show({ active: [], pending: [] }, 'pending');
  expect(screen.getByText('Nobody is waiting')).toBeInTheDocument();
  expect(screen.getByText('7K2Q-M9XT')).toBeInTheDocument();
});

test('the student list is read-only and searchable by name, family, email or phone', async () => {
  show({ active: [{ ...AVA, status: 'ACTIVE' }, { ...PRIYA, status: 'ACTIVE' }], pending: [JACK] }, 'students');

  expect(screen.getByRole('heading', { name: '2 students' })).toBeInTheDocument();
  expect(screen.getByText('2 families')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Edit/ })).not.toBeInTheDocument(); // A4
  expect(screen.queryByText(/Texts on|Email only/)).not.toBeInTheDocument(); // A5

  await userEvent.type(screen.getByLabelText('Search'), 'priya@');
  expect(screen.getByRole('heading', { name: '1 student' })).toBeInTheDocument();
  expect(screen.queryByText('Ava Park')).not.toBeInTheDocument();

  await userEvent.clear(screen.getByLabelText('Search'));
  await userEvent.type(screen.getByLabelText('Search'), 'zzz');
  expect(screen.getByText('No students match “zzz”')).toBeInTheDocument();
});
