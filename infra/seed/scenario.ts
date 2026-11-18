// What dev's seed holds (ADR-028 decision 2): made-up people on the test accounts, no real person's data. Phone numbers
// are in 555-01xx, the range set aside for fiction; registration numbers are fake ones in each organisation's shape
// (ADR-028, amended 2026-10-20). Every coach is in the launch time zone, Central (I7).
//
// Tests that rely on a particular record name it here, and run only against a seed build (ADR-028 decision 3).

export interface Template {
  seq: number;
  name: string;
  startTime: string;
  endTime: string;
  lessonMinutes: number;
  priceMinor: number;
  maxSkaters: number;
  iceType: 'BFSC_FREESTYLE';
  /** 0 = Sunday … 6 = Saturday, as the schedule API takes them. */
  days: number[];
  off: null;
}

export interface Coach {
  account: string;
  signup: Record<string, unknown>;
  templates: Template[];
}

export interface Skater {
  name: string;
  skatingOrg: 'USFS' | 'LEARN_TO_SKATE_USA';
  registrationNumber: string;
  /** Test-account names of this skater's coaches. */
  coaches: string[];
}

export interface Family {
  account: string;
  registration: { firstName: string; lastName: string; phone: string; relationship: 'SELF' | 'GUARDIAN'; skaters: Skater[] };
  /** How many free times to book per skater and coach, and where in the coach's free times to start. */
  book: number;
  offset: number;
  /** One time, repeated weekly to the end of the booking window. */
  weekly?: boolean;
  /** Cancel the first lesson booked, so there's a cancellation on record. */
  cancelFirst?: boolean;
  /** Not approved: the coach sees the family waiting. */
  leaveWaiting?: boolean;
}

const coach = (first: string, last: string, phone: string): Record<string, unknown> => ({
  firstName: first,
  lastName: last,
  useLoginEmail: true,
  businessEmail: null,
  phone,
  coachTimezone: 'America/Chicago',
  currency: 'USD',
  paymentInstructions: 'Cash at the rink, or pay before the lesson.',
  paymentTypes: [{ type: 'CASH', on: true, handle: null }],
});

const block = (seq: number, name: string, startTime: string, endTime: string, days: number[], priceMinor: number,
  maxSkaters = 1): Template => ({
  seq, name, startTime, endTime, lessonMinutes: 30, priceMinor, maxSkaters, iceType: 'BFSC_FREESTYLE', days, off: null,
});

export const COACHES: Coach[] = [
  {
    account: 'dev-coach-a',
    signup: coach('Ava', 'Marsh', '(205) 555-0101'),
    templates: [block(1, 'Morning freestyle', '06:00', '08:00', [1, 3, 5], 4000)],
  },
  {
    account: 'dev-coach-b',
    signup: coach('Ben', 'Ortiz', '(205) 555-0102'),
    // Two skaters a lesson: shared lessons.
    templates: [block(1, 'After-school freestyle', '16:00', '18:00', [2, 4], 3500, 2)],
  },
  {
    account: 'dev-coach-c',
    signup: coach('Cara', 'Lind', '(205) 555-0103'),
    templates: [
      block(1, 'Saturday freestyle', '09:00', '11:00', [6], 4500),
      block(2, 'Sunday freestyle', '13:00', '14:00', [0], 4500),
    ],
  },
];

const guardian = (account: string, first: string, last: string, n: number, skaters: Skater[],
  plan: Omit<Family, 'account' | 'registration'>): Family => ({
  account,
  registration: { firstName: first, lastName: last, phone: `(205) 555-01${String(10 + n)}`, relationship: 'GUARDIAN', skaters },
  ...plan,
});

const adult = (account: string, first: string, last: string, n: number, skater: Skater,
  plan: Omit<Family, 'account' | 'registration'>): Family => ({
  account,
  registration: { firstName: first, lastName: last, phone: `(205) 555-01${String(10 + n)}`, relationship: 'SELF', skaters: [skater] },
  ...plan,
});

const usfs = (name: string, n: number, coaches: string[]): Skater =>
  ({ name, skatingOrg: 'USFS', registrationNumber: String(9000000 + n), coaches });
const lts = (name: string, n: number, coaches: string[]): Skater =>
  ({ name, skatingOrg: 'LEARN_TO_SKATE_USA', registrationNumber: `lts${7000 + n}`, coaches });

export const FAMILIES: Family[] = [
  guardian('dev-client-1', 'Dana', 'Reyes', 1,
    [usfs('Mia Reyes', 1, ['dev-coach-a']), usfs('Leo Reyes', 2, ['dev-coach-a'])], { book: 2, offset: 0, weekly: false }),
  guardian('dev-client-2', 'Sam', 'Patel', 2,
    [usfs('Asha Patel', 3, ['dev-coach-a', 'dev-coach-b'])], { book: 2, offset: 4, cancelFirst: true }),
  adult('dev-client-3', 'Jordan', 'Kim', 3, usfs('Jordan Kim', 4, ['dev-coach-b']), { book: 1, offset: 0, weekly: true }),
  guardian('dev-client-4', 'Riley', 'Novak', 4,
    [lts('Ivy Novak', 5, ['dev-coach-b', 'dev-coach-c']), lts('Max Novak', 6, ['dev-coach-c'])], { book: 1, offset: 2 }),
  adult('dev-client-5', 'Casey', 'Brooks', 5, usfs('Casey Brooks', 7, ['dev-coach-c']), { book: 2, offset: 6 }),
  guardian('dev-client-6', 'Morgan', 'Lee', 6, [usfs('Ella Lee', 8, ['dev-coach-a'])], { book: 1, offset: 8, weekly: true }),
  guardian('dev-client-7', 'Taylor', 'Diaz', 7, [lts('Noah Diaz', 9, ['dev-coach-b'])], { book: 2, offset: 6 }),
  adult('dev-client-8', 'Avery', 'Shah', 8, usfs('Avery Shah', 10, ['dev-coach-c']), { book: 1, offset: 10 }),
  guardian('dev-client-9', 'Quinn', 'Ford', 9, [usfs('Zoe Ford', 11, ['dev-coach-a'])], { book: 0, offset: 0, leaveWaiting: true }),
  guardian('dev-client-10', 'Jamie', 'Cole', 10, [lts('Owen Cole', 12, ['dev-coach-b', 'dev-coach-c'])],
    { book: 0, offset: 0, leaveWaiting: true }),
];
