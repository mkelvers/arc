import { describe, expect, test } from 'bun:test';

import {
    chunks,
    formatDate,
    formatDuration,
    isRecord,
    nonEmptyText,
    parseDate,
    positiveInteger,
    record,
} from './utils';

describe('shared utilities', () => {
    test('chunks values without dropping an incomplete final batch', () => {
        expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([
            [1, 2],
            [3, 4],
            [5],
        ]);
        expect(() => chunks([1], 0)).toThrow(RangeError);
    });

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
        expect(parseDate('2026-07-29T10:00:00Z')).toEqual(
            new Date('2026-07-29T10:00:00Z'),
        );
        expect(parseDate('not a date')).toBeUndefined();
    });

    test('formats dates and durations consistently', () => {
        expect(formatDate('7/29/2026')).toBe('Jul 29, 2026');
        expect(formatDate('not a date')).toBe('not a date');
        expect(formatDuration(25)).toBe('25m');
        expect(formatDuration(125)).toBe('2h, 5m');
        expect(formatDuration(null)).toBe('');
    });
});
