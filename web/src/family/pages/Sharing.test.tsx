import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { ApiError } from '../../shared/api/client';
import type { Family, FamilyApi, Invitation, LessonShare, MyBookings, MyLesson } from '../api';
import { APPROVED, LESSONS } from '../testData';
import { Bookings, SeriesChange, shareLine } from './Bookings';
import { InvitePage, ShareBox, WaitingCards, atTime, type ShareAnswer } from './Sharing';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

/** Ava and Jack, both with Coach Dana; each has a share code. */
const FAMILY: Family = {
  ...APPROVED,
  skaters: [
    { ...APPROVED.skaters[0]!, shareCode: 'AVA-22222' },
    { ...APPROVED.skaters[1]!, shareCode: 'JAC-33333', coaches: [{ coachId: 'dana', firstName: 'Dana', lastName: 'Whitfield', status: 'ACTIVE' }] },
  ],
};
const share = (o: Partial<LessonShare>): LessonShare => ({
  partnerName: null, partnerStatus: null, inviteId: null, answerBy: null, fullPriceMinor: 5000, shareable: true, freedPlace: false, joined: false, ...o,
});
const lesson = (o: Partial<MyLesson>): MyLesson => ({ ...LESSONS[0]!, ...o });
const at = (iso: string) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(iso)); };

function Box({ api, onAnswer }: { api: FamilyApi; onAnswer: (a: ShareAnswer) => void }) {
  const [v, setV] = useState('');
  return <ShareBox api={api} coachId="dana" coachFirstName="Dana" priceMinor={5000} currency="USD" kid={FAMILY.skaters[0]!} family={FAMILY}
    repeat={false} onlyNote="" value={v} onChange={setV} onAnswer={onAnswer} />;
}

// ------------------------------------------------------------------------ the share box

test('the share box checks a whole code and lets the booking go ahead only once it checks out', async () => {
  const shareCheck = vi.fn(() => Promise.resolve({ displayName: 'Mia C.', onCoachRoster: true }));
  const onAnswer = vi.fn();
  render(<Box api={{ shareCheck } as unknown as FamilyApi} onAnswer={onAnswer} />);
  expect(screen.getByText(/each pays \$25\./)).toBeInTheDocument();

  await userEvent.type(screen.getByLabelText('Skater’s share code'), 'mia-4k7');
  expect(screen.getByText('Keep typing. Book stays off until the whole code is in, or the box is empty.')).toBeInTheDocument();
  expect(onAnswer).toHaveBeenLastCalledWith(expect.objectContaining({ ready: false }));
  expect(shareCheck).not.toHaveBeenCalled();

  await userEvent.type(screen.getByLabelText('Skater’s share code'), 'qx');
  expect(await screen.findByText('Their family gets an email to accept.')).toBeInTheDocument();
  expect(shareCheck).toHaveBeenCalledWith('MIA-4K7QX', 'dana');
  expect(onAnswer).toHaveBeenLastCalledWith({ ready: true, code: 'MIA-4K7QX', name: 'Mia C.', sibling: false });
});

test('a skater the coach hasn’t accepted stops the booking at the share step (ADR-033)', async () => {
  const onAnswer = vi.fn();
  render(<Box api={{ shareCheck: () => Promise.resolve({ displayName: 'Mia R.', onCoachRoster: false }) } as unknown as FamilyApi} onAnswer={onAnswer} />);
  await userEvent.type(screen.getByLabelText('Skater’s share code'), 'MIA-4K7QX');
  expect(await screen.findByText(/Mia R\. isn’t one of Coach Dana’s students yet\. Mia’s family can sign up with Coach Dana’s code/)).toBeInTheDocument();
  expect(onAnswer).toHaveBeenLastCalledWith(expect.objectContaining({ ready: false }));
});

