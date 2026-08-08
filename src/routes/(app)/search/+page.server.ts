import { error } from '@sveltejs/kit';
import { Effect, Either } from 'effect';

import { anime } from '$lib/server/anime';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const query = url.searchParams.get('q')?.trim() ?? '';
  if (query.length > 200) {
    error(400, 'Search queries cannot exceed 200 characters');
  }

  if (query.length < 2) {
    return { pageTitle: 'Search anime', query, results: [] };
  }

  const result = await Effect.runPromise(anime.anilist.searchAnime(query).pipe(Effect.either));
  if (Either.isLeft(result)) {
    error(502, result.left.message);
  }

  return {
    pageTitle: 'Search anime',
    query,
    results: await anime.withAnimeSearchMetadata(await anime.withAnimeCardPosters(result.right)),
  };
};
