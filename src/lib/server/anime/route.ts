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
        if (cause instanceof GraphQLRequestError && cause.status === 404) {
            error(404, 'This anime is no longer available on AniList');
        }

        console.error(`AniList anime ${id} load failed`, cause);
        error(502, 'Anime details could not be loaded');
    }
}
