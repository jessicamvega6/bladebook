import { describe, expect, it } from 'vitest';
import { codeState, noAnswer, normaliseShareCode, shareOf, splitLine } from './sharing';

describe('share codes (ADR-MASTER section 3)', () => {
  it('ignores case, spaces and the dash', () => {
    expect(normaliseShareCode('mia-4k7qx')).toBe('MIA-4K7QX');
    expect(normaliseShareCode(' MIA 4K7QX ')).toBe('MIA-4K7QX');
  });

  it('refuses anything that cannot be a share code', () => {
    for (const bad of ['', 'MIA-4K7Q', 'MIA-4K7QXX', 'MI4-4K7QX', 'MIA-4K7Q0', '7K2Q-M9XT']) expect(normaliseShareCode(bad)).toBeNull();
  });

  it('says what the box holds before the share-check is asked (ADR-033 2a)', () => {
    expect(codeState('', 'AVA-22222')).toBe('empty');
    expect(codeState('MIA-4K', 'AVA-22222')).toBe('typing');
    expect(codeState('ava22222', 'AVA-22222')).toBe('self');
    expect(codeState('MIA-4K7Q0', 'AVA-22222')).toBe('wrong');
    expect(codeState('MIA-4K7QX', 'AVA-22222')).toBe('ready');
    expect(codeState('MIA-4K7QX', null)).toBe('ready');
  });
});

describe('price shares (B10)', () => {
  it('is the price divided by the skaters, the odd cent to the earliest', () => {
    expect(shareOf(5000, 2)).toBe(2500);
    expect(shareOf(4501, 2, 0)).toBe(2251);
    expect(shareOf(4501, 2, 1)).toBe(2250);
    expect(shareOf(5000, 1)).toBe(5000);
  });

  it('never says "half"', () => {
    expect(splitLine(5000, 'USD')).toBe('Once they join, the lesson’s $50 is split between the skaters: with 2 skaters, each pays $25.');
    expect(splitLine(5000, 'USD')).not.toMatch(/half/i);
  });
});

describe('worked out from the clock (B8)', () => {
  it('is cancelled with no answer from the answer-by time on', () => {
    const by = '2026-11-15T12:00:00Z';
    expect(noAnswer(by, Date.parse('2026-11-15T11:59:59Z'))).toBe(false);
    expect(noAnswer(by, Date.parse(by))).toBe(true);
    expect(noAnswer(null, Date.parse(by))).toBe(false);
  });
});
