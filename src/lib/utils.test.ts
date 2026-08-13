import { describe, expect, test } from 'bun:test';

import { batches, formatDuration, isRecord, nonEmptyText, positiveInteger, record } from './utils';

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

    test('splits work into validated batches', () => {
        expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
        expect(batches([], 2)).toEqual([]);
        expect(() => batches([1], 0)).toThrow(RangeError);
    });

    test('formats durations consistently', () => {
        expect(formatDuration(25)).toBe('25m');
        expect(formatDuration(125)).toBe('2h, 5m');
        expect(formatDuration(null)).toBe('');
    });
});
