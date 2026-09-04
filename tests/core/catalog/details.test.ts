import { describe, expect, test } from 'bun:test';

import { toAnimeDetails } from '@arc/core';

describe('anime detail shaping', () => {
    test('hides a stale next airing event', () => {
        expect(
            toAnimeDetails({
                id: 196187,
                title: null,
                bannerImage: null,
                description: null,
                genres: null,
                format: null,
                status: 'RELEASING',
                season: null,
                seasonYear: null,
                nextAiringEpisode: {
                    episode: 6,
                    airingAt: Math.floor(Date.now() / 1_000) - 1,
                },
                averageScore: null,
                popularity: null,
                favourites: null,
            }).nextAiringEpisode
        ).toBeNull();
    });

    test('preserves a stored airing event as the source of truth', () => {
        const nextAiringEpisode = {
            episode: 18,
            airingAt: Math.floor(Date.now() / 1_000) - 1,
        };

        expect(
            toAnimeDetails(
                {
                    id: 196187,
                    title: null,
                    bannerImage: null,
                    description: null,
                    genres: null,
                    format: null,
                    status: 'RELEASING',
                    season: null,
                    seasonYear: null,
                    nextAiringEpisode: {
                        episode: 19,
                        airingAt: nextAiringEpisode.airingAt + 7 * 86400,
                    },
                    averageScore: null,
                    popularity: null,
                    favourites: null,
                },
                undefined,
                nextAiringEpisode
            ).nextAiringEpisode
        ).toEqual(nextAiringEpisode);
    });
});
