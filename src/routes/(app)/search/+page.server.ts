import { error } from '@sveltejs/kit';

import { parseSearchQuery, searchAnime } from '$lib/server/anime/anilist/search';
import { enrichAnimeCards } from '$lib/server/anime/card-enrichment';
import { withAnimeSearchMetadata } from '$lib/server/anime/search-enrichment';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
    const query = parseSearchQuery(url.searchParams.get('q'));

    if (query.length < 2) {
        return { pageTitle: 'Search anime', query, results: [] };
    }

    const results = await searchAnime(query).catch((cause) => {
        console.error(`Anime search for ${JSON.stringify(query)} failed`, cause);
        error(502, 'Anime search could not be loaded');
    });

    return {
        pageTitle: 'Search anime',
        query,
        results: await withAnimeSearchMetadata(await enrichAnimeCards(results)),
    };
};
