import { Effect } from 'effect';

import {
    HomeAnimeDocument,
    type MediaSeason,
} from '$lib/graphql/anilist/generated/graphql';
import { GraphQLRequestError } from '$lib/server/graphql';
import { request } from './client';
import { animeCard, homepageHighlight } from './models';
import { present } from './text';
import type { HomepageAnime } from './types';

const lifetime = 30 * 60 * 1_000;
const cache = new Map<
    string,
    { data: HomepageAnime; fetchedAt: number }
>();
const requests = new Map<string, Promise<HomepageAnime>>();

async function requestHomepage(
    season: MediaSeason,
    seasonYear: number,
) {
    const response = await Effect.runPromise(
        request(HomeAnimeDocument, { season, seasonYear }),
    );

    return {
        highlights: present(response.highlights?.media)
            .flatMap((entry) => {
                const highlight = homepageHighlight(entry);
                return highlight ? [highlight] : [];
            })
            .slice(0, 5),
        season: present(response.season?.media).flatMap((entry) => {
            const card = animeCard(entry);
            return card ? [card] : [];
        }),
    };
}

async function cached(season: MediaSeason, seasonYear: number) {
    const key = `${season}:${seasonYear}`;
    const stored = cache.get(key);

    if (stored && Date.now() - stored.fetchedAt < lifetime) {
        return stored.data;
    }

    const pending = requests.get(key);
    if (pending) {
        return pending;
    }

    const request = requestHomepage(season, seasonYear).then((data) => {
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

export function getHomepage(
    season: MediaSeason,
    seasonYear: number,
) {
    return Effect.tryPromise({
        try: () => cached(season, seasonYear),
        catch: (cause) =>
            cause instanceof GraphQLRequestError
                ? cause
                : new GraphQLRequestError({
                      message: 'The home page could not be loaded',
                      cause,
                  }),
    });
}
