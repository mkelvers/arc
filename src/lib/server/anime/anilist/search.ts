import { Effect } from 'effect';

import { rankAnimeSearch, type AnimeSearchResult } from '$lib/anime/search';
import { SearchAnimePageDocument } from '$lib/graphql/anilist/generated/graphql';
import { GraphQLRequestError } from '$lib/server/graphql';
import { RequestCache } from '$lib/server/request-cache';
import { request } from './client';
import { animeCard } from './models';
import { present } from './text';

const lifetime = 5 * 60 * 1_000;
const cache = new RequestCache<string, AnimeSearchResult[]>(lifetime);

async function requestSearch(search: string) {
  const response = await Effect.runPromise(
    request(SearchAnimePageDocument, {
      search,
      page: 1,
      perPage: 50,
    })
  );

  const results = present(response.Page?.media).flatMap((entry) => {
    const card = animeCard(entry);
    if (!card) {
      return [];
    }

    const titles = [
      entry.title?.english,
      entry.title?.romaji,
      entry.title?.native,
      ...present(entry.synonyms),
    ].filter(
      (title, index, values): title is string => Boolean(title) && values.indexOf(title) === index
    );
    const relatedIds = present(entry.relations?.edges).flatMap((edge) =>
      (edge?.relationType === 'PREQUEL' || edge?.relationType === 'SEQUEL') && edge.node
        ? [edge.node.id]
        : []
    );

    return [
      {
        ...card,
        titles,
        format: entry.format ?? null,
        popularity: entry.popularity ?? 0,
        backdrop: null,
        artworkGroup: null,
        relatedIds,
      },
    ];
  });

  return rankAnimeSearch(search, results);
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
