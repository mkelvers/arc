import { Effect } from 'effect';

import type { AnimeCard } from '$lib/anime/types';
import { SearchAnimePageDocument } from '$lib/graphql/anilist/generated/graphql';
import { GraphQLRequestError } from '$lib/server/graphql';
import { request } from './client';
import { animeCard } from './models';
import { present } from './text';

const lifetime = 5 * 60 * 1_000;
const cache = new Map<string, { data: AnimeCard[]; fetchedAt: number }>();
const requests = new Map<string, Promise<AnimeCard[]>>();

async function requestSearch(search: string) {
    const results: AnimeCard[] = [];
    let page = 1;
    let hasNextPage = true;

    while (hasNextPage) {
        const response = await Effect.runPromise(
            request(SearchAnimePageDocument, {
                search,
                page,
                perPage: 50,
            }),
        );
        const media = present(response.Page?.media);

        results.push(
            ...media.flatMap((entry) => {
                const card = animeCard(entry);
                return card ? [card] : [];
            }),
        );

        hasNextPage = response.Page?.pageInfo?.hasNextPage === true;
        page += 1;
    }

    return results;
}

async function cached(search: string) {
    const key = search.trim().toLocaleLowerCase('en');
    if (!key) {
        return [];
    }

    const stored = cache.get(key);
    if (stored && Date.now() - stored.fetchedAt < lifetime) {
        return stored.data;
    }

    const pending = requests.get(key);
    if (pending) {
        return pending;
    }

    const request = requestSearch(search.trim()).then((data) => {
        cache.set(key, { data, fetchedAt: Date.now() });
        return data;
    });
    requests.set(key, request);

    try {
        return await request;
    } finally {
        requests.delete(key);
    }
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
