import { and, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { audioAvailabilityLabel, type AudioMode } from '$lib/anime/audio';
import { inferSearchArtwork, type AnimeSearchResult, type SearchArtwork } from '$lib/anime/search';
import { db } from '$lib/server/db';
import {
  animeArtwork,
  animeArtworkPreference,
  animeEpisode,
  animeExternalId,
  animeExternalIdLink,
} from '$lib/server/db/schema';
import { imageUrl } from './tmdb/client';

async function storedArtwork(anilistIds: number[]) {
  const source = alias(animeExternalId, 'search_anilist_id');
  const sourceLink = alias(animeExternalIdLink, 'search_anilist_link');
  const targetLink = alias(animeExternalIdLink, 'search_tmdb_link');
  const target = alias(animeExternalId, 'search_tmdb_id');

  const rows = await db
    .select({
      anilistId: source.externalId,
      targetId: target.externalId,
      mediaType: target.mediaType,
      filePath: animeArtwork.filePath,
    })
    .from(source)
    .innerJoin(sourceLink, eq(sourceLink.externalIdId, source.id))
    .innerJoin(targetLink, eq(targetLink.animeId, sourceLink.animeId))
    .innerJoin(
      target,
      and(
        eq(target.id, targetLink.externalIdId),
        eq(target.provider, 'tmdb'),
        inArray(target.mediaType, ['movie', 'tv'])
      )
    )
    .leftJoin(animeArtworkPreference, eq(animeArtworkPreference.externalIdId, target.id))
    .leftJoin(
      animeArtwork,
      and(
        eq(animeArtwork.externalIdId, target.id),
        eq(animeArtwork.type, 'backdrop'),
        eq(animeArtwork.filePath, animeArtworkPreference.backdropFilePath)
      )
    )
    .where(
      and(
        eq(source.provider, 'anilist'),
        eq(source.mediaType, 'anime'),
        inArray(source.externalId, anilistIds)
      )
    );

  const candidates = new Map<number, SearchArtwork[]>();
  for (const row of rows) {
    const value = {
      group: `tmdb:${row.mediaType}:${row.targetId}`,
      backdrop: row.filePath ? imageUrl(row.filePath, 'w780') : null,
    };
    candidates.set(row.anilistId, [...(candidates.get(row.anilistId) ?? []), value]);
  }

  return new Map(
    [...candidates].flatMap(([anilistId, values]) => {
      const groups = new Set(values.map(({ group }) => group));
      return groups.size === 1 ? [[anilistId, values[0]!] as const] : [];
    })
  );
}

async function storedPlayback(anilistIds: number[]) {
  const rows = await db
    .select({
      anilistId: animeEpisode.anilistId,
      episodeId: animeEpisode.episodeId,
      number: animeEpisode.number,
      audio: animeEpisode.audio,
    })
    .from(animeEpisode)
    .where(inArray(animeEpisode.anilistId, anilistIds));

  const playback = new Map<number, { audio: Set<AudioMode>; episodeId: string; number: number }>();
  for (const row of rows) {
    const stored = playback.get(row.anilistId);
    if (!stored) {
      playback.set(row.anilistId, {
        audio: new Set(row.audio),
        episodeId: row.episodeId,
        number: row.number,
      });
      continue;
    }

    row.audio.forEach((mode) => stored.audio.add(mode));
    if (row.number > 0 && (stored.number <= 0 || row.number < stored.number)) {
      stored.episodeId = row.episodeId;
      stored.number = row.number;
    }
  }

  return playback;
}

export async function withAnimeSearchMetadata<T extends AnimeSearchResult>(results: T[]) {
  const anilistIds = [...new Set(results.map(({ id }) => id))];
  if (!anilistIds.length) {
    return results;
  }

  const artworkIds = [
    ...new Set([...anilistIds, ...results.flatMap(({ relatedIds }) => relatedIds)]),
  ];
  const [stored, playback] = await Promise.all([
    storedArtwork(artworkIds),
    storedPlayback(anilistIds),
  ]);
  const artwork = inferSearchArtwork(results, stored);

  return results.map((result) => {
    const stored = playback.get(result.id);
    const selectedArtwork = artwork.get(result.id);
    return {
      ...result,
      backdrop: selectedArtwork?.backdrop ?? null,
      artworkGroup: selectedArtwork?.group ?? null,
      caption: stored ? audioAvailabilityLabel([...stored.audio]) : '',
      watchHref: stored
        ? `/anime/${result.id}/watch/${encodeURIComponent(stored.episodeId)}`
        : result.watchHref,
    };
  });
}
