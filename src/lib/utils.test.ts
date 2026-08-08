import { describe, expect, test } from 'bun:test';

import { formatDate, formatDuration, isRecord, nonEmptyText, positiveInteger, record } from './utils';

describe('shared utilities', () => {
  test('narrows and parses records without accepting arrays', () => {
    expect(isRecord({ id: 1 })).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(record({ id: 1 })).toEqual({ id: 1 });
    expect(record(null)).toBeNull();
  });

  test('normalizes primitive transfer values', () => {
    expect(positiveInteger('42')).toBe(42);
    expect(positiveInteger(-1)).toBeUndefined();
    expect(positiveInteger(true)).toBeUndefined();
    expect(nonEmptyText('  title  ')).toBe('title');
    expect(nonEmptyText('   ')).toBeUndefined();
  });

  test('formats dates and durations consistently', () => {
    expect(formatDate('7/29/2026')).toBe('Jul 29, 2026');
    expect(formatDate('not a date')).toBe('not a date');
    expect(formatDuration(25)).toBe('25m');
    expect(formatDuration(125)).toBe('2h, 5m');
    expect(formatDuration(null)).toBe('');
  });
});
