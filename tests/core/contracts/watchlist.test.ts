import { describe, expect, test } from 'bun:test';

import {
    WatchlistPageResponseSchema,
    WatchlistSelectionSchema,
    WatchlistUpdateSchema,
} from '@arc/core';

describe('watchlist contracts', () => {
    test('defaults an empty selection for the unfiltered watchlist endpoint', () => {
        expect(WatchlistSelectionSchema.parse({})).toEqual({
            state: 'all',
            sort: 'updated',
            order: 'newest',
            language: 'all',
            media: 'all',
            type: 'all',
        });
    });

    test('accepts an optional trimmed title on updates', () => {
        expect(
            WatchlistUpdateSchema.parse({ state: 'plan_to_watch', title: '  Frieren  ' })
        ).toEqual({ state: 'plan_to_watch', title: 'Frieren' });
        expect(WatchlistUpdateSchema.safeParse({ state: 'watching' }).success).toBeTrue();
        expect(
            WatchlistUpdateSchema.safeParse({ state: 'watching', title: ' '.repeat(2) }).success
        ).toBeFalse();
    });

    test('accepts a title-only pending card without changing complete card fields', () => {
        expect(
            WatchlistPageResponseSchema.safeParse({
                totalEntries: 1,
                entries: [
                    {
                        id: 1,
                        href: '/anime/1',
                        link: '/anime/1',
                        title: 'Frieren',
                        image: '',
                        audioLabel: '',
                        audio: [],
                        format: null,
                        status: null,
                        score: 0,
                        genres: [],
                        synopsis: '',
                        state: 'plan_to_watch',
                        addedAt: null,
                        updatedAt: null,
                        pendingMetadata: true,
                    },
                ],
            }).success
        ).toBeTrue();
    });
});
