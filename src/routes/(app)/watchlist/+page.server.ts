import { error, redirect } from '@sveltejs/kit';
import { inArray } from 'drizzle-orm';

import { audioAvailabilityLabel } from '$lib/anime/audio';
import { getWatchlistAnime } from '$lib/server/anime/anilist/watchlist';
import { withAnimeCardPosters } from '$lib/server/anime/card-posters';
import { db } from '$lib/server/db';
import { animeEpisode } from '$lib/server/db/schema';
import { getWatchlistEntries } from '$lib/server/watchlist';
import { watchlistOrder, watchlistSort, watchlistState } from '$lib/watchlist';
import type { PageServerLoad } from './$types';

function timestamp(value: Date | null) {
  return value?.getTime() ?? null;
}

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    redirect(303, '/login');
  }

  const selection = {
    state: watchlistState(url.searchParams.get('state')),
    sort: watchlistSort(url.searchParams.get('sort')),
    order: watchlistOrder(url.searchParams.get('order')),
  };
  const stored = await getWatchlistEntries(locals.user.id).catch((cause) => {
    console.error('Watchlist entries load failed', cause);
    error(500, 'Your watchlist could not be loaded');
  });

  if (!stored.length) {
    return { pageTitle: 'Watchlist', entries: [], totalEntries: 0, selection };
  }

  const filtered =
    selection.state === 'all' ? stored : stored.filter(({ state }) => state === selection.state);
  const cards = await getWatchlistAnime(filtered.map(({ anilistId }) => anilistId)).catch(
    (cause) => {
      console.error('Watchlist anime enrichment failed', cause);
      error(502, 'Your watchlist anime could not be loaded');
    }
  );
  const cardIds = cards.map(({ id }) => id);
  const episodeRows = cardIds.length
    ? await db
        .select({ anilistId: animeEpisode.anilistId, audio: animeEpisode.audio })
        .from(animeEpisode)
        .where(inArray(animeEpisode.anilistId, cardIds))
    : [];
  const audioByAnime = new Map<number, Set<'sub' | 'dub' | 'raw'>>();

  for (const episode of episodeRows) {
    const audio = audioByAnime.get(episode.anilistId) ?? new Set<'sub' | 'dub' | 'raw'>();
    episode.audio.forEach((mode) => audio.add(mode));
    audioByAnime.set(episode.anilistId, audio);
  }

  const storedById = new Map(filtered.map((entry) => [entry.anilistId, entry]));
  const entries = (await withAnimeCardPosters(cards))
    .flatMap((card) => {
      const entry = storedById.get(card.id);
      return entry
        ? [
            {
              ...card,
              caption: audioAvailabilityLabel([...(audioByAnime.get(card.id) ?? [])]),
              state: entry.state,
              addedAt: timestamp(entry.addedAt),
              updatedAt: timestamp(entry.updatedAt),
              watchedAt: timestamp(entry.watchedAt),
              recentActivityAt: Math.max(
                timestamp(entry.updatedAt) ?? 0,
                timestamp(entry.watchedAt) ?? 0
              ),
            },
          ]
        : [];
    })
    .sort((left, right) => {
      if (selection.sort === 'alphabetical') {
        const title = left.title.localeCompare(right.title, 'en');
        return selection.order === 'newest' ? title : -title;
      }

      const key =
        selection.sort === 'recent_activity'
          ? 'recentActivityAt'
          : selection.sort === 'updated'
            ? 'updatedAt'
            : selection.sort === 'watched'
              ? 'watchedAt'
              : 'addedAt';
      const leftValue = left[key];
      const rightValue = right[key];

      if (leftValue === null && rightValue !== null) {
        return 1;
      }
      if (rightValue === null && leftValue !== null) {
        return -1;
      }

      const time = (leftValue ?? 0) - (rightValue ?? 0);
      if (time) {
        return selection.order === 'newest' ? -time : time;
      }

      return left.title.localeCompare(right.title, 'en');
    })
    .map(
      ({
        addedAt: _addedAt,
        updatedAt: _updatedAt,
        watchedAt: _watchedAt,
        recentActivityAt: _recentActivityAt,
        ...entry
      }) => entry
    );

  return {
    pageTitle: 'Watchlist',
    entries,
    totalEntries: stored.length,
    selection,
  };
};
