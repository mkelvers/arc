import { describe, expect, test } from 'bun:test';

import {
    watchlistActivityTimestamp,
    watchlistLanguage,
    watchlistMatchesFilters,
    watchlistMediaType,
    watchlistOrder,
    watchlistSort,
    watchlistSorts,
    watchlistState,
    watchlistType,
} from './watchlist';

describe('watchlist URL selection', () => {
    test('accepts supported state, sort, and order values', () => {
        expect(watchlistState('completed')).toBe('completed');
        expect(watchlistSort('added')).toBe('added');
        expect(watchlistOrder('oldest')).toBe('oldest');
    });

    test('falls back to the default selections', () => {
        expect(watchlistState('paused')).toBe('all');
        expect(watchlistSort('score')).toBe('updated');
        expect(watchlistOrder('ascending')).toBe('newest');
        expect(watchlistLanguage('audio')).toBe('all');
        expect(watchlistMediaType('series')).toBe('series');
        expect(watchlistType('releasing')).toBe('all');
    });

    test('accepts supported metadata filters', () => {
        expect(watchlistLanguage('dub')).toBe('dub');
        expect(watchlistMediaType('movie')).toBe('movie');
        expect(watchlistType('airing')).toBe('airing');
    });

    test('does not offer playback activity as watchlist ordering', () => {
        expect(watchlistSorts).toEqual(['updated', 'added', 'alphabetical']);
        expect(watchlistSort('recent_activity')).toBe('updated');
        expect(watchlistSort('watched')).toBe('updated');
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
