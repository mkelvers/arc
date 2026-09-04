import { describe, expect, test } from 'bun:test';

import type { AnimeSearchResult } from '@arc/core/browser';
import {
    distinctSearchArtwork,
    inferSearchArtwork,
    rankAnimeSearch,
    searchRelevance,
} from '@arc/core/browser';

const result = (title: string, popularity: number): AnimeSearchResult => ({
    id: popularity,
    href: `/anime/${popularity}`,
    link: `/anime/${popularity}`,
    title,
    titles: [title],
    image: 'https://example.com/poster.jpg',
    audioLabel: '',
    score: 0,
    genres: [],
    synopsis: '',
    format: 'TV',
    popularity,
    backdrop: null,
    artworkGroup: null,
    relatedIds: [],
});

describe('searchRelevance', () => {
    test('normalizes punctuation, capitalization, and zero spelling', () => {
        expect(searchRelevance('re 0', ['Re:ZERO -Starting Life in Another World-'])).toBe(880);
    });

    test('matches alternate titles and acronyms', () => {
        expect(
            searchRelevance('tensei', ['That Time I Got Reincarnated as a Slime', 'Tensei Shitara'])
        ).toBe(880);
        expect(searchRelevance('aot', ['Attack on Titan'])).toBe(840);
    });

    test('tolerates a missing character but not a different word', () => {
        expect(searchRelevance('horimya', ['Horimiya'])).toBe(560);
        expect(searchRelevance('slime', ['The Adventures of Slaim'])).toBe(0);
    });
});

describe('rankAnimeSearch', () => {
    test('uses popularity to resolve a short generic title', () => {
        const exact = result('Slime', 1);
        const popular = result('That Time I Got Reincarnated as a Slime', 100_000);

        expect(rankAnimeSearch('slime', [exact, popular])).toEqual([popular, exact]);
    });

    test('ranks a specific exact title ahead of popularity', () => {
        const exact = result('That Time I Got Reincarnated as a Slime', 1);
        const popular = result(
            'That Time I Got Reincarnated as a Slime: Visions of Coleus',
            100_000
        );

        expect(rankAnimeSearch(exact.title, [popular, exact])).toEqual([exact, popular]);
    });
});

describe('distinctSearchArtwork', () => {
    test('keeps only the highest-ranked result for a shared backdrop', () => {
        const first = {
            ...result('First season', 100),
            backdrop: 'https://example.com/shared.jpg',
        };
        const second = {
            ...result('Second season', 90),
            backdrop: 'https://example.com/shared.jpg',
        };
        const distinct = { ...result('Movie', 80), backdrop: 'https://example.com/movie.jpg' };

        expect(distinctSearchArtwork([first, second, distinct], 4)).toEqual([first, distinct]);
    });

    test('deduplicates a release that inherited a mapped artwork group', () => {
        const first = { ...result('First season', 100), artworkGroup: 'tmdb:tv:123' };
        const third = { ...result('Third season', 90), artworkGroup: 'tmdb:tv:123' };

        expect(distinctSearchArtwork([first, third], 4)).toEqual([first]);
    });
});

describe('inferSearchArtwork', () => {
    test('inherits one uniquely related TV mapping without a TMDB request', () => {
        const first = result('First season', 100);
        const third = { ...result('Third season', 90), relatedIds: [first.id] };

        const artwork = inferSearchArtwork(
            [first, third],
            new Map([
                [first.id, { group: 'tmdb:tv:123', backdrop: 'https://example.com/backdrop.jpg' }],
            ])
        );

        expect(artwork.get(third.id)).toEqual({
            group: 'tmdb:tv:123',
            backdrop: 'https://example.com/backdrop.jpg',
        });
    });

    test('does not infer movies or ambiguous TV mappings', () => {
        const movie = { ...result('Movie', 100), format: 'MOVIE', relatedIds: [1] };
        const series = { ...result('Series', 90), relatedIds: [1, 2] };
        const stored = new Map([
            [1, { group: 'tmdb:tv:1', backdrop: null }],
            [2, { group: 'tmdb:tv:2', backdrop: null }],
        ]);

        expect(inferSearchArtwork([movie, series], stored)).toEqual(new Map());
    });
});
