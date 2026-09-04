import { db } from '@arc/shared/db';

import type { AnimeSearchResult } from '../search';
import { rankAnimeSearch } from '../search';
import { createAnimeSearchIndex } from './search-index';
import type { CatalogSource } from './source';

export function createSearchOperation(source: CatalogSource) {
    const searchIndex = createAnimeSearchIndex(db);

    return async function getSearchResults(query: string) {
        const normalized = query.trim();
        if (!normalized) {
            return [];
        }

        let results = await searchIndex.find(normalized);
        if (!results.length) {
            results = rankAnimeSearch(normalized, await source.search(normalized));
            await searchIndex.store(results);
        }
        return source.enrichSearchMetadata<AnimeSearchResult>(
            await source.enrichAnimeCards<AnimeSearchResult>(results)
        );
    };
}
