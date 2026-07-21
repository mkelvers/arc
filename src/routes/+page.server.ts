import { error } from '@sveltejs/kit';
import { Effect, Either } from 'effect';

import { anilist } from '$lib/server/anime';
import { toAnimeDetails } from '$lib/server/anime/details';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
    const anime = await Effect.runPromise(
        anilist.getAnime(20464).pipe(
            Effect.map(toAnimeDetails),
            Effect.either,
        ),
    );

    if (Either.isLeft(anime)) {
        error(502, anime.left.message);
    }

    return {
        anime: anime.right
    };
};
