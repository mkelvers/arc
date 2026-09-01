import { describe, expect, test } from 'bun:test';

import { shouldUseQuerySnapshot } from './snapshot-policy';

const requestedAt = new Date('2026-09-01T12:00:00.000Z');

describe('AniList query snapshot policy', () => {
    test('uses a snapshot until its refresh deadline', () => {
        expect(
            shouldUseQuerySnapshot(
                {
                    fetchedAt: new Date('2026-09-01T11:00:00.000Z'),
                    refreshAfter: new Date('2026-09-01T13:00:00.000Z'),
                },
                requestedAt,
                false,
                requestedAt
            )
        ).toBe(true);
    });

    test('refreshes an expired snapshot', () => {
        expect(
            shouldUseQuerySnapshot(
                {
                    fetchedAt: new Date('2026-09-01T10:00:00.000Z'),
                    refreshAfter: new Date('2026-09-01T11:00:00.000Z'),
                },
                requestedAt,
                false,
                requestedAt
            )
        ).toBe(false);
    });

    test('accepts a snapshot written by another request during forced refresh', () => {
        expect(
            shouldUseQuerySnapshot(
                {
                    fetchedAt: new Date('2026-09-01T12:00:00.000Z'),
                    refreshAfter: new Date('2026-09-01T12:30:00.000Z'),
                },
                requestedAt,
                true,
                requestedAt
            )
        ).toBe(true);
    });
});
