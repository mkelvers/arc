import { describe, expect, test } from 'bun:test';

import type { BrowseCatalogEntry } from './anilist/browse';
import { popularCatalogPages } from './catalog-pagination';

function entry(anilistId: number, popularity: number, title = `Anime ${anilistId}`) {
    return {
        anilistId,
        title,
        searchText: title,
        imageUrl: `https://images.example/${anilistId}.jpg`,
        synopsis: '',
        genres: [],
        tags: [],
        format: 'TV',
        status: 'FINISHED',
        source: null,
        season: null,
        seasonYear: null,
        countryOfOrigin: 'JP',
        isAdult: false,
        popularity,
        duration: 24,
        averageScore: 80,
    } satisfies BrowseCatalogEntry;
}

describe('popular catalog snapshots', () => {
    test('deduplicates pages, preserves stable order, and marks only non-final pages', () => {
        const entries = [
            entry(3, 100, 'Same popularity'),
            entry(1, 100, 'Same popularity'),
            entry(2, 90),
            entry(1, 100, 'Duplicate from a later upstream page'),
        ];

        expect(popularCatalogPages(entries)).toEqual([[entries[1], entries[0], entries[2]]]);
    });

    test('creates a second page only when more than one page is materialized', () => {
        const entries = Array.from({ length: 43 }, (_, index) => entry(index + 1, 43 - index));

        const pages = popularCatalogPages(entries);

        expect(pages).toHaveLength(2);
        expect(pages[0]).toHaveLength(42);
        expect(pages[1]).toHaveLength(1);
        expect(pages[1]?.[0]?.anilistId).toBe(43);
    });
});
