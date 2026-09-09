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

    test('uses Kitsu categories as genres when its genre relationship is empty', () => {
        expect(
            toAnimeDetails({
                id: 182205,
                title: null,
                bannerImage: null,
                description: null,
                genres: [],
                format: 'TV',
                status: 'RELEASING',
                season: 'SPRING',
                seasonYear: 2026,
                startDate: { year: 2026, month: 4, day: 3 },
                endDate: null,
                nextAiringEpisode: null,
                averageScore: null,
                popularity: 3036,
                favourites: 18,
                metadataSource: 'kitsu',
                rankings: [
                    { rank: 3823, type: 'POPULAR', year: null, season: null, allTime: true },
                    { rank: 170, type: 'RATED', year: null, season: null, allTime: true },
                ],
                tags: [
                    {
                        name: 'Fantasy',
                        rank: null,
                        isGeneralSpoiler: false,
                        isMediaSpoiler: false,
                    },
                ],
                studios: { nodes: [{ name: 'Example Pictures' }] },
                staff: { edges: [] },
            })
        ).toMatchObject({
            score: null,
            genres: ['Fantasy'],
            themes: [],
            rankings: ['#3823 most popular all time', '#170 highest rated all time'],
            startDate: '2026-04-03',
            endDate: null,
        });
    });
});
