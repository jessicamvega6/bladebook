import { describe, expect, test } from 'vitest';
import { firstName, initials, joinNames } from './names';

describe('names', () => {
  test('initials come from the first two words', () => {
    expect(initials('Sarah Park')).toBe('SP');
    expect(initials('  ava  ')).toBe('A');
    expect(initials('Mary Ann Lee')).toBe('MA');
  });

  test('a first name is the first word', () => {
    expect(firstName('Ava Park')).toBe('Ava');
  });

  test('lists of names read as a sentence', () => {
    expect(joinNames(['Coach Dana'])).toBe('Coach Dana');
    expect(joinNames(['Coach Dana', 'Coach Ben'])).toBe('Coach Dana and Coach Ben');
    expect(joinNames(['Ava', 'Jack', 'Lily'])).toBe('Ava, Jack and Lily');
  });
});
