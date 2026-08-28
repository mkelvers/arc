import { describe, expect, test } from 'bun:test';

import { firstEpisodeAttemptAt, nextEpisodeAttemptAt } from './policy';

const airing = new Date('2026-08-24T12:00:00Z');

describe('airing target retry policy', () => {
    test('opens the provider check window thirty minutes before airing', () => {
        expect(firstEpisodeAttemptAt(airing).toISOString()).toBe('2026-08-24T11:30:00.000Z');
    });

    test('retries one minute after every failed provider check', () => {
        expect(nextEpisodeAttemptAt(airing, new Date('2026-08-24T12:00:00Z'))?.toISOString()).toBe(
            '2026-08-24T12:01:00.000Z'
        );
        expect(nextEpisodeAttemptAt(airing, new Date('2026-08-24T18:00:00Z'))?.toISOString()).toBe(
            '2026-08-24T18:01:00.000Z'
        );
    });

    test('stops fourteen days after airing', () => {
        expect(nextEpisodeAttemptAt(airing, new Date('2026-09-07T11:59:00Z'))?.toISOString()).toBe(
            '2026-09-07T12:00:00.000Z'
        );
        expect(nextEpisodeAttemptAt(airing, new Date('2026-09-07T12:00:01Z'))).toBeNull();
    });
});
