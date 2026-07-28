import { Effect } from 'effect';

import type { AnimeCard } from '$lib/anime/types';
import { WatchlistAnimeDocument } from '$lib/graphql/anilist/generated/graphql';
import { GraphQLRequestError } from '$lib/server/graphql';
import { request } from './client';
import { animeCard } from './models';
import { present } from './text';

const pageSize = 50;
const lifetime = 5 * 60 * 1_000;
const cache = new Map<string, { data: AnimeCard[]; fetchedAt: number }>();
const requests = new Map<string, Promise<AnimeCard[]>>();

function pages(ids: number[]) {
    return Array.from(
        { length: Math.ceil(ids.length / pageSize) },
        (_, index) => ids.slice(index * pageSize, (index + 1) * pageSize),
    );
}

async function requestWatchlist(ids: number[]) {
    const responses = await Promise.all(
        pages(ids).map((page) =>
            Effect.runPromise(request(WatchlistAnimeDocument, { ids: page })),
        ),
    );
    const byId = new Map(
        responses
            .flatMap(({ Page }) => present(Page?.media))
            .flatMap((entry) => {
                const card = animeCard(entry);
                return card ? [[card.id, card] as const] : [];
            }),
    );

    return ids.flatMap((id) => {
        const card = byId.get(id);
        return card ? [card] : [];
    });
}

async function cached(ids: number[]) {
    if (!ids.length) {
        return [];
    }

    const key = ids.join(',');
    const stored = cache.get(key);
    if (stored && Date.now() - stored.fetchedAt < lifetime) {
        return stored.data;
    }

    const pending = requests.get(key);
    if (pending) {
        return pending;
    }

    const pendingRequest = requestWatchlist(ids).then((data) => {
        cache.set(key, { data, fetchedAt: Date.now() });
        return data;
    });
    requests.set(key, pendingRequest);

    try {
        return await pendingRequest;
    } finally {
        requests.delete(key);
    }
}

export function getWatchlistAnime(ids: number[]) {
    return Effect.tryPromise({
        try: () => cached(ids),
        catch: (cause) =>
            cause instanceof GraphQLRequestError
                ? cause
                : new GraphQLRequestError({
                      message: 'Watchlist anime could not be loaded',
                      cause,
                  }),
    });
}
