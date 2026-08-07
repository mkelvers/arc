import { asc, inArray } from 'drizzle-orm';

import { audioAvailabilityLabel } from '$lib/anime/audio';
import type { ContinueWatchingCard } from '$lib/anime/types';
import { anime } from '$lib/server/anime';
import { toAnimeDetails } from '$lib/server/anime/details';
import { db } from '$lib/server/db';
import { animeEpisode } from '$lib/server/db/schema';
import { formatDuration } from '$lib/utils';
import { getRecentPlaybackProgress } from './store';

export async function getContinueWatchingCards(
  userId: string | undefined,
  limit = 10
): Promise<ContinueWatchingCard[]> {
  const progressEntries = await getRecentPlaybackProgress(userId, limit * 2);
  if (!progressEntries.length) {
    return [];
  }

  const anilistIds = [...new Set(progressEntries.map(({ anilistId }) => anilistId))];
  const episodeRows = await db
    .select()
    .from(animeEpisode)
    .where(inArray(animeEpisode.anilistId, anilistIds))
    .orderBy(asc(animeEpisode.number));
  const episodesByAnime = new Map<number, (typeof episodeRows)[number][]>();

  for (const episode of episodeRows) {
    const episodes = episodesByAnime.get(episode.anilistId) ?? [];
    episodes.push(episode);
    episodesByAnime.set(episode.anilistId, episodes);
  }

  const cards = await Promise.all(
    progressEntries.map(async (progress) => {
      const episodes = episodesByAnime.get(progress.anilistId) ?? [];
      const currentIndex = episodes.findIndex(({ episodeId }) => episodeId === progress.episodeId);
      const current = currentIndex >= 0 ? episodes[currentIndex] : null;
      const target = progress.completed
        ? (episodes[currentIndex + 1] ??
          episodes.find(({ number }) => number > progress.episodeNumber) ??
          null)
        : (current ?? {
            anilistId: progress.anilistId,
            episodeId: progress.episodeId,
            number: progress.episodeNumber,
            providerTitle: null,
            metadataTitle: null,
            audio: [],
            imageUrl: null,
            runtimeMinutes: Math.ceil(progress.durationSeconds / 60),
            airDate: null,
            overview: null,
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
            lastVerifiedAt: new Date(),
          });

      if (!target) {
        return null;
      }

      const storedMedia = await anime.tmdb.getStoredMedia(progress.anilistId).catch((cause) => {
        console.error(`Stored TMDB media failed for AniList ${progress.anilistId}`, cause);
        return null;
      });
      const details = progress.details ? toAnimeDetails(progress.details) : null;
      const backdrop =
        storedMedia?.artwork.selectedBackdrop?.url ?? details?.bannerImage ?? target.imageUrl;
      const episodeImage = target.imageUrl ?? backdrop;

      if (!backdrop || !episodeImage) {
        return null;
      }

      const continuingCurrent = !progress.completed && target.episodeId === progress.episodeId;
      const runtimeMinutes =
        target.runtimeMinutes ??
        (continuingCurrent ? Math.ceil(progress.durationSeconds / 60) : null);

      return {
        animeId: progress.anilistId,
        title: details?.title ?? progress.animeTitle ?? `Anime ${progress.anilistId}`,
        watchHref: `/anime/${progress.anilistId}/watch/${encodeURIComponent(target.episodeId)}`,
        backdrop,
        episodeImage,
        episodeLabel: `E${Number.isInteger(target.number) ? target.number : target.number.toFixed(1)}`,
        audioLabel: audioAvailabilityLabel(target.audio),
        duration: formatDuration(runtimeMinutes),
        resumeAtSeconds: continuingCurrent ? progress.positionSeconds : 0,
      };
    })
  );

  return cards.filter((card): card is ContinueWatchingCard => card !== null).slice(0, limit);
}
