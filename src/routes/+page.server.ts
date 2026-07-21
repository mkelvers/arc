import { error } from '@sveltejs/kit';
import { Effect, Either } from 'effect';

import { anime } from '$lib/server/anime';
import { toAnimeDetails } from '$lib/server/anime/details';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
    const result = await Effect.runPromise(
        anime.anilist.getAnime(20464).pipe(
            Effect.map(toAnimeDetails),
            Effect.either,
        ),
    );

    if (Either.isLeft(result)) {
        error(502, result.left.message);
    }

    return {
        anime: result.right
    };
};
