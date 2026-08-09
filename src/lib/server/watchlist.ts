import { and, eq } from 'drizzle-orm';

import type { PlaybackProgressInput } from '$lib/server/playback-progress/input';
import { ensureInternalAnimeId, findInternalAnimeId } from '$lib/server/anime/identity';
import { db } from '$lib/server/db';
import {
  animeEpisode,
  animeEpisodeSync,
  animeExternalId,
  animeExternalIdLink,
  playbackProgress,
  watchlist,
  type WatchlistState,
} from '$lib/server/db/schema';
import { watchlistStateAfterEpisodeCompletion } from './watchlist-completion';

export async function getWatchlistState(userId: string | undefined, anilistId: number) {
  if (!userId) {
    return null;
  }

  const animeId = await findInternalAnimeId(anilistId);
  if (!animeId) {
    return null;
  }

  const [entry] = await db
    .select({ state: watchlist.state })
    .from(watchlist)
    .where(and(eq(watchlist.userId, userId), eq(watchlist.animeId, animeId)))
    .limit(1);

  return entry?.state ?? null;
}

export async function getWatchlistStates(userId: string) {
  return db
    .select({
      animeId: animeExternalId.externalId,
      state: watchlist.state,
    })
    .from(watchlist)
    .innerJoin(animeExternalIdLink, eq(animeExternalIdLink.animeId, watchlist.animeId))
    .innerJoin(animeExternalId, eq(animeExternalId.id, animeExternalIdLink.externalIdId))
    .where(
      and(
        eq(watchlist.userId, userId),
        eq(animeExternalId.provider, 'anilist'),
        eq(animeExternalId.mediaType, 'anime')
      )
    );
}

export async function getWatchlistEntries(userId: string) {
  return db
    .select({
      anilistId: animeExternalId.externalId,
      state: watchlist.state,
      addedAt: watchlist.createdAt,
      updatedAt: watchlist.updatedAt,
      watchedAt: playbackProgress.lastWatchedAt,
    })
    .from(watchlist)
    .innerJoin(animeExternalIdLink, eq(animeExternalIdLink.animeId, watchlist.animeId))
    .innerJoin(animeExternalId, eq(animeExternalId.id, animeExternalIdLink.externalIdId))
    .leftJoin(
      playbackProgress,
      and(
        eq(playbackProgress.userId, watchlist.userId),
        eq(playbackProgress.animeId, watchlist.animeId)
      )
    )
    .where(
      and(
        eq(watchlist.userId, userId),
        eq(animeExternalId.provider, 'anilist'),
        eq(animeExternalId.mediaType, 'anime')
      )
    );
}

async function setInternalWatchlistState(userId: string, animeId: number, state: WatchlistState) {
  const [current] = await db
    .select({ state: watchlist.state })
    .from(watchlist)
    .where(and(eq(watchlist.userId, userId), eq(watchlist.animeId, animeId)))
    .limit(1);

  if (current?.state === state) {
    return state;
  }

  if (current) {
    await db
      .update(watchlist)
      .set({ state, updatedAt: new Date() })
      .where(and(eq(watchlist.userId, userId), eq(watchlist.animeId, animeId)));

    return state;
  }

  const [created] = await db
    .insert(watchlist)
    .values({ userId, animeId, state })
    .onConflictDoNothing()
    .returning({ state: watchlist.state });

  if (created) {
    return created.state;
  }

  return setInternalWatchlistState(userId, animeId, state);
}

export async function setWatchlistState(userId: string, anilistId: number, state: WatchlistState) {
  const animeId = await ensureInternalAnimeId(anilistId);
  return setInternalWatchlistState(userId, animeId, state);
}

export async function removeFromWatchlist(userId: string, anilistId: number) {
  const animeId = await findInternalAnimeId(anilistId);
  if (!animeId) {
    return;
  }

  await db
    .delete(watchlist)
    .where(and(eq(watchlist.userId, userId), eq(watchlist.animeId, animeId)));
}

export async function updateWatchlistAfterEpisodeCompletion(
  userId: string,
  animeId: number,
  input: PlaybackProgressInput
) {
  const [[current], [release], episodes] = await Promise.all([
    db
      .select({ state: watchlist.state })
      .from(watchlist)
      .where(and(eq(watchlist.userId, userId), eq(watchlist.animeId, animeId)))
      .limit(1),
    db
      .select({
        mediaStatus: animeEpisodeSync.mediaStatus,
        expectedEpisodes: animeEpisodeSync.expectedEpisodes,
      })
      .from(animeEpisodeSync)
      .where(eq(animeEpisodeSync.anilistId, input.animeId))
      .limit(1),
    db
      .select({
        episodeId: animeEpisode.episodeId,
        number: animeEpisode.number,
      })
      .from(animeEpisode)
      .where(eq(animeEpisode.anilistId, input.animeId)),
  ]);
  const next = watchlistStateAfterEpisodeCompletion(
    current?.state ?? null,
    release ?? null,
    episodes,
    {
      episodeId: input.episodeId,
      number: input.episodeNumber,
    }
  );

  if (next === null || next === current?.state) {
    return;
  }

  await setInternalWatchlistState(userId, animeId, next);
}
