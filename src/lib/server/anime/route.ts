import { error } from '@sveltejs/kit';

import { GraphQLRequestError } from '$lib/server/graphql';
import { getAnime } from './anilist/details';

export function animeId(value: FormDataEntryValue | string | null | undefined) {
  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function loadAnime(id: number) {
  try {
    return await getAnime(id);
  } catch (cause) {
    error(
      cause instanceof GraphQLRequestError && cause.status === 404 ? 404 : 502,
      cause instanceof GraphQLRequestError && cause.status === 404
        ? 'This anime is no longer available on AniList'
        : cause instanceof Error
          ? cause.message
          : 'Anime details could not be loaded'
    );
  }
}
