/**
 * The registration-number check shared with Java (backend/core RegistrationNumbers), driven from the same
 * cases: registration-number-cases.json at the repo root (ADR-013 decision 3b).
 */
import { describe, expect, test } from 'vitest';
import cases from '../../../../registration-number-cases.json';
import { liveNumberError, numberOk, numberProblem, cleanNumber, type SkatingOrg } from './registrationNumber';

describe('registration numbers (shared cases)', () => {
  test.each(cases.cases.map((c) => [c.name, c] as const))('%s', (_, c) => {
    const org = c.org as SkatingOrg;
    const expected = c.expect as { number?: string; problem?: string };
    if (expected.number !== undefined) {
      expect(numberProblem(org, c.typed)).toBeNull();
      expect(cleanNumber(c.typed)).toBe(expected.number);
    } else {
      expect(numberProblem(org, c.typed)).toBe(expected.problem);
    }
  });
});

describe('while typing (design: acNumError)', () => {
  test('nothing is said while the box is empty', () => {
    expect(liveNumberError('USFS', '')).toBe('');
  });

  test('a USA Hockey number still being typed is not an error yet', () => {
    expect(liveNumberError('USA_HOCKEY', '2027KQ48')).toBe('');
    expect(numberOk('USA_HOCKEY', '2027KQ48')).toBe(false);
  });

  test('a symbol is flagged straight away', () => {
    expect(liveNumberError('USA_HOCKEY', '2027-')).toBe('Use letters and numbers only.');
  });

  test('14 characters with the wrong mix is flagged', () => {
    expect(liveNumberError('USA_HOCKEY', '20270481500X3T')).toBe('USA Hockey numbers are 14 characters: 9 digits and 5 letters.');
  });

  test('a complete number is ok', () => {
    expect(numberOk('USA_HOCKEY', '2027 kq48 15mx 3t')).toBe(true);
    expect(numberOk('USFS', '1234567')).toBe(true);
  });
});
