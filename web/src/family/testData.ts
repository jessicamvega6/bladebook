/** Families for the family website's tests. */
import type { Family } from './api';

export const WAITING: Family = {
  contact: { firstName: 'Sarah', lastName: 'Park', email: 'sarah@example.com', phone: '(205) 555-0196', relationship: 'GUARDIAN' },
  waiting: true,
  skaters: [
    { name: 'Ava Park', isMinor: true, skatingOrg: 'USFS', registrationNumber: '1234567', coaches: [{ firstName: 'Dana', lastName: 'Whitfield', status: 'PENDING' }] },
    { name: 'Jack Park', isMinor: true, skatingOrg: 'USA_HOCKEY', registrationNumber: '2027KQ4815MX3T', coaches: [{ firstName: 'Dana', lastName: 'Whitfield', status: 'PENDING' }] },
  ],
  coaches: [{ firstName: 'Dana', lastName: 'Whitfield', status: 'PENDING', skaterNames: ['Ava Park', 'Jack Park'], waitingNames: ['Ava Park', 'Jack Park'], details: null }],
};

export const APPROVED: Family = {
  ...WAITING,
  waiting: false,
  skaters: [
    { ...WAITING.skaters[0]!, coaches: [{ firstName: 'Dana', lastName: 'Whitfield', status: 'ACTIVE' }] },
    WAITING.skaters[1]!,
  ],
  coaches: [{
    firstName: 'Dana', lastName: 'Whitfield', status: 'ACTIVE', skaterNames: ['Ava Park', 'Jack Park'], waitingNames: ['Jack Park'],
    details: { phone: '(205) 555-0142', email: null, payments: [{ type: 'VENMO', handle: '@dana-skates' }, { type: 'CASH', handle: null }] },
  }],
};

export function json(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}
