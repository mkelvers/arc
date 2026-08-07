import { Effect, Schedule } from 'effect';

import { HomeAnimeDocument, type MediaSeason } from '$lib/graphql/anilist/generated/graphql';
import { GraphQLRequestError } from '$lib/server/graphql';
import { RequestCache } from '$lib/server/request-cache';
import { request, transientRequestError } from './client';
import { selectPopularAnime } from './home-selection';
import { animeCard } from './models';
import { present } from './text';
import type { HomepageAnime } from './types';

const lifetime = 30 * 60 * 1_000;
const cache = new RequestCache<string, HomepageAnime>(lifetime);

async function requestHomepage(season: MediaSeason, seasonYear: number) {
  const response = await Effect.runPromise(
    request(HomeAnimeDocument, { season, seasonYear }).pipe(
      Effect.retry({
        times: 2,
        schedule: Schedule.exponential('750 millis'),
        while: transientRequestError,
      })
    )
  );

  const cards = (media: NonNullable<typeof response.season>['media'] | undefined) =>
    present(media).flatMap((entry) => {
      const card = animeCard(entry);
      return card ? [card] : [];
    });

  return {
    season: cards(response.season?.media),
    popular: cards(selectPopularAnime(present(response.popular?.media))),
  };
}

async function cached(season: MediaSeason, seasonYear: number) {
  const key = `${season}:${seasonYear}`;
  return cache.get(
    key,
    () =>
      requestHomepage(season, seasonYear).catch((cause) => {
        console.error('AniList homepage refresh failed', cause);
        throw cause;
      }),
    { staleIfError: true }
  );
}

export function getHomepage(season: MediaSeason, seasonYear: number) {
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
