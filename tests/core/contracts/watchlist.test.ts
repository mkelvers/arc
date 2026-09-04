import { describe, expect, test } from 'bun:test';

import { WatchlistPageResponseSchema, WatchlistUpdateSchema } from '@arc/core';

describe('watchlist contracts', () => {
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
                        format: null,
                        status: null,
                        score: 0,
                        genres: [],
                        synopsis: '',
                        state: 'plan_to_watch',
                        pendingMetadata: true,
                    },
                ],
            }).success
        ).toBeTrue();
    });
});
