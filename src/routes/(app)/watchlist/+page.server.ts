import { error, fail, redirect } from '@sveltejs/kit';
import { inArray } from 'drizzle-orm';

import { audioAvailabilityLabel } from '$lib/anime/audio';
import { getWatchlistAnime } from '$lib/server/anime/anilist/watchlist';
import { resolveWatchlistImport } from '$lib/server/anime/anilist/watchlist-transfer';
import { withAnimeCardPosters } from '$lib/server/anime/card-posters';
import { db } from '$lib/server/db';
import { animeEpisode } from '$lib/server/db/schema';
import {
  applyWatchlistEntries,
  getWatchlistEntries,
  type WatchlistImportMode,
} from '$lib/server/watchlist';
import {
  importedActivityAt,
  parseWatchlistImport,
  WatchlistImportError,
} from '$lib/server/watchlist-transfer';
import { watchlistOrder, watchlistSort, watchlistState } from '$lib/watchlist';
import type { Actions, PageServerLoad } from './$types';

// Bound in-memory multipart and JSON parsing work. Entry count remains unlimited;
// provider lookups and database writes are batched separately.
const maximumFileSize = 2 * 1_024 * 1_024;

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
            },
          ]
        : [];
    })
    .sort((left, right) => {
      if (selection.sort === 'alphabetical') {
        const title = left.title.localeCompare(right.title, 'en');
        return selection.order === 'newest' ? title : -title;
      }

      const key = selection.sort === 'updated' ? 'updatedAt' : 'addedAt';
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
    .map(({ addedAt: _addedAt, updatedAt: _updatedAt, ...entry }) => entry);

  return {
    pageTitle: 'Watchlist',
    entries,
    totalEntries: stored.length,
    selection,
  };
};

export const actions: Actions = {
  import: async ({ locals, request }) => {
    if (!locals.user) {
      redirect(303, '/login');
    }

    const form = await request.formData();
    const mode = form.get('mode');
    if (mode !== 'merge' && mode !== 'replace') {
      return fail(400, { message: 'Choose how Arc should import this watchlist.' });
    }

    const file = form.get('watchlist');
    if (!(file instanceof File) || !file.size) {
      return fail(400, { message: 'Choose a watchlist JSON file.' });
    }
    if (file.size > maximumFileSize) {
      return fail(413, { message: 'The watchlist file must be smaller than 2 MB.' });
    }

    try {
      const imported = parseWatchlistImport(await file.text());
      const importedAt = Date.now();
      const resolved = await resolveWatchlistImport(imported);
      const unresolved = imported.filter(({ index }) => !resolved.has(index));

      if (imported.length && !resolved.size) {
        return fail(400, {
          message: 'Nothing was changed. No entries could be matched on AniList.',
        });
      }

      const entries = imported.flatMap((entry) => {
        const match = resolved.get(entry.index);
        const activityAt = importedActivityAt(entry.index, importedAt);
        return match
          ? [
              {
                anilistId: match.id,
                state: entry.state,
                addedAt: entry.addedAt ?? activityAt,
                updatedAt: activityAt,
              },
            ]
          : [];
      });
      const seen = new Set<number>();
      if (
        entries.some(({ anilistId }) => {
          if (seen.has(anilistId)) {
            return true;
          }
          seen.add(anilistId);
          return false;
        })
      ) {
        return fail(400, {
          message: 'Nothing was changed. The imported file contains duplicate anime.',
        });
      }

      const result = await applyWatchlistEntries(
        locals.user.id,
        entries,
        mode as WatchlistImportMode
      );
      const skipped = unresolved.length
        ? ` Skipped ${unresolved.length} unavailable ${unresolved.length === 1 ? 'entry' : 'entries'}.`
        : '';
      const message =
        mode === 'replace'
          ? `Replaced your watchlist with ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}.${skipped}`
          : `Added ${result.added}, updated ${result.updated}, and kept ${result.unchanged} already up to date.${skipped}`;

      return { success: true, message };
    } catch (cause) {
      if (cause instanceof WatchlistImportError) {
        return fail(400, { message: cause.message });
      }

      console.error('Watchlist import failed', cause);
      return fail(500, { message: 'Nothing was changed. The watchlist import failed.' });
    }
  },
};