test('a code that matches nobody, and one that couldn’t be checked, say so', async () => {
  const shareCheck = vi.fn().mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', 'x')).mockRejectedValueOnce(new ApiError(503, 'X', 'x'))
    .mockResolvedValue({ displayName: 'Ella A.', onCoachRoster: true });
  render(<Box api={{ shareCheck } as unknown as FamilyApi} onAnswer={vi.fn()} />);
  const box = screen.getByLabelText('Skater’s share code');
  await userEvent.type(box, 'MIA-22222');
  expect(await screen.findByText('That code doesn’t match a skater. Check it with the other family.')).toBeInTheDocument();
  await userEvent.clear(box);
  await userEvent.type(box, 'ELL-3HTVP');
  expect(await screen.findByText('Couldn’t check that code. Try again.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Code found')).toBeInTheDocument();
});

test('the skater’s own code is refused, and a sibling the coach accepted is added directly with no call', async () => {
  const shareCheck = vi.fn();
  const onAnswer = vi.fn();
  render(<Box api={{ shareCheck } as unknown as FamilyApi} onAnswer={onAnswer} />);
  await userEvent.type(screen.getByLabelText('Skater’s share code'), 'ava22222');
  expect(screen.getByText('That’s Ava’s own code. Enter the other skater’s code.')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Add Jack' }));
  expect(screen.getByText('In your family, so Jack is added directly. No invitation.')).toBeInTheDocument();
  expect(shareCheck).not.toHaveBeenCalled();
  expect(onAnswer).toHaveBeenLastCalledWith({ ready: true, code: 'JAC-33333', name: 'Jack P.', sibling: true });
});

// ------------------------------------------------------------------------ the invitation page

const INVITE: Invitation = {
  inviteId: 'inv-1', coachId: 'dana', coachFirstName: 'Dana', coachLastName: 'Whitfield', studentId: 'ava', studentName: 'Ava Park',
  hostName: 'Mia C.', invitedByName: 'Grace Chen', series: false,
  dates: [{ date: '2026-11-16', startTime: '06:00', durationMinutes: 30, startsAtUtc: '2026-11-16T12:00:00Z', open: true }],
  priceMinor: 5000, shareMinor: 2500, skaters: 2, currency: 'USD', status: 'OPEN',
  clashes: [{ date: '2026-11-16', startTime: '06:00', otherCoachFirstName: 'Ben', otherStartTime: '06:15', otherDurationMinutes: 30 }],
};

test('the invitation shows the share, every clash, and Go ahead joins the lesson', async () => {
  at('2026-11-10T15:00:00Z');
  const acceptInvite = vi.fn(() => Promise.resolve({ studentName: 'Ava Park', coachFirstName: 'Dana', hostName: 'Mia C.', done: ['2026-11-16'], skipped: [] }));
  render(<InvitePage api={{ invitations: () => Promise.resolve([INVITE]), acceptInvite } as unknown as FamilyApi} inviteId="inv-1" onError={vi.fn()} />);

  expect(await screen.findByRole('heading', { name: 'Grace Chen invited Ava to share a lesson' })).toBeInTheDocument();
  expect(screen.getByText('$25 for Ava: the lesson’s $50, split between 2 skaters. You pay Coach Dana directly.')).toBeInTheDocument();
  expect(screen.getByText('6:15 AM with Coach Ben overlaps this lesson at 6:00 AM')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Go ahead' }));
  expect(acceptInvite).toHaveBeenCalledWith('inv-1');
  expect(await screen.findByRole('heading', { name: 'Ava has joined Mia C.’s lesson' })).toBeInTheDocument();
});

test('an invitation whose lesson started, or that has ended, is no longer available (B8)', async () => {
  at('2026-11-16T12:00:00Z');
  const { unmount } = render(<InvitePage api={{ invitations: () => Promise.resolve([INVITE]) } as unknown as FamilyApi} inviteId="inv-1" onError={vi.fn()} />);
  expect(await screen.findByRole('heading', { name: 'This lesson is no longer available' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Go ahead' })).not.toBeInTheDocument();
  unmount();
  render(<InvitePage api={{ invitations: () => Promise.resolve([]) } as unknown as FamilyApi} inviteId="inv-1" onError={vi.fn()} />);
  expect(await screen.findByRole('heading', { name: 'This lesson is no longer available' })).toBeInTheDocument();
});

// ------------------------------------------------------------------------ the staying family

const LEFT_BY = '2026-11-15T12:00:00Z';
const left = (date: string, rid: string | null = null) => lesson({
  date, startTime: '06:00', startsAtUtc: `${date}T12:00:00Z`, priceMinor: 2500, recurrenceId: rid, intervalWeeks: rid ? 1 : 0,
  share: share({ partnerName: 'Owen B.', partnerStatus: 'LEFT', answerBy: LEFT_BY }),
});

test('one date waiting: keep it at the full price, or cancel with no charge, by its answer-by time', async () => {
  at('2026-11-10T15:00:00Z');
  const keep = vi.fn(() => Promise.resolve({ studentName: null, coachFirstName: null, hostName: null, done: ['2026-11-16'], skipped: [] }));
  const onChanged = vi.fn();
  render(<WaitingCards lessons={[left('2026-11-16')]} api={{ keep } as unknown as FamilyApi} onChanged={onChanged} onError={vi.fn()} />);

  expect(screen.getByText('Owen B. can’t make Ava’s shared lesson on Mon, Nov 16 at 6:00 AM')).toBeInTheDocument();
  expect(screen.getByText(/at the full \$50 \(Ava’s share was \$25\).*answer by Sun, Nov 15 at 6:00 AM/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Keep at $50' }));
  expect(keep).toHaveBeenCalledWith({ coachId: 'dana', studentId: 'ava', startTime: '06:00', dates: ['2026-11-16'] });
  expect(onChanged).toHaveBeenCalled();
});

test('a series gets one card, and Cancel all remaining dates confirms first (B3)', async () => {
  at('2026-11-10T15:00:00Z');
  const cancelWaiting = vi.fn(() => Promise.resolve({ studentName: null, coachFirstName: null, hostName: null, done: ['2026-11-16', '2026-11-23'], skipped: [] }));
  render(<WaitingCards lessons={[left('2026-11-16', 'r1'), left('2026-11-23', 'r1')]} api={{ cancelWaiting } as unknown as FamilyApi} onChanged={vi.fn()} onError={vi.fn()} />);

  expect(screen.getByText('Owen B. can’t make Ava’s shared Monday lessons at 6:00 AM')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel all remaining dates' }));
  expect(screen.getByText('No charge. This can’t be undone.')).toBeInTheDocument();
  expect(cancelWaiting).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel 2 lessons' }));
  expect(cancelWaiting).toHaveBeenCalledWith({ coachId: 'dana', studentId: 'ava', startTime: '06:00', dates: ['2026-11-16', '2026-11-23'] });
});

test('a date past its answer-by time has no card: it’s cancelled with no answer (B8)', () => {
  at(LEFT_BY);
  const { container } = render(<WaitingCards lessons={[left('2026-11-16')]} api={{} as FamilyApi} onChanged={vi.fn()} onError={vi.fn()} />);
  expect(container).toBeEmptyDOMElement();
});

test('the answer-by time is in the coach’s time zone', () => {
  expect(atTime('2026-11-15T12:00:00Z', 'America/Chicago')).toBe('Sun, Nov 15 at 6:00 AM');
});

// ------------------------------------------------------------------------ My bookings

function bookingsApi(data: MyBookings, extra: Record<string, unknown> = {}) {
  return { myBookings: vi.fn(() => Promise.resolve(data)), ...extra } as unknown as FamilyApi;
}

test('each lesson says who it’s shared with; an unanswered invitation can be withdrawn', async () => {
  at('2026-11-10T15:00:00Z');
  const withdrawInvite = vi.fn(() => Promise.resolve({ studentName: 'Ava Park', coachFirstName: 'Dana', hostName: 'Mia C.', done: ['2026-11-16'], skipped: [] }));
  const data: MyBookings = { upcoming: [lesson({ share: share({ partnerName: 'Mia C.', partnerStatus: 'INVITED', inviteId: 'inv-1' }) })], recent: [] };
  render(<Bookings family={FAMILY} api={bookingsApi(data, { withdrawInvite })} onError={vi.fn()} />);

  expect(await screen.findByText('Shared with Mia C. · waiting for their family')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Withdraw invitation' }));
  expect(screen.getByRole('heading', { name: 'Withdraw the invitation to Mia C.?' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
  expect(withdrawInvite).toHaveBeenCalledWith('inv-1');
  expect(await screen.findByText(/The invitation to Mia C\. is withdrawn\./)).toBeInTheDocument();
});

test('a lesson the skater joined is a shared lesson, and its cancel says the other family is asked', async () => {
  at('2026-11-10T15:00:00Z');
  const data: MyBookings = { upcoming: [lesson({ priceMinor: 2500, share: share({ partnerName: 'Ava P.', partnerStatus: 'BOOKED', joined: true }) })], recent: [] };
  render(<Bookings family={FAMILY} api={bookingsApi(data)} onError={vi.fn()} />);

  expect(await screen.findByText('Shared lesson')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByText('Ava P.’s family is asked whether to keep it as a private lesson at the full $50, or cancel it with no charge.')).toBeInTheDocument();
});

test('past its answer-by time a waiting lesson shows Cancelled, no answer, with no charge (B8)', async () => {
  at(LEFT_BY);
  render(<Bookings family={FAMILY} api={bookingsApi({ upcoming: [left('2026-11-16')], recent: [] })} onError={vi.fn()} />);
  expect(await screen.findByText('Cancelled, no answer')).toBeInTheDocument();
  expect(screen.getByText(/· No charge/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
});

test('a kept lesson offers Invite a skater for that lesson only', async () => {
  at('2026-11-10T15:00:00Z');
  const inviteToFreed = vi.fn(() => Promise.resolve({ displayName: 'Jack P.', sibling: true }));
  const data: MyBookings = { upcoming: [lesson({ share: share({ freedPlace: true }) })], recent: [] };
  render(<Bookings family={FAMILY} api={bookingsApi(data, { inviteToFreed })} onError={vi.fn()} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Invite a skater' }));
  await userEvent.click(screen.getByRole('button', { name: 'Add Jack' }));
  await userEvent.click(screen.getByRole('button', { name: 'Share the lesson' }));
  expect(inviteToFreed).toHaveBeenCalledWith({ coachId: 'dana', studentId: 'ava', date: '2026-11-16', startTime: '07:00', shareCode: 'JAC-33333' });
  await waitFor(() => expect(screen.getByText('Jack added to Ava’s lesson on Mon, Nov 16.')).toBeInTheDocument());
});

test('a shared series can only be cancelled whole (B4)', async () => {
  at('2026-11-10T15:00:00Z');
  const rid = 'r1';
  const data: MyBookings = {
    upcoming: [lesson({ recurrenceId: rid, intervalWeeks: 1, share: share({ partnerName: 'Mia C.', partnerStatus: 'BOOKED' }) }),
      lesson({ date: '2026-11-23', startsAtUtc: '2026-11-23T13:00:00Z', recurrenceId: rid, intervalWeeks: 1 })],
    recent: [],
    series: [{ coachId: 'dana', recurrenceId: rid, studentId: 'ava', studentName: 'Ava Park', coachFirstName: 'Dana', weekday: 'MONDAY',
      startTime: '07:00', intervalWeeks: 1, endDate: '2026-11-23', lessonsLeft: 2, lastLesson: '2026-11-23' }],
  };
  render(<SeriesChange api={bookingsApi(data)} coachId="dana" recurrenceId={rid} onError={vi.fn()} />);
  expect(await screen.findByText('This series is shared with another skater')).toBeInTheDocument();
  expect(screen.queryByText('End it earlier')).not.toBeInTheDocument();
  expect(screen.queryByText('Make it less frequent')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cancel 2 lessons' })).toBeEnabled();
});

test('the share line never says more than the family may know', () => {
  expect(shareLine(lesson({ share: share({ partnerName: 'Mia C.', partnerStatus: 'DECLINED' }) }))).toBe('Shared with Mia C. · declined · a private lesson');
  expect(shareLine(lesson({ share: share({ partnerName: 'Mia C.', partnerStatus: 'WITHDRAWN' }) }))).toBe('');
  expect(shareLine(lesson({ share: share({ partnerName: 'Mia C.', partnerStatus: 'BOOKED' }) }))).toBe('Shared with Mia C.');
  expect(shareLine(lesson({}))).toBe('');
});
