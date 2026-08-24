import { and, asc, desc, eq, inArray, isNull, lt, or } from 'drizzle-orm';

import { audioAvailabilityLabel } from '@arc/shared/audio';
import type { ContinueWatchingCard } from '@arc/shared/types';
import { db, excluded } from '@arc/db';
import {
    anime as animeTable,
    animeEpisode,
    animeExternalId,
    animeExternalIdLink,
    animeRelease,
    playbackProgress,
} from '@arc/db/schema';
import { parseStoredAnimeDetails, toAnimeDetails } from '../anime/details';
import { ensureInternalAnimeId, findInternalAnimeId } from '../anime/identity';
import { getStoredMedia } from '../anime/tmdb/media';
import { updateWatchlistAfterPlayback } from '../watchlist/store';
import { formatDuration } from '../utils';
import type { PlaybackProgressInput } from './input';

export async function savePlaybackProgress(userId: string, input: PlaybackProgressInput) {
    const [episode] = await db
        .select({ episodeId: animeEpisode.episodeId })
        .from(animeEpisode)
        .where(
            and(
                eq(animeEpisode.anilistId, input.animeId),
                eq(animeEpisode.episodeId, input.episodeId),
                eq(animeEpisode.number, input.episodeNumber)
            )
        )
        .limit(1);

    if (!episode) {
        return false;
    }

    const animeId = await ensureInternalAnimeId(input.animeId);
    const now = new Date();
    const [saved] = await db
        .insert(playbackProgress)
        .values({
            userId,
            animeId,
            episodeId: input.episodeId,
            episodeNumber: input.episodeNumber,
            positionSeconds: input.positionSeconds,
            durationSeconds: input.durationSeconds,
            completed: input.completed,
            lastWatchedAt: now,
            eventAt: input.eventAt,
            dismissedAt: null,
        })
        .onConflictDoUpdate({
            target: [playbackProgress.userId, playbackProgress.animeId],
            set: {
                episodeId: input.episodeId,
                episodeNumber: input.episodeNumber,
                positionSeconds: input.positionSeconds,
                durationSeconds: input.durationSeconds,
                completed: input.completed,
                updatedAt: now,
                lastWatchedAt: now,
                eventAt: input.eventAt,
                dismissedAt: null,
            },
            setWhere: and(
                lt(playbackProgress.eventAt, excluded(playbackProgress.eventAt)),
                or(
                    isNull(playbackProgress.dismissedAt),
                    lt(playbackProgress.dismissedAt, excluded(playbackProgress.eventAt))
                )
            ),
        })
        .returning({ id: playbackProgress.id });

    if (!saved) {
        return true;
    }

    await updateWatchlistAfterPlayback(userId, animeId, input);
    return true;
}

export async function getPlaybackProgress(userId: string | undefined, anilistId: number) {
    if (!userId) {
        return null;
    }

    const animeId = await findInternalAnimeId(anilistId);
    if (!animeId) {
        return null;
    }

    const [progress] = await db
        .select({
            episodeId: playbackProgress.episodeId,
            episodeNumber: playbackProgress.episodeNumber,
            positionSeconds: playbackProgress.positionSeconds,
            durationSeconds: playbackProgress.durationSeconds,
            completed: playbackProgress.completed,
            eventAt: playbackProgress.eventAt,
        })
        .from(playbackProgress)
        .where(
            and(
                eq(playbackProgress.userId, userId),
                eq(playbackProgress.animeId, animeId),
                isNull(playbackProgress.dismissedAt)
            )
        )
        .limit(1);

    return progress ?? null;
}

export async function dismissPlaybackProgress(userId: string, anilistId: number) {
    const animeId = await findInternalAnimeId(anilistId);
    if (!animeId) {
        return;
    }

    await db
        .update(playbackProgress)
        .set({ dismissedAt: new Date() })
        .where(and(eq(playbackProgress.userId, userId), eq(playbackProgress.animeId, animeId)));
}

async function recentPlaybackProgress(userId: string | undefined) {
    if (!userId) {
        return [];
    }

    return db
        .select({
            anilistId: animeExternalId.externalId,
            animeTitle: animeTable.title,
            details: animeRelease.data,
            episodeId: playbackProgress.episodeId,
            episodeNumber: playbackProgress.episodeNumber,
            positionSeconds: playbackProgress.positionSeconds,
            durationSeconds: playbackProgress.durationSeconds,
            completed: playbackProgress.completed,
        })
        .from(playbackProgress)
        .innerJoin(animeTable, eq(animeTable.id, playbackProgress.animeId))
        .innerJoin(animeExternalIdLink, eq(animeExternalIdLink.animeId, playbackProgress.animeId))
        .innerJoin(animeExternalId, eq(animeExternalId.id, animeExternalIdLink.externalIdId))
        .leftJoin(animeRelease, eq(animeRelease.anilistId, animeExternalId.externalId))
        .where(
            and(
                eq(playbackProgress.userId, userId),
                isNull(playbackProgress.dismissedAt),
                eq(animeExternalId.provider, 'anilist'),
                eq(animeExternalId.mediaType, 'anime')
            )
        )
        .orderBy(desc(playbackProgress.lastWatchedAt));
}

export async function getContinueWatchingCards(userId: string): Promise<ContinueWatchingCard[]> {
    const progressEntries = await recentPlaybackProgress(userId);
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
            const currentIndex = episodes.findIndex(
                ({ episodeId }) => episodeId === progress.episodeId
            );
            const current = currentIndex >= 0 ? episodes[currentIndex] : null;
            const storedDetails = parseStoredAnimeDetails(progress.details);
            const details = storedDetails ? toAnimeDetails(storedDetails) : null;
            const target = progress.completed
                ? (episodes[currentIndex + 1] ??
                  episodes.find(({ number }) => number > progress.episodeNumber) ??
                  (details?.status === 'FINISHED' ? null : current) ??
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

            const targetIndex = episodes.findIndex(
                ({ episodeId }) => episodeId === target.episodeId
            );
            const displayNumber =
                targetIndex >= 0 && episodes.some(({ number }, index) => number !== index + 1)
                    ? targetIndex + 1
                    : target.number;
            const storedMedia = await getStoredMedia(progress.anilistId).catch(() => null);
            const backdrop =
                storedMedia?.artwork.selectedBackdrop?.url ??
                details?.bannerImage ??
                target.imageUrl;
            const episodeImage =
                storedDetails?.format === 'MOVIE' ? backdrop : (target.imageUrl ?? backdrop);

            if (!backdrop || !episodeImage) {
                return null;
            }

            const continuingCurrent =
                !progress.completed && target.episodeId === progress.episodeId;
            const runtimeMinutes =
                target.runtimeMinutes ??
                (continuingCurrent ? Math.ceil(progress.durationSeconds / 60) : null);

            return {
                animeId: progress.anilistId,
                title: details?.title ?? progress.animeTitle ?? `Anime ${progress.anilistId}`,
                link: `/anime/${progress.anilistId}/watch/${encodeURIComponent(target.episodeId)}`,
                backdrop,
                episodeImage,
                episodeLabel: `E${Number.isInteger(displayNumber) ? displayNumber : displayNumber.toFixed(1)}`,
                audioLabel: audioAvailabilityLabel(target.audio),
                duration: formatDuration(runtimeMinutes),
                resumeAtSeconds: continuingCurrent ? progress.positionSeconds : 0,
            };
        })
    );

    return cards.filter((card): card is ContinueWatchingCard => card !== null);
}
