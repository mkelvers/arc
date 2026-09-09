import { describe, expect, test } from 'bun:test';

import { AnimePageSchema } from '@arc/core';

describe('anime page contracts', () => {
    test('requires episode inventory state on complete page payloads', () => {
        const page = {
            anime: {
                id: 1,
                title: 'Test anime',
                bannerImage: null,
                description: '',
                genres: [],
                format: 'TV',
                status: 'FINISHED',
                nextAiringEpisode: null,
                score: 0,
                members: '0',
                favourites: '0',
                themes: [],
                studios: [],
                staff: '',
                rankings: [],
            },
            episodeRevision: null,
            watchlistState: null,
            episodes: [],
            watchAction: {
                href: '#anime-episode-list',
                kind: 'episodes',
                episode: null,
            },
            audioLabel: '',
            franchise: null,
            artwork: null,
        };

        expect(AnimePageSchema.safeParse(page).success).toBe(false);
    });
});
