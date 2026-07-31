import { Effect } from 'effect';

import {
    HomeAnimeDocument,
    type MediaSeason,
} from '$lib/graphql/anilist/generated/graphql';
import { GraphQLRequestError } from '$lib/server/graphql';
import { RequestCache } from '$lib/server/request-cache';
import { request } from './client';
import { animeCard, homepageHighlight } from './models';
import { present } from './text';
import type { HomepageAnime } from './types';

const lifetime = 30 * 60 * 1_000;
const cache = new RequestCache<string, HomepageAnime>(lifetime);

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
    return cache.get(key, () => requestHomepage(season, seasonYear));
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
