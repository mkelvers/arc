import { error } from '@sveltejs/kit';

import { searchAnime } from '$lib/server/anime/anilist/search';
import { withAnimeCardPosters } from '$lib/server/anime/card-posters';
import { withAnimeSearchMetadata } from '$lib/server/anime/search-enrichment';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const query = url.searchParams.get('q')?.trim() ?? '';
  if (query.length > 200) {
    error(400, 'Search queries cannot exceed 200 characters');
  }

  if (query.length < 2) {
    return { pageTitle: 'Search anime', query, results: [] };
  }

  const results = await searchAnime(query).catch((cause) =>
    error(502, cause instanceof Error ? cause.message : 'Anime search could not be loaded')
  );

  return {
    pageTitle: 'Search anime',
    query,
    results: await withAnimeSearchMetadata(await withAnimeCardPosters(results)),
  };
};
