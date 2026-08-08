import { error, json } from '@sveltejs/kit';
import { Effect, Either } from 'effect';

import { anime } from '$lib/server/anime';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get('q')?.trim() ?? '';
  if (query.length > 200) {
    error(400, 'Search queries cannot exceed 200 characters');
  }
  if (query.length < 2) {
    return json([]);
  }

  const result = await Effect.runPromise(anime.anilist.searchAnime(query).pipe(Effect.either));
  if (Either.isLeft(result)) {
    console.error(`Anime search for ${JSON.stringify(query)} failed`, result.left);
    error(502, 'Anime search could not be loaded');
  }

  return json(await anime.withAnimeSearchMetadata(await anime.withAnimeCardPosters(result.right)));
};
