import { error } from '@sveltejs/kit';

import { rankAnimeSearch, type AnimeSearchResult } from '$lib/anime/search';
import { SearchAnimePageDocument } from '$lib/graphql/anilist/generated/graphql';
import { db } from '$lib/server/db';
import { RequestCache } from '$lib/server/request-cache';
import { createAnimeSearchIndex } from '$lib/server/anime/search-index';
import { request } from './client';
import { animeCard } from './models';
import { animeTitles, present } from './text';

const cache = new RequestCache<string, AnimeSearchResult[]>(5 * 60 * 1_000);
const searchIndex = createAnimeSearchIndex(db);

export function parseSearchQuery(value: string | null) {
    const query = value?.trim() ?? '';
    if (query.length > 200) {
        error(400, 'Search queries cannot exceed 200 characters');
    }

    return query;
}

async function requestSearch(search: string) {
    const response = await request(
        SearchAnimePageDocument,
        {
            search,
            page: 1,
            perPage: 50,
        },
        { cacheForMs: 6 * 60 * 60 * 1_000 }
    );

    const results = present(response.Page?.media).flatMap((entry) => {
        const card = animeCard(entry);
        if (!card) {
            return [];
        }

        const titles = animeTitles(entry);
        const relatedIds = present(entry.relations?.edges).flatMap((edge) =>
            (edge?.relationType === 'PREQUEL' || edge?.relationType === 'SEQUEL') && edge.node
                ? [edge.node.id]
                : []
        );

        return [
            {
                ...card,
                titles,
                format: entry.format ?? null,
                popularity: entry.popularity ?? 0,
                backdrop: null,
                artworkGroup: null,
                relatedIds,
            },
        ];
    });

    const ranked = rankAnimeSearch(search, results);
    await searchIndex.store(ranked);

    return ranked;
}

export async function searchAnime(search: string) {
    const key = search.trim().toLocaleLowerCase('en');
    if (!key) {
        return [];
    }

    return cache.get(key, async () => {
        const stored = await searchIndex.find(search);
        return stored.length ? stored : requestSearch(search.trim());
    });
}
