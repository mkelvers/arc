import { describe, expect, test } from 'bun:test';

import type { BrowseCatalogEntry } from '@arc/core/catalog/browse-types';
import { popularCatalogPages } from '@arc/core/catalog/browse-pagination';

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
    test('deduplicates pages and preserves stable order', () => {
        const entries = [
            entry(3, 100, 'Same popularity'),
            entry(1, 100, 'Same popularity'),
            entry(2, 90),
            entry(1, 100, 'Duplicate from a later upstream page'),
        ];

        expect(popularCatalogPages(entries)).toEqual([[entries[1], entries[0], entries[2]]]);
    });

    test('creates a second page only when more than 42 entries exist', () => {
        const entries = Array.from({ length: 43 }, (_, index) => entry(index + 1, 43 - index));
        const pages = popularCatalogPages(entries);

        expect(pages).toHaveLength(2);
        expect(pages[0]).toHaveLength(42);
        expect(pages[1]).toHaveLength(1);
    });
});
