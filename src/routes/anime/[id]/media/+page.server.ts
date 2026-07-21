import { error, fail } from '@sveltejs/kit';
import { Effect, Either } from 'effect';

import { anime } from '$lib/server/anime';
import { toAnimeDetails } from '$lib/server/anime/details';
import type { Actions, PageServerLoad } from './$types';

function animeId(value: string) {
    const id = Number(value);

    if (!Number.isSafeInteger(id) || id <= 0) error(400, 'Invalid anime ID');

    return id;
}

async function getAnime(id: number) {
    const result = await Effect.runPromise(
        anime.anilist.getAnime(id).pipe(Effect.either),
    );

    if (Either.isLeft(result)) error(502, result.left.message);

    return result.right;
}

export const load: PageServerLoad = async ({ params }) => {
    const result = await getAnime(animeId(params.id));

    try {
        return {
            anime: toAnimeDetails(result),
            artwork: await anime.tmdb.getArtwork(result),
        };
    } catch (cause) {
        error(
            502,
            cause instanceof Error ? cause.message : 'TMDB artwork request failed',
        );
    }
};

export const actions: Actions = {
    default: async ({ params, request }) => {
        const data = await request.formData();
        const type = data.get('type');
        const value = data.get('filePath');

        if (type !== 'backdrop' && type !== 'logo') {
            return fail(400, { message: 'Invalid artwork type' });
        }
        if (typeof value !== 'string') {
            return fail(400, { message: 'Invalid artwork selection' });
        }

        const result = await getAnime(animeId(params.id));

        try {
            await anime.tmdb.selectArtwork(
                result,
                type,
                value === '' ? null : value,
            );
            return { success: true };
        } catch (cause) {
            return fail(400, {
                message:
                    cause instanceof Error ? cause.message : 'Selection failed',
            });
        }
    },
};
