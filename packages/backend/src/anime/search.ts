import { rankAnimeSearch } from '@arc/shared/search';
import { SearchAnimePageDocument } from '@arc/shared/anilist/generated/graphql';
import { db } from '@arc/db';
import { request } from './anilist/client';
import { animeCard } from './anilist/models';
import { animeTitles, present } from '@arc/core/catalog/anilist-text';
import { createAnimeSearchIndex } from './search-index';
import { enrichAnimeCards } from './card-enrichment';
import { withAnimeSearchMetadata } from './search-enrichment';

const searchIndex = createAnimeSearchIndex(db);

async function requestSearch(search: string) {
    const response = await request(
        SearchAnimePageDocument,
        { search, page: 1, perPage: 50 },
        { refreshAfterMs: 24 * 60 * 60 * 1_000 }
    );
    const results = present(response.Page?.media).flatMap((entry) => {
        const card = animeCard(entry);
        if (!card) {
            return [];
        }

        return [
            {
                ...card,
                titles: animeTitles(entry),
                format: entry.format ?? null,
                popularity: entry.popularity ?? 0,
                backdrop: null,
                artworkGroup: null,
                relatedIds: present(entry.relations?.edges).flatMap((edge) =>
                    (edge?.relationType === 'PREQUEL' || edge?.relationType === 'SEQUEL') &&
                    edge.node
                        ? [edge.node.id]
                        : []
                ),
            },
        ];
    });
    const ranked = rankAnimeSearch(search, results);
    await searchIndex.store(ranked);
    return ranked;
}

async function searchAnime(search: string) {
    const key = search.trim().toLocaleLowerCase('en');
    if (!key) {
        return [];
    }

    const stored = await searchIndex.find(search);
    if (stored.length) {
        return stored;
    }

    // Search is explicit user intent; only a local miss may ingest from AniList.
    return requestSearch(search.trim());
}

export async function getSearchResults(search: string) {
    return withAnimeSearchMetadata(await enrichAnimeCards(await searchAnime(search)));
}
