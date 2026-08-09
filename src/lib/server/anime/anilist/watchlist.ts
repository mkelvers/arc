import type { AnimeCard } from '$lib/anime/types';
import { WatchlistAnimeDocument } from '$lib/graphql/anilist/generated/graphql';
import { RequestCache } from '$lib/server/request-cache';
import { request } from './client';
import { animeCard } from './models';
import { present } from './text';

const pageSize = 50;
const lifetime = 5 * 60 * 1_000;
const cache = new RequestCache<string, AnimeCard[]>(lifetime);

async function requestAnime(ids: number[]) {
  const requests = [];
  for (let index = 0; index < ids.length; index += pageSize) {
    requests.push(request(WatchlistAnimeDocument, { ids: ids.slice(index, index + pageSize) }));
  }

  const responses = await Promise.all(requests);
  const byId = new Map(
    responses
      .flatMap(({ Page }) => present(Page?.media))
      .flatMap((entry) => {
        const card = animeCard(entry);
        return card ? ([[card.id, card]] as const) : [];
      })
  );

  return ids.flatMap((id) => {
    const card = byId.get(id);
    return card ? [card] : [];
  });
}

export function getWatchlistAnime(ids: number[]) {
  if (!ids.length) {
    return Promise.resolve([]);
  }

  return cache.get(ids.join(','), () => requestAnime(ids), { staleIfError: true });
}
