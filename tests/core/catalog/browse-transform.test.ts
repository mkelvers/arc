import { describe, expect, test } from 'bun:test';

import type {
    BrowseAnimePageQuery,
    BrowseAnimeTaxonomyQuery,
} from '@arc/shared/graphql/generated/graphql';
import {
    transformBrowseEntries,
    transformBrowseTaxonomy,
} from '@arc/core/catalog/browse-transform';

describe('AniList browse transformation', () => {
    test('filters undiscoverable media and shapes catalog entries', () => {
        const response = {
            Page: {
                pageInfo: { hasNextPage: false },
                media: [
                    {
                        id: 42,
                        synonyms: ['Alias', null],
                        description: '<b>Story</b>',
                        genres: ['Action', null],
                        format: 'TV',
                        status: 'FINISHED',
                        source: 'ORIGINAL',
                        season: 'SPRING',
                        seasonYear: 2024,
                        countryOfOrigin: 'JP',
                        isAdult: false,
                        averageScore: 80,
                        popularity: 3_000,
                        duration: 24,
                        title: {
                            english: 'Title',
                            romaji: 'Title',
                            native: '題名',
                        },
                        coverImage: {
                            extraLarge: 'https://image.test/title.jpg',
                            large: null,
                        },
                        tags: [{ name: 'Adventure' }, null],
                    },
                    null,
                    {
                        id: 43,
                        synonyms: [],
                        description: null,
                        genres: [],
                        format: 'TV',
                        status: 'FINISHED',
                        source: 'ORIGINAL',
                        season: 'SPRING',
                        seasonYear: 2024,
                        countryOfOrigin: 'JP',
                        isAdult: false,
                        averageScore: 50,
                        popularity: 1_999,
                        duration: 24,
                        title: { english: 'Hidden', romaji: null, native: null },
                        coverImage: { extraLarge: 'https://image.test/hidden.jpg', large: null },
                        tags: [],
                    },
                ],
            },
        } satisfies BrowseAnimePageQuery;

        expect(transformBrowseEntries(response.Page.media!)).toEqual([
            {
                anilistId: 42,
                title: 'Title',
                searchText: 'Title\n題名\nAlias',
                imageUrl: 'https://image.test/title.jpg',
                synopsis: 'Story',
                genres: ['Action'],
                tags: ['Adventure'],
                format: 'TV',
                status: 'FINISHED',
                source: 'ORIGINAL',
                season: 'SPRING',
                seasonYear: 2024,
                countryOfOrigin: 'JP',
                isAdult: false,
                popularity: 3_000,
                duration: 24,
                averageScore: 80,
            },
        ]);
    });

    test('sorts unique safe taxonomy values', () => {
        const response = {
            GenreCollection: ['Drama', 'Action', 'Drama', null],
            tags: [
                { name: 'Drama', isAdult: false },
                { name: 'Adult', isAdult: true },
                { name: 'Drama', isAdult: false },
                null,
            ],
            formats: { enumValues: [{ name: 'TV' }, { name: 'MOVIE' }] },
            statuses: { enumValues: [{ name: 'FINISHED' }] },
            sources: { enumValues: [{ name: 'ORIGINAL' }] },
            seasons: { enumValues: [{ name: 'SPRING' }] },
        } satisfies BrowseAnimeTaxonomyQuery;

        expect(transformBrowseTaxonomy(response)).toEqual({
            genres: ['Action', 'Drama'],
            tags: ['Drama'],
            formats: ['TV', 'MOVIE'],
            statuses: ['FINISHED'],
            sources: ['ORIGINAL'],
            seasons: ['SPRING'],
        });
    });
});
