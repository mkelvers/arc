import { describe, expect, test } from 'bun:test';

import { AniListAnimeSchema } from './types';

const legacyRelease = {
    id: 1,
    idMal: null,
    title: {
        english: 'Release',
        romaji: null,
        native: null,
    },
    synonyms: [],
    bannerImage: null,
    description: null,
    genres: [],
    format: 'TV',
    status: 'FINISHED',
    season: null,
    seasonYear: null,
    startDate: null,
    endDate: null,
    episodes: 12,
    duration: 24,
    nextAiringEpisode: null,
    relations: {
        edges: [],
    },
    averageScore: null,
    popularity: null,
    favourites: null,
    rankings: [],
    tags: [],
    studios: {
        nodes: [],
    },
    staff: {
        edges: [],
    },
};

describe('permanent AniList release validation', () => {
    test('accepts usable legacy details that predate persisted cover images', () => {
        const parsed = AniListAnimeSchema.parse(legacyRelease);
        expect(parsed.coverImage).toBeNull();
    });

    test('rejects a partial card as full release metadata', () => {
        expect(AniListAnimeSchema.safeParse({ id: 1, title: legacyRelease.title }).success).toBe(
            false
        );
    });
});
