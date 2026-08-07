import { error } from '@sveltejs/kit';
import { Effect, Either } from 'effect';

import { anilist } from './anilist';

export function animeId(value: FormDataEntryValue | string | null | undefined) {
  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function loadAnime(id: number) {
  const result = await Effect.runPromise(anilist.getAnime(id).pipe(Effect.either));

  if (Either.isLeft(result)) {
    error(
      result.left.status === 404 ? 404 : 502,
      result.left.status === 404
        ? 'This anime is no longer available on AniList'
        : result.left.message
    );
  }

  return result.right;
}
