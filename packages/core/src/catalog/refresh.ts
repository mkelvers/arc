import type { BrowseFilters } from './browse-filters';
import type { BrowseCatalogEntry } from './browse-types';
import { popularCatalogPages } from './browse-pagination';
import { catalogSnapshotKey, refreshCatalogPage } from './storage';

export async function refreshPopularCatalog<Filters extends Omit<BrowseFilters, 'audio'>>(
    filters: Filters,
    fetchPage: (
        filters: Filters,
        page: number,
        perPage: number,
        forceRefresh: boolean
    ) => Promise<{
        anime: BrowseCatalogEntry[];
        hasNextPage: boolean;
    }>,
    refreshedAt = new Date()
) {
    const entries: BrowseCatalogEntry[] = [];
    for (let page = 1; ; page += 1) {
        const result = await fetchPage(filters, page, 42, true);
        entries.push(...result.anime);
        if (!result.hasNextPage) {
            break;
        }
    }

    const pages = popularCatalogPages(entries);
    for (const [index, page] of pages.entries()) {
        await refreshCatalogPage(
            catalogSnapshotKey(filters, index + 1),
            page,
            index < pages.length - 1,
            refreshedAt
        );
    }

    if (!pages.length) {
        await refreshCatalogPage(catalogSnapshotKey(filters, 1), [], false, refreshedAt);
    }

    return {
        animeIds: pages[0]?.map(({ anilistId }) => anilistId) ?? [],
        hasNextPage: pages.length > 1,
    };
}
