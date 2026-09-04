import { db } from '@arc/shared/db';

import type { AnimeSearchResult } from '../search';
import { rankAnimeSearch } from '../search';
import { createAnimeSearchIndex } from './search-index';
import type { CatalogSource } from './source';

export function createSearchOperation(source: CatalogSource) {
    const searchIndex = createAnimeSearchIndex(db);

    async function searchAnime(query: string) {
        const key = query.trim().toLocaleLowerCase('en');
        if (!key) {
            return [];
        }
        const stored = await searchIndex.find(query);
        if (stored.length) {
            return stored;
        }
        const results = rankAnimeSearch(query, await source.search(query.trim()));
        await searchIndex.store(results);
        return results;
    }

    return async function getSearchResults(query: string) {
        return source.enrichSearchMetadata<AnimeSearchResult>(
            await source.enrichAnimeCards<AnimeSearchResult>(await searchAnime(query))
        );
    };
}
