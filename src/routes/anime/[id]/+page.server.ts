import { error } from '@sveltejs/kit';
import { Effect, Either } from 'effect';

import { anime } from '$lib/server/anime';
import { toAnimeDetails } from '$lib/server/anime/details';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
    const id = Number(params.id);

    if (!Number.isSafeInteger(id) || id <= 0) error(400, 'Invalid anime ID');

    const result = await Effect.runPromise(
        anime.anilist.getAnime(id).pipe(Effect.either),
    );

    if (Either.isLeft(result)) error(502, result.left.message);

    try {
        const artwork = await anime.tmdb.getArtwork(result.right);

        return {
            anime: toAnimeDetails(result.right),
            artwork,
        };
    } catch {
        return {
            anime: toAnimeDetails(result.right),
            artwork: {
                backdrops: [],
                logos: [],
                selectedBackdrop: null,
                selectedLogo: null,
                logoHidden: false,
                logoSize: 100,
            },
        };
    }
};
