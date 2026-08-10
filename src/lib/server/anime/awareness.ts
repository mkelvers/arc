import { and, asc, eq, isNull, lte, or } from 'drizzle-orm';

import { db } from '$lib/server/db';
import {
  animeEpisodeSync,
  animeExternalId,
  animeExternalIdLink,
  playbackProgress,
  watchlist,
} from '$lib/server/db/schema';
import { getAnime } from './anilist/details';
import { refreshEpisodes } from './episodes/sync';

const refreshInterval = 15 * 60 * 1_000;
let running = false;

async function interestedAnimeIds() {
  const [watchlistIds, progressIds] = await Promise.all([
    db
      .select({ anilistId: animeExternalId.externalId })
      .from(watchlist)
      .innerJoin(animeExternalIdLink, eq(animeExternalIdLink.animeId, watchlist.animeId))
      .innerJoin(animeExternalId, eq(animeExternalId.id, animeExternalIdLink.externalIdId))
      .where(and(eq(animeExternalId.provider, 'anilist'), eq(animeExternalId.mediaType, 'anime'))),
    db
      .select({ anilistId: animeExternalId.externalId })
      .from(playbackProgress)
      .innerJoin(animeExternalIdLink, eq(animeExternalIdLink.animeId, playbackProgress.animeId))
      .innerJoin(animeExternalId, eq(animeExternalId.id, animeExternalIdLink.externalIdId))
      .where(and(eq(animeExternalId.provider, 'anilist'), eq(animeExternalId.mediaType, 'anime'))),
  ]);

  return new Set([...watchlistIds, ...progressIds].map(({ anilistId }) => anilistId));
}

export async function runAwarenessSweep(limit = 20) {
  if (running) {
    return;
  }

  running = true;
  try {
    const interested = await interestedAnimeIds();
    const due = await db
      .select({ anilistId: animeEpisodeSync.anilistId })
      .from(animeEpisodeSync)
      .where(
        or(isNull(animeEpisodeSync.nextRefreshAt), lte(animeEpisodeSync.nextRefreshAt, new Date()))
      )
      .orderBy(asc(animeEpisodeSync.nextRefreshAt))
      .limit(Math.max(1, Math.min(limit, 100)));
    const ids = new Set(due.map(({ anilistId }) => anilistId));

    for (const anilistId of interested) {
      if (ids.size >= limit) {
        break;
      }
      ids.add(anilistId);
    }

    for (const anilistId of ids) {
      try {
        await refreshEpisodes(await getAnime(anilistId));
      } catch (cause) {
        console.error(`Awareness refresh failed for AniList ${anilistId}`, cause);
      }
    }
  } finally {
    running = false;
  }
}

export function startAwarenessLoop() {
  const timer = setInterval(() => void runAwarenessSweep(), refreshInterval);
  timer.unref?.();
  void runAwarenessSweep();
}
