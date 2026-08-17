import { describe, expect, test } from 'bun:test';

import { publicationRetryDelay } from './publication-policy';

describe('AniList publication retry policy', () => {
    test('backs off exponentially and caps at thirty minutes', () => {
        expect([0, 1, 2, 3, 4, 5, 6].map((attempts) => publicationRetryDelay(attempts))).toEqual([
            60_000, 120_000, 240_000, 480_000, 960_000, 1_800_000, 1_800_000,
        ]);
    });

    test('honors the provider retry window', () => {
        expect(publicationRetryDelay(0, 90_000)).toBe(90_000);
    });
});
