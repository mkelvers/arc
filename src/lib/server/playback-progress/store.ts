import { and, desc, eq } from 'drizzle-orm';

import {
    ensureInternalAnimeId,
    findInternalAnimeId,
} from '$lib/server/anime/identity';
import { db } from '$lib/server/db';
import {
    anime as animeTable,
    animeDetailsCache,
    animeExternalId,
    animeExternalIdLink,
    playbackProgress,
} from '$lib/server/db/schema';
import type { PlaybackProgressInput } from './input';

export async function savePlaybackProgress(
    userId: string,
    input: PlaybackProgressInput,
) {
    const animeId = await ensureInternalAnimeId(input.animeId);
    const now = new Date();

    await db
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
        })
        .onConflictDoUpdate({
            target: [
                playbackProgress.userId,
                playbackProgress.animeId,
            ],
            set: {
                episodeId: input.episodeId,
                episodeNumber: input.episodeNumber,
                positionSeconds: input.positionSeconds,
                durationSeconds: input.durationSeconds,
                completed: input.completed,
                updatedAt: now,
                lastWatchedAt: now,
            },
        });
}

export async function getPlaybackProgress(
    userId: string | undefined,
    anilistId: number,
) {
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
        })
        .from(playbackProgress)
        .where(
            and(
                eq(playbackProgress.userId, userId),
                eq(playbackProgress.animeId, animeId),
            ),
        )
        .limit(1);

    return progress ?? null;
}

export async function deletePlaybackProgress(
    userId: string,
    anilistId: number,
) {
    const animeId = await findInternalAnimeId(anilistId);
    if (!animeId) {
        return;
    }

    await db
        .delete(playbackProgress)
        .where(
            and(
                eq(playbackProgress.userId, userId),
                eq(playbackProgress.animeId, animeId),
            ),
        );
}

export async function getRecentPlaybackProgress(
    userId: string | undefined,
    limit = 24,
) {
    if (!userId) {
        return [];
    }

    return db
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
        .innerJoin(
            animeTable,
            eq(animeTable.id, playbackProgress.animeId),
        )
        .innerJoin(
            animeExternalIdLink,
            eq(
                animeExternalIdLink.animeId,
                playbackProgress.animeId,
            ),
        )
        .innerJoin(
            animeExternalId,
            eq(
                animeExternalId.id,
                animeExternalIdLink.externalIdId,
            ),
        )
        .leftJoin(
            animeDetailsCache,
            eq(
                animeDetailsCache.anilistId,
                animeExternalId.externalId,
            ),
        )
        .where(
            and(
                eq(playbackProgress.userId, userId),
                eq(animeExternalId.provider, 'anilist'),
                eq(animeExternalId.mediaType, 'anime'),
            ),
        )
        .orderBy(desc(playbackProgress.lastWatchedAt))
        .limit(Math.max(1, Math.min(limit, 50)));
}
