import { error, json } from '@sveltejs/kit';

import { searchAnime } from '$lib/server/anime/anilist/search';
import { withAnimeCardPosters } from '$lib/server/anime/card-posters';
import { withAnimeSearchMetadata } from '$lib/server/anime/search-enrichment';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get('q')?.trim() ?? '';
  if (query.length > 200) {
    error(400, 'Search queries cannot exceed 200 characters');
  }
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

  return json(await withAnimeSearchMetadata(await withAnimeCardPosters(results)));
};
