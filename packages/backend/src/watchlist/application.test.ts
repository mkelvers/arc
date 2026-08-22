import { describe, expect, test } from 'bun:test';

import type { AnimeCard } from '@arc/shared/types';
import { selectWatchlistEntries, type WatchlistSelection } from './application';

const selection: WatchlistSelection = {
    state: 'all',
    sort: 'updated',
    order: 'newest',
    language: 'all',
    media: 'all',
    type: 'all',
};
const cards: AnimeCard[] = [
    {
        id: 1,
        href: '/anime/1',
        link: '/anime/1',
        title: 'Beta',
        image: '',
        audioLabel: '',
        format: 'TV',
        status: 'RELEASING',
        score: 80,
        genres: [],
        synopsis: '',
    },
    {
        id: 2,
        href: '/anime/2',
        link: '/anime/2',
        title: 'Alpha',
        image: '',
        audioLabel: '',
        format: 'MOVIE',
        status: 'FINISHED',
        score: 90,
        genres: [],
        synopsis: '',
    },
];
const stored = [
    {
        anilistId: 1,
        state: 'watching' as const,
        addedAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-03T00:00:00Z'),
    },
    {
        anilistId: 2,
        state: 'completed' as const,
        addedAt: new Date('2026-01-02T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
    },
];
const audio = new Map([
    [1, new Set(['sub'] as const)],
    [2, new Set(['sub', 'dub'] as const)],
]);

describe('watchlist page selection', () => {
    test('filters state, media, release status, and audio availability', () => {
        expect(
            selectWatchlistEntries(cards, stored, audio, {
                ...selection,
                state: 'completed',
                media: 'movie',
                type: 'finished',
                language: 'dub',
            }).map(({ id }) => id)
        ).toEqual([2]);
        expect(
            selectWatchlistEntries(cards, stored, audio, {
                ...selection,
                type: 'airing',
                language: 'sub',
            }).map(({ id }) => id)
        ).toEqual([1]);
    });

    test('preserves updated, added, and alphabetical ordering', () => {
        expect(selectWatchlistEntries(cards, stored, audio, selection).map(({ id }) => id)).toEqual(
            [1, 2]
        );
        expect(
            selectWatchlistEntries(cards, stored, audio, {
                ...selection,
                sort: 'added',
                order: 'oldest',
            }).map(({ id }) => id)
        ).toEqual([1, 2]);
        expect(
            selectWatchlistEntries(cards, stored, audio, {
                ...selection,
                sort: 'alphabetical',
                order: 'newest',
            }).map(({ id }) => id)
        ).toEqual([2, 1]);
    });
});
