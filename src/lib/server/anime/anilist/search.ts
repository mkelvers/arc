import { Effect } from 'effect';

import type { AnimeCard } from '$lib/anime/types';
import { SearchAnimePageDocument } from '$lib/graphql/anilist/generated/graphql';
import { GraphQLRequestError } from '$lib/server/graphql';
import { RequestCache } from '$lib/server/request-cache';
import { request } from './client';
import { animeCard } from './models';
import { present } from './text';

const lifetime = 5 * 60 * 1_000;
const cache = new RequestCache<string, AnimeCard[]>(lifetime);

async function requestSearch(search: string) {
    const response = await Effect.runPromise(
        request(SearchAnimePageDocument, {
            search,
            page: 1,
            perPage: 50,
        }),
    );

    return present(response.Page?.media).flatMap((entry) => {
        const card = animeCard(entry);
        return card ? [card] : [];
    });
}

async function cached(search: string) {
    const key = search.trim().toLocaleLowerCase('en');
    if (!key) {
        return [];
    }

    return cache.get(key, () => requestSearch(search.trim()));
}

export function searchAnime(search: string) {
    return Effect.tryPromise({
        try: () => cached(search),
        catch: (cause) =>
            cause instanceof GraphQLRequestError
                ? cause
                : new GraphQLRequestError({
                      message: 'Anime search could not be loaded',
                      cause,
                  }),
    });
}
