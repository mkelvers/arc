import { describe, expect, test } from 'bun:test';

import { firstEpisodeAttemptAt, nextEpisodeAttemptAt } from './policy';

const airing = new Date('2026-08-24T12:00:00Z');

describe('airing target retry policy', () => {
    test('opens the provider check window thirty minutes before airing', () => {
        expect(firstEpisodeAttemptAt(airing).toISOString()).toBe('2026-08-24T11:30:00.000Z');
    });

    test('uses the fixed same-day retry sequence', () => {
        expect(nextEpisodeAttemptAt(airing, new Date('2026-08-24T11:30:00Z'))?.toISOString()).toBe(
            '2026-08-24T12:00:00.000Z'
        );
        expect(nextEpisodeAttemptAt(airing, new Date('2026-08-24T12:05:00Z'))?.toISOString()).toBe(
            '2026-08-24T12:15:00.000Z'
        );
        expect(nextEpisodeAttemptAt(airing, new Date('2026-08-24T18:00:00Z'))?.toISOString()).toBe(
            '2026-08-25T00:00:00.000Z'
        );
    });

    test('backs off daily and stops fourteen days after airing', () => {
        expect(nextEpisodeAttemptAt(airing, new Date('2026-08-27T14:00:00Z'))?.toISOString()).toBe(
            '2026-08-28T12:00:00.000Z'
        );
        expect(nextEpisodeAttemptAt(airing, new Date('2026-09-07T12:00:00Z'))).toBeNull();
    });
});
