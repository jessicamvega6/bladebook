/** Families for the family website's tests. */
import type { BookingPage, Family, FamilyLesson, TimeDto } from './api';

export const WAITING: Family = {
  contact: { firstName: 'Sarah', lastName: 'Park', email: 'sarah@example.com', phone: '(205) 555-0196', relationship: 'GUARDIAN' },
  waiting: true,
  skaters: [
    { studentId: 'ava', name: 'Ava Park', isMinor: true, skatingOrg: 'USFS', registrationNumber: '1234567', coaches: [{ coachId: null, firstName: 'Dana', lastName: 'Whitfield', status: 'PENDING' }] },
    { studentId: 'jack', name: 'Jack Park', isMinor: true, skatingOrg: 'USA_HOCKEY', registrationNumber: '2027KQ4815MX3T', coaches: [{ coachId: null, firstName: 'Dana', lastName: 'Whitfield', status: 'PENDING' }] },
  ],
  coaches: [{ coachId: null, firstName: 'Dana', lastName: 'Whitfield', status: 'PENDING', skaterNames: ['Ava Park', 'Jack Park'], waitingNames: ['Ava Park', 'Jack Park'], details: null }],
};

/** Ava is approved by Coach Dana; Jack still waits. */
export const APPROVED: Family = {
  ...WAITING,
  waiting: false,
  skaters: [
    { ...WAITING.skaters[0]!, coaches: [{ coachId: 'dana', firstName: 'Dana', lastName: 'Whitfield', status: 'ACTIVE' }] },
    WAITING.skaters[1]!,
  ],
  coaches: [{
    coachId: 'dana', firstName: 'Dana', lastName: 'Whitfield', status: 'ACTIVE', skaterNames: ['Ava Park', 'Jack Park'], waitingNames: ['Jack Park'],
    details: { phone: '(205) 555-0142', email: null, payments: [{ type: 'VENMO', handle: '@dana-skates' }, { type: 'CASH', handle: null }] },
  }],
};

/** Ava is with Coach Dana and Coach Ben, both approved. */
export const TWO_COACHES: Family = {
  ...APPROVED,
  skaters: [
    { ...APPROVED.skaters[0]!, coaches: [
      { coachId: 'dana', firstName: 'Dana', lastName: 'Whitfield', status: 'ACTIVE' },
      { coachId: 'ben', firstName: 'Ben', lastName: 'Ortiz', status: 'ACTIVE' },
    ] },
    APPROVED.skaters[1]!,
  ],
  coaches: [
    APPROVED.coaches[0]!,
    { coachId: 'ben', firstName: 'Ben', lastName: 'Ortiz', status: 'ACTIVE', skaterNames: ['Ava Park'], waitingNames: [], details: { phone: null, email: null, payments: [] } },
  ],
};

export const time = (date: string, startTime: string, o: Partial<TimeDto> = {}): TimeDto => {
  const m = Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3)) + (o.durationMinutes ?? 30);
  return {
    date, startTime, endTime: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
    durationMinutes: 30, priceMinor: 5000, currency: 'USD', blockSeq: 1, blockName: 'Morning ice', free: true, started: false, ...o,
  };
};

/**
 * Coach Dana's booking page on Tuesday, November 10, 2026: Monday mornings, the 16th's 6:30 taken by another
 * family and its 7:00 Ava's own; an evening block on Wednesday the 18th.
 */
export const DANA_PAGE: BookingPage = {
  coachFirstName: 'Dana', coachLastName: 'Whitfield', coachTimezone: 'America/Chicago', requiredNoticeHours: 24,
  today: '2026-11-10', now: '09:00', windowFirst: '2026-11-10', windowLast: '2027-01-31', hasSchedule: true,
  times: [
    time('2026-11-16', '06:00'), time('2026-11-16', '06:30', { free: false }), time('2026-11-16', '07:00', { free: false }),
    time('2026-11-16', '07:30'),
    time('2026-11-18', '16:00', { blockSeq: 2, blockName: null, durationMinutes: 60, priceMinor: 8000 }),
    time('2026-11-23', '06:00'), time('2026-12-07', '06:00'),
  ],
  familyLessons: [{ coachId: 'dana', coachFirstName: 'Dana', studentId: 'ava', studentName: 'Ava Park', date: '2026-11-16', startTime: '07:00', durationMinutes: 30, startsAtUtc: '2026-11-16T13:00:00Z', coachTz: 'America/Chicago' }],
};

export const BEN_PAGE: BookingPage = {
  ...DANA_PAGE, coachFirstName: 'Ben', coachLastName: 'Ortiz', familyLessons: [],
  times: [time('2026-11-17', '17:00', { blockName: 'Evening' })],
};

export const LESSONS: FamilyLesson[] = [
  { coachId: 'dana', coachFirstName: 'Dana', studentId: 'ava', studentName: 'Ava Park', date: '2026-11-16', startTime: '07:00', durationMinutes: 30, startsAtUtc: '2026-11-16T13:00:00Z', coachTz: 'America/Chicago' },
];

export function json(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}
