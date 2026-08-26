import { describe, expect, test } from 'bun:test';

import {
    eligibleHomeHeroCandidates,
    homeHeroRotationStart,
    rotatedHomeHeroCandidates,
    selectHomeHero,
} from './selection';

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

    test('only admits well-liked, current-year anime with broad-audience genres', () => {
        const candidates = eligibleHomeHeroCandidates(
            [
                {
                    anilistId: 1,
                    averageScore: 90,
                    trendingRank: 1,
                    popularity: 3_500_000,
                    favourites: 100_000,
                    seasonYear: 1999,
                    genres: ['Action', 'Adventure'],
                    hasPrequel: false,
                },
                {
                    anilistId: 2,
                    averageScore: 70,
                    trendingRank: 2,
                    popularity: 80_000,
                    favourites: 2_000,
                    seasonYear: 2026,
                    genres: ['Romance'],
                    hasPrequel: false,
                },
                {
                    anilistId: 3,
                    averageScore: 81,
                    trendingRank: 5,
                    popularity: 36_000,
                    favourites: 1_000,
                    seasonYear: 2026,
                    genres: ['Comedy'],
                    hasPrequel: true,
                },
                {
                    anilistId: 4,
                    averageScore: 82,
                    trendingRank: 18,
                    popularity: 27_000,
                    favourites: 400,
                    seasonYear: 2026,
                    genres: ['Drama'],
                    hasPrequel: false,
                },
                {
                    anilistId: 5,
                    averageScore: 78,
                    trendingRank: 20,
                    popularity: 60_000,
                    favourites: 1_000,
                    seasonYear: 2026,
                    genres: ['Music'],
                    hasPrequel: false,
                },
                {
                    anilistId: 6,
                    averageScore: 83,
                    trendingRank: 31,
                    popularity: 100_000,
                    favourites: 2_000,
                    seasonYear: 2026,
                    genres: ['Action'],
                    hasPrequel: false,
                },
                {
                    anilistId: 7,
                    averageScore: 84,
                    trendingRank: 9,
                    popularity: 51_000,
                    favourites: 700,
                    seasonYear: 2026,
                    genres: ['Romance', 'Slice of Life'],
                    hasPrequel: true,
                },
                {
                    anilistId: 8,
                    averageScore: 75,
                    trendingRank: 11,
                    popularity: 50_000,
                    favourites: 500,
                    seasonYear: 2026,
                    genres: ['Adventure', 'Romance'],
                    hasPrequel: false,
                },
            ].map((candidate) => ({ ...candidate, format: 'TV' as const, duration: 24 })),
            new Date('2026-08-11T00:00:00Z')
        );

        expect(candidates.map(({ anilistId }) => anilistId)).toEqual([7, 4]);
    });

    test('replaces ordinary titles with the highest-trending anime not shown recently', () => {
        const rotated = rotatedHomeHeroCandidates(
            Array.from({ length: 24 }, (_, index) => ({
                anilistId: index + 1,
                averageScore: 75,
                trendingRank: index + 1,
            })),
            [3, 8, 15, 18, 20, 22],
            [3, 8, 15, 18, 20, 22, 6, 7, 9, 10, 16, 17]
        );

        expect(rotated.slice(0, 6).map(({ anilistId }) => anilistId)).toEqual([3, 8, 1, 2, 4, 5]);
    });

    test('retains at most two exceptional previous titles', () => {
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
});
