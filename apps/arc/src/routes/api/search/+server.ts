import { error, json } from '@sveltejs/kit';

import { parseSearchQuery, searchAnime } from '$lib/server/anime/anilist/search';
import { enrichAnimeCards } from '@arc/backend/internal/anime/card-enrichment';
import { withAnimeSearchMetadata } from '@arc/backend/internal/anime/search-enrichment';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
    const query = parseSearchQuery(url.searchParams.get('q'));
    if (query.length < 2) {
        return json([]);
    }

    let results;
    try {
        results = await searchAnime(query);
    } catch (cause) {
        console.error(`Anime search for ${JSON.stringify(query)} failed`, cause);
        error(502, 'Anime search could not be loaded');
    }

    return json(await withAnimeSearchMetadata(await enrichAnimeCards(results)));
};
