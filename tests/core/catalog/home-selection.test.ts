import { describe, expect, test } from 'bun:test';

import {
    eligibleHomeHeroCandidates,
    homeHeroRotationStart,
    rotatedHomeHeroCandidates,
    selectHomeHero,
} from '@arc/core';

describe('homepage hero selection', () => {
    test('uses stable three-day UTC rotation boundaries', () => {
        expect(homeHeroRotationStart(new Date('2026-08-10T23:59:59Z'))).toBe('2026-08-08');
        expect(homeHeroRotationStart(new Date('2026-08-11T00:00:00Z'))).toBe('2026-08-11');
    });

    test('continues down the ranking until six candidates qualify', async () => {
        const selected = await selectHomeHero(
            [1, 2, 3, 4, 5, 6, 7, 8].map((anilistId) => ({
                anilistId,
                averageScore: 75,
                trendingRank: anilistId,
            })),
            async (id) => (id === 2 || id === 6 ? null : id)
        );

        expect(selected).toEqual([1, 3, 4, 5, 7, 8]);
    });

    test('retains exceptional previous titles before fresh candidates', () => {
        const rotated = rotatedHomeHeroCandidates(
            [
                { anilistId: 1, averageScore: 90, trendingRank: 20 },
                { anilistId: 2, averageScore: 80, trendingRank: 5 },
                { anilistId: 3, averageScore: 95, trendingRank: 2 },
                ...Array.from({ length: 9 }, (_, index) => ({
                    anilistId: index + 4,
                    averageScore: 75,
                    trendingRank: index + 4,
                })),
            ],
            [1, 2, 3],
            [1, 2, 3]
        );

        expect(rotated.slice(0, 2).map(({ anilistId }) => anilistId)).toEqual([3, 2]);
        expect(rotated.slice(2, 6).every(({ anilistId }) => anilistId > 3)).toBe(true);
    });

    test('filters hero candidates to current popular broad-audience anime', () => {
        const candidates = eligibleHomeHeroCandidates(
            [
                {
                    anilistId: 1,
                    averageScore: 81,
                    trendingRank: 5,
                    popularity: 60_000,
                    favourites: 1_000,
                    seasonYear: 2026,
                    genres: ['Comedy'],
                    hasPrequel: true,
                },
                {
                    anilistId: 2,
                    averageScore: 81,
                    trendingRank: 6,
                    popularity: 10_000,
                    favourites: 500,
                    seasonYear: 2026,
                    genres: ['Comedy'],
                    hasPrequel: false,
                },
            ].map((candidate) => ({ ...candidate, format: 'TV' as const, duration: 24 })),
            new Date('2026-08-11T00:00:00Z')
        );

        expect(candidates.map(({ anilistId }) => anilistId)).toEqual([1]);
    });
});
