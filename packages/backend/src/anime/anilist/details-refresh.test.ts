import { describe, expect, test } from 'bun:test';

import { animeDetailsRefreshMode } from './details-refresh';

const DAY = 24 * 60 * 60 * 1_000;
const now = Date.parse('2026-08-24T12:00:00Z');

describe('anime detail refresh policy', () => {
    test('never ages out a valid finished release, including an older cache revision', () => {
        expect(
            animeDetailsRefreshMode(
                {
                    status: 'FINISHED',
                    nextAiringEpisode: null,
                    fetchedAt: new Date(now - 365 * DAY),
                    version: 1,
                },
                now
            )
        ).toBe('none');
    });

    test('keeps mutable releases eligible for background refresh', () => {
        expect(
            animeDetailsRefreshMode(
                {
                    status: 'RELEASING',
                    nextAiringEpisode: null,
                    fetchedAt: new Date(now - 6 * 60 * 60 * 1_000),
                    version: 2,
                },
                now
            )
        ).toBe('background');
        expect(
            animeDetailsRefreshMode(
                {
                    status: 'NOT_YET_RELEASED',
                    nextAiringEpisode: null,
                    fetchedAt: new Date(now - DAY),
                    version: 2,
                },
                now
            )
        ).toBe('background');
    });

    test('refreshes a passed airing event promptly without blocking the page', () => {
        expect(
            animeDetailsRefreshMode(
                {
                    status: 'RELEASING',
                    nextAiringEpisode: { airingAt: now / 1_000 - 1, episode: 12 },
                    fetchedAt: new Date(now - 60_000),
                    version: 2,
                },
                now
            )
        ).toBe('urgent');
    });
});
