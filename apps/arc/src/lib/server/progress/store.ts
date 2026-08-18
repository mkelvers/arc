import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';

import { ensureInternalAnimeId, findInternalAnimeId } from '$lib/server/anime/identity';
import { db } from '$lib/server/db';
import {
    anime as animeTable,
    animeDetailsCache,
    animeEpisode,
    animeExternalId,
    animeExternalIdLink,
    playbackProgress,
} from '$lib/server/db/schema';
import { updateWatchlistAfterPlayback } from '$lib/server/watchlist';
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
                lt(playbackProgress.eventAt, sql.raw(`excluded.${playbackProgress.eventAt.name}`)),
                or(
                    isNull(playbackProgress.dismissedAt),
                    lt(
                        playbackProgress.dismissedAt,
                        sql.raw(`excluded.${playbackProgress.eventAt.name}`)
                    )
                )
            ),
        })
        .returning({ id: playbackProgress.id });

    if (!saved) {
        // A newer progress event already won at the database boundary. The
        // stale request was valid and needs no retry or user-facing failure.
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

export async function getRecentPlaybackProgress(userId: string | undefined, limit?: number) {
    if (!userId) {
        return [];
    }

    const query = db
        .select({
            anilistId: animeExternalId.externalId,
            animeTitle: animeTable.title,
            details: animeDetailsCache.data,
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
        .leftJoin(animeDetailsCache, eq(animeDetailsCache.anilistId, animeExternalId.externalId))
        .where(
            and(
                eq(playbackProgress.userId, userId),
                isNull(playbackProgress.dismissedAt),
                eq(animeExternalId.provider, 'anilist'),
                eq(animeExternalId.mediaType, 'anime')
            )
        )
        .orderBy(desc(playbackProgress.lastWatchedAt));

    return limit === undefined ? query : query.limit(Math.max(1, Math.min(limit, 50)));
}
