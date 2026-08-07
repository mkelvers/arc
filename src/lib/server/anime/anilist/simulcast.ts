import { Effect, Schedule } from 'effect';

import type { AnimeSeason, AnimeSeasonStartYears } from '$lib/anime/season';
import { SimulcastSeasonStartsDocument } from '$lib/graphql/anilist/generated/graphql';
import { GraphQLRequestError } from '$lib/server/graphql';
import { RequestCache } from '$lib/server/request-cache';
import { request, transientRequestError } from './client';

const starts = new RequestCache<string, AnimeSeasonStartYears>(24 * 60 * 60 * 1_000);

function startYear(media: Array<{ seasonYear: number | null } | null> | null | undefined) {
  const year = media?.[0]?.seasonYear;
  return year && Number.isSafeInteger(year) && year > 0 ? year : undefined;
}

async function requestSeasonStarts() {
  const response = await Effect.runPromise(
    request(SimulcastSeasonStartsDocument, {}).pipe(
      Effect.retry({
        times: 2,
        schedule: Schedule.exponential('750 millis'),
        while: transientRequestError,
      })
    )
  );
  const entries: Array<[AnimeSeason, number | undefined]> = [
    ['WINTER', startYear(response.winter?.media)],
    ['SPRING', startYear(response.spring?.media)],
    ['SUMMER', startYear(response.summer?.media)],
    ['FALL', startYear(response.fall?.media)],
  ];

  return Object.fromEntries(
    entries.filter((entry): entry is [AnimeSeason, number] => entry[1] !== undefined)
  );
}

async function cachedSeasonStarts() {
  return starts.get(
    'catalog',
    () =>
      requestSeasonStarts().catch((cause) => {
        console.error('AniList season range refresh failed', cause);
        throw cause;
      }),
    { staleIfError: true }
  );
}

function requestEffect<Value>(load: () => Promise<Value>, message: string) {
  return Effect.tryPromise({
    try: load,
    catch: (cause) =>
      cause instanceof GraphQLRequestError ? cause : new GraphQLRequestError({ message, cause }),
  });
}

export function getSimulcastSeasonStarts() {
  return requestEffect(cachedSeasonStarts, 'Simulcast seasons could not be loaded');
}
