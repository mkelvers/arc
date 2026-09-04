import { describe, expect, test } from 'bun:test';

import type { AnimeCard } from '@arc/core/types';
import { selectWatchlistEntries, type WatchlistSelection } from './selection';

const selection = {
    state: 'all',
    sort: 'updated',
    order: 'newest',
    language: 'all',
    media: 'all',
    type: 'all',
} satisfies WatchlistSelection;

const card = {
    id: 1,
    href: '/anime/1',
    link: '/anime/1',
    title: 'Stored card',
    image: 'https://images.example/1.jpg',
    audioLabel: '',
    format: 'TV',
    status: 'RELEASING',
    score: 80,
    genres: [],
    synopsis: '',
} satisfies AnimeCard;

const stored = [
    {
        anilistId: 1,
        title: 'Stored card',
        state: 'watching' as const,
        addedAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
    },
    {
        anilistId: 2,
        title: 'Title only',
        state: 'plan_to_watch' as const,
        addedAt: new Date('2026-01-02T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
    },
];

describe('watchlist selection', () => {
    test('keeps a title-only entry visible without claiming complete metadata', () => {
        const entries = selectWatchlistEntries([card], stored, new Map(), selection);

        expect(entries.map(({ id }) => id)).toEqual([2, 1]);
        expect(entries[0]).toMatchObject({
            id: 2,
            href: '/anime/2',
            link: '/anime/2',
            title: 'Title only',
            pendingMetadata: true,
            image: '',
            audioLabel: '',
            format: null,
            status: null,
            score: 0,
            genres: [],
            synopsis: '',
        });
    });

    test('uses a temporary ID label when no local title exists', () => {
        const entries = selectWatchlistEntries(
            [],
            [{ ...stored[1]!, title: null }],
            new Map(),
            selection
        );

        expect(entries[0]).toMatchObject({ title: 'Anime 2', pendingMetadata: true });
    });

    test('excludes pending metadata from filters it cannot satisfy', () => {
        const entries = selectWatchlistEntries([card], stored, new Map(), {
            ...selection,
            type: 'airing',
        });

        expect(entries.map(({ id }) => id)).toEqual([1]);
    });
});
