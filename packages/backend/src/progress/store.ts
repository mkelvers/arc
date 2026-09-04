import { and, asc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';

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
import { watchEpisodeHref } from '../anime/episodes/route';
import type { PlaybackProgressInput } from './input';
import { selectPlaybackProgress } from './continue';

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
            hasCompleted: input.completed,
            completedAt: input.completed ? now : null,
            lastWatchedAt: now,
            eventAt: input.eventAt,
            dismissedAt: null,
        })
        .onConflictDoUpdate({
            target: [playbackProgress.userId, playbackProgress.animeId, playbackProgress.episodeId],
            set: {
                episodeId: input.episodeId,
                episodeNumber: input.episodeNumber,
                positionSeconds: input.positionSeconds,
                durationSeconds: input.durationSeconds,
                completed: input.completed,
                hasCompleted: sql`${playbackProgress.hasCompleted} OR ${input.completed}`,
                completedAt: input.completed ? now : playbackProgress.completedAt,
                updatedAt: now,
                lastWatchedAt: now,
                eventAt: input.eventAt,
                dismissedAt: null,
            },
            setWhere: and(
                lt(playbackProgress.eventAt, excluded(playbackProgress.eventAt)),
                or(
                    isNull(playbackProgress.dismissedAt),
                    lt(playbackProgress.dismissedAt, input.sessionStartedAt)
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

    const progress = await db
        .select({
            id: playbackProgress.id,
            episodeId: playbackProgress.episodeId,
            episodeNumber: playbackProgress.episodeNumber,
            positionSeconds: playbackProgress.positionSeconds,
            durationSeconds: playbackProgress.durationSeconds,
            completed: playbackProgress.completed,
            hasCompleted: playbackProgress.hasCompleted,
            completedAt: playbackProgress.completedAt,
            eventAt: playbackProgress.eventAt,
            lastWatchedAt: playbackProgress.lastWatchedAt,
            updatedAt: playbackProgress.updatedAt,
        })
        .from(playbackProgress)
        .where(and(eq(playbackProgress.userId, userId), eq(playbackProgress.animeId, animeId)));

    return selectPlaybackProgress(progress) ?? null;
}

export async function getEpisodePlaybackProgress(userId: string | undefined, anilistId: number) {
    if (!userId) {
        return new Map();
    }

    const animeId = await findInternalAnimeId(anilistId);
    if (!animeId) {
        return new Map();
    }

    const rows = await db
        .select({
            episodeId: playbackProgress.episodeId,
            positionSeconds: playbackProgress.positionSeconds,
            durationSeconds: playbackProgress.durationSeconds,
            completed: playbackProgress.completed,
            hasCompleted: playbackProgress.hasCompleted,
            completedAt: playbackProgress.completedAt,
        })
        .from(playbackProgress)
        .where(and(eq(playbackProgress.userId, userId), eq(playbackProgress.animeId, animeId)));

    return new Map(
        rows.map((row) => [
            row.episodeId,
            {
                ...row,
                completedAt: row.completedAt?.toISOString() ?? null,
            },
        ])
    );
}

export async function clearPlaybackProgress(userId: string, anilistId: number) {
    const animeId = await findInternalAnimeId(anilistId);
    if (!animeId) {
        return false;
    }

    await db
        .delete(playbackProgress)
        .where(and(eq(playbackProgress.userId, userId), eq(playbackProgress.animeId, animeId)));
    return true;
}

async function recentPlaybackProgress(userId: string | undefined) {
    if (!userId) {
        return [];
    }

    return db
        .select({
            anilistId: animeExternalId.externalId,
            animeTitle: animeTable.title,
            animeImage: animeRelease.imageUrl,
            details: animeRelease.data,
            episodeId: playbackProgress.episodeId,
            episodeNumber: playbackProgress.episodeNumber,
            positionSeconds: playbackProgress.positionSeconds,
            durationSeconds: playbackProgress.durationSeconds,
            completed: playbackProgress.completed,
            id: playbackProgress.id,
            lastWatchedAt: playbackProgress.lastWatchedAt,
            eventAt: playbackProgress.eventAt,
            updatedAt: playbackProgress.updatedAt,
        })
        .from(playbackProgress)
        .innerJoin(animeTable, eq(animeTable.id, playbackProgress.animeId))
        .innerJoin(animeExternalIdLink, eq(animeExternalIdLink.animeId, playbackProgress.animeId))
        .innerJoin(animeExternalId, eq(animeExternalId.id, animeExternalIdLink.externalIdId))
        .leftJoin(animeRelease, eq(animeRelease.anilistId, animeExternalId.externalId))
        .where(
            and(
                eq(playbackProgress.userId, userId),
                eq(animeExternalId.provider, 'anilist'),
                eq(animeExternalId.mediaType, 'anime')
            )
        );
}

export async function getContinueWatchingCards(userId: string): Promise<ContinueWatchingCard[]> {
    const progressByAnime = new Map<
        number,
        Awaited<ReturnType<typeof recentPlaybackProgress>>[number][]
    >();
    for (const progress of await recentPlaybackProgress(userId)) {
        const entries = progressByAnime.get(progress.anilistId) ?? [];
        entries.push(progress);
        progressByAnime.set(progress.anilistId, entries);
    }
    const progressEntries = [...progressByAnime.values()]
        .map((progress) => selectPlaybackProgress(progress))
        .filter((progress): progress is NonNullable<typeof progress> => progress !== null);
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

    const cards: Array<ContinueWatchingCard | null> = await Promise.all(
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

            const storedMedia = await getStoredMedia(progress.anilistId).catch(() => null);
            const backdrop =
                storedMedia?.artwork.selectedBackdrop?.url ??
                details?.bannerImage ??
                progress.animeImage ??
                storedDetails?.coverImage?.extraLarge ??
                storedDetails?.coverImage?.large ??
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
                link: watchEpisodeHref(progress.anilistId, target.number),
                backdrop,
                episodeImage,
                episodeLabel: `E${target.number}`,
                audioLabel: audioAvailabilityLabel(target.audio),
                duration: formatDuration(runtimeMinutes),
                resumeAtSeconds: continuingCurrent ? progress.positionSeconds : 0,
                progress: {
                    positionSeconds: progress.positionSeconds,
                    durationSeconds: progress.durationSeconds,
                    completed: progress.completed,
                },
            };
        })
    );

    return cards.filter((card): card is ContinueWatchingCard => card !== null);
}
