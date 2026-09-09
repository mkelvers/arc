import { describe, expect, test } from 'bun:test';

import type { AniListAnime } from '../../../packages/core/src/catalog/anilist-types';
import {
    mergeAnimeReleaseSnapshots,
    relationSnapshotProvider,
} from '../../../packages/core/src/catalog/anime-release-merge';

function anime(data: Partial<AniListAnime>) {
    return data as AniListAnime;
}

function snapshot(provider: string, data: Partial<AniListAnime>, sourceFetchedAt: string) {
    return {
        provider,
        data: anime(data),
        sourceFetchedAt: new Date(sourceFetchedAt),
    };
}

describe('anime release source merging', () => {
    test('keeps AniList authoritative while filling missing fields from Kitsu', () => {
        const result = mergeAnimeReleaseSnapshots([
            snapshot(
                'kitsu',
                {
                    id: 42,
                    title: { english: 'Kitsu title', romaji: 'Kitsu title', native: null },
                    genres: ['Drama'],
                    averageScore: 82,
                    nextAiringEpisode: { episode: 99, airingAt: 1900000000 },
                    metadataSource: 'kitsu',
                    metadataSourceId: 100,
                },
                '2026-09-09T10:00:00Z'
            ),
            snapshot(
                'anilist',
                {
                    id: 42,
                    title: { english: 'AniList title', romaji: null, native: 'アニメ' },
                    genres: [],
                    averageScore: null,
                    nextAiringEpisode: { episode: 4, airingAt: 1800000000 },
                },
                '2026-09-01T10:00:00Z'
            ),
        ]);

        expect(result).toMatchObject({
            id: 42,
            title: { english: 'AniList title', romaji: 'Kitsu title', native: 'アニメ' },
            genres: ['Drama'],
            averageScore: 82,
            nextAiringEpisode: { episode: 4, airingAt: 1800000000 },
            metadataFieldSources: {
                genres: 'kitsu',
                averageScore: 'kitsu',
            },
        });
        expect(result?.metadataSource).toBeUndefined();
    });

    test('supports a new fallback provider without changing the merge contract', () => {
        const result = mergeAnimeReleaseSnapshots([
            snapshot(
                'jikan',
                { id: 42, description: 'Stored description', metadataSource: 'jikan' },
                '2026-09-09T10:00:00Z'
            ),
        ]);

        expect(result).toMatchObject({
            id: 42,
            description: 'Stored description',
            metadataSource: 'jikan',
        });
    });

    test('uses the provider that supplied the effective relation set', () => {
        expect(
            relationSnapshotProvider([
                snapshot('kitsu', { id: 42, relations: { edges: [] } }, '2026-09-09T10:00:00Z'),
                snapshot(
                    'anilist',
                    {
                        id: 42,
                        relations: {
                            edges: [
                                {
                                    relationType: 'SEQUEL',
                                    node: {
                                        id: 43,
                                        idMal: null,
                                        episodes: null,
                                        type: 'ANIME',
                                        format: null,
                                        title: null,
                                    },
                                },
                            ],
                        },
                    },
                    '2026-09-01T10:00:00Z'
                ),
            ])
        ).toBe('anilist');
    });

    test('records fallback provenance when the primary relation object is missing', () => {
        const result = mergeAnimeReleaseSnapshots([
            snapshot('anilist', { id: 42, relations: null }, '2026-09-01T10:00:00Z'),
            snapshot(
                'kitsu',
                {
                    id: 42,
                    relations: {
                        edges: [
                            {
                                relationType: 'SEQUEL',
                                node: {
                                    id: 43,
                                    idMal: null,
                                    episodes: null,
                                    type: 'ANIME',
                                    format: null,
                                    title: null,
                                },
                            },
                        ],
                    },
                },
                '2026-09-09T10:00:00Z'
            ),
        ]);

        expect(result?.metadataFieldSources?.relations).toBe('kitsu');
    });

    test('records fallback provenance for isAdult', () => {
        const result = mergeAnimeReleaseSnapshots([
            snapshot('anilist', { id: 42, isAdult: undefined }, '2026-09-01T10:00:00Z'),
            snapshot('kitsu', { id: 42, isAdult: true }, '2026-09-09T10:00:00Z'),
        ]);

        expect(result).toMatchObject({
            isAdult: true,
            metadataFieldSources: { isAdult: 'kitsu' },
        });
    });
});
