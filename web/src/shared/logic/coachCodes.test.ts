import { describe, expect, test } from 'vitest';
import { codeState, continueLabel, looksLikeShareCode, normalizeCode } from './coachCodes';

const DANA = { firstName: 'Dana', lastName: 'Whitfield', initials: 'DW' };

describe('coach code entry (FeatureDecriptions/Client Sign Up, step 1)', () => {
  test('case, spaces and the dash are ignored', () => {
    expect(normalizeCode(' 7k2q-m9xt ')).toBe('7K2QM9XT');
  });

  test('fewer than 8 letters and numbers is still typing', () => {
    expect(codeState('7K2Q-M9', undefined, [])).toBe('typing');
  });

  test('8 characters with no answer yet is checking', () => {
    expect(codeState('7K2Q-M9XT', undefined, [])).toBe('checking');
    expect(codeState('7K2Q-M9XT', { code: 'AAAAAAAA', coach: DANA }, [])).toBe('checking');
  });

  test('a code the server found', () => {
    expect(codeState('7k2q-m9xt', { code: '7K2QM9XT', coach: DANA }, [])).toBe('found');
  });

  test('a code already on the list', () => {
    expect(codeState('7K2QM9XT', { code: '7K2QM9XT', coach: DANA }, ['7K2QM9XT'])).toBe('dup');
  });

  test('a code nobody holds', () => {
    expect(codeState('AAAA-AAAA', { code: 'AAAAAAAA', coach: null }, [])).toBe('wrong');
  });

  test('more than 8 characters can never be a coach code', () => {
    expect(codeState('7K2Q-M9XTZ', undefined, [])).toBe('wrong');
  });

  test("a skater's share code typed with its dash gets its own message", () => {
    expect(looksLikeShareCode('mia-4k7qx')).toBe(true);
    expect(looksLikeShareCode('MIA4K7QX')).toBe(false);
    expect(codeState('MIA-4K7QX', { code: 'MIA4K7QX', coach: null }, [])).toBe('share');
  });

  test('the button names the coach, or counts the coaches', () => {
    expect(continueLabel([])).toBe('Continue');
    expect(continueLabel([DANA])).toBe('Continue with Dana');
    expect(continueLabel([DANA, { ...DANA, firstName: 'Ben' }])).toBe('Continue with 2 coaches');
  });
});
