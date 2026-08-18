import { describe, expect, test } from 'bun:test';

import {
    watchlistActivityTimestamp,
    watchlistMatchesFilters,
    WatchlistSelectionSchema,
} from './watchlist';

describe('watchlist URL selection', () => {
    test('accepts supported state, sort, and order values', () => {
        expect(
            WatchlistSelectionSchema.parse({
                state: 'completed',
                sort: 'added',
                order: 'oldest',
            })
        ).toMatchObject({ state: 'completed', sort: 'added', order: 'oldest' });
    });

    test('falls back to the default selections', () => {
        expect(
            WatchlistSelectionSchema.parse({
                state: 'paused',
                sort: 'score',
                order: 'ascending',
                language: 'audio',
                media: 'series',
                type: 'releasing',
            })
        ).toEqual({
            state: 'all',
            sort: 'updated',
            order: 'newest',
            language: 'all',
            media: 'series',
            type: 'all',
        });
    });

    test('accepts supported metadata filters', () => {
        expect(
            WatchlistSelectionSchema.parse({ language: 'dub', media: 'movie', type: 'airing' })
        ).toMatchObject({ language: 'dub', media: 'movie', type: 'airing' });
    });

    test.each(['recent_activity', 'watched'])('rejects playback ordering %s', (sort) => {
        expect(WatchlistSelectionSchema.parse({ sort }).sort).toBe('updated');
    });

    test('uses local add time when provider update time is older', () => {
        expect(watchlistActivityTimestamp(1_000, 2_000)).toBe(2_000);
        expect(watchlistActivityTimestamp(3_000, 2_000)).toBe(3_000);
    });
});

describe('watchlist metadata filters', () => {
    const allFilters = { language: 'all', media: 'all', type: 'all' } as const;

    test.each([
        {
            title: 'I Want to Eat Your Pancreas',
            format: 'MOVIE',
            status: 'FINISHED',
            audio: ['sub'] as const,
        },
        {
            title: 'A Silent Voice',
            format: 'MOVIE',
            status: 'FINISHED',
            audio: ['sub', 'dub'] as const,
        },
    ])('$title is a finished movie', ({ format, status, audio }) => {
        const card = { format, status };

        expect(
            watchlistMatchesFilters(card, new Set(audio), { ...allFilters, media: 'movie' })
        ).toBe(true);
        expect(
            watchlistMatchesFilters(card, new Set(audio), { ...allFilters, type: 'finished' })
        ).toBe(true);
        expect(
            watchlistMatchesFilters(card, new Set(audio), { ...allFilters, media: 'series' })
        ).toBe(false);
    });

    test('distinguishes airing series from finished series', () => {
        const airing = { format: 'TV', status: 'RELEASING' };
        const finished = { format: 'TV', status: 'FINISHED' };

        expect(
            watchlistMatchesFilters(airing, new Set(['sub']), { ...allFilters, type: 'airing' })
        ).toBe(true);
        expect(
            watchlistMatchesFilters(airing, new Set(['sub']), { ...allFilters, type: 'finished' })
        ).toBe(false);
        expect(
            watchlistMatchesFilters(finished, new Set(['sub']), { ...allFilters, type: 'finished' })
        ).toBe(true);
    });

    test('treats any dub availability as dubbed and no dub as subtitled', () => {
        const card = { format: 'TV', status: 'FINISHED' };

        expect(
            watchlistMatchesFilters(card, new Set(['sub', 'dub']), {
                ...allFilters,
                language: 'dub',
            })
        ).toBe(true);
        expect(
            watchlistMatchesFilters(card, new Set(['sub', 'dub']), {
                ...allFilters,
                language: 'sub',
            })
        ).toBe(false);
        expect(
            watchlistMatchesFilters(card, new Set(['sub']), { ...allFilters, language: 'sub' })
        ).toBe(true);
    });
});
