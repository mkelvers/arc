import type { BrowseCatalogEntry } from './anilist/browse';

const catalogPageSize = 42;

export function popularCatalogPages(entries: BrowseCatalogEntry[]) {
    const unique = new Map<number, BrowseCatalogEntry>();
    for (const entry of entries) {
        if (!unique.has(entry.anilistId)) {
            unique.set(entry.anilistId, entry);
        }
    }

    const ordered = [...unique.values()].toSorted(
        (left, right) =>
            (right.popularity ?? -1) - (left.popularity ?? -1) ||
            left.title.localeCompare(right.title, 'en') ||
            left.anilistId - right.anilistId
    );
    const pages: BrowseCatalogEntry[][] = [];
    for (let offset = 0; offset < ordered.length; offset += catalogPageSize) {
        pages.push(ordered.slice(offset, offset + catalogPageSize));
    }

    return pages;
}
