import { describe, expect, test } from 'bun:test';

import { WatchlistSelectionSchema } from './watchlist';

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
});
