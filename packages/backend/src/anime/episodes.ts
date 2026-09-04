import { and, eq } from 'drizzle-orm';

import { db } from '@arc/shared/db';
import { animeEpisode, animeEpisodeSync } from '@arc/shared/db/schema';
import type { AniListAnime } from '@arc/core';
import { storedEpisodes, storedRelatedReleaseTitles } from './episodes/model';
import { episodesAvailableToWatch, episodeMetadataRefreshRequired } from './episodes/policy';
import { episodeRevision } from './episodes/revision';

export async function getEpisodes(anime: AniListAnime) {
    // Page reads use the last verified provider inventory; the page operation
    // explicitly rediscovers only when the inventory or its metadata is incomplete.
    return episodesAvailableToWatch(await storedEpisodes(anime), anime);
}

export async function needsEpisodeMetadataRefresh(anilistId: number, metadataExternalIdId: number) {
    const [syncRows, episodeRows] = await Promise.all([
        db
            .select({
                metadataExternalIdId: animeEpisodeSync.metadataExternalIdId,
                metadataRevision: animeEpisodeSync.metadataRevision,
            })
            .from(animeEpisodeSync)
            .where(eq(animeEpisodeSync.anilistId, anilistId))
            .limit(1),
        db
            .select({
                image: animeEpisode.imageUrl,
                title: animeEpisode.metadataTitle,
                overview: animeEpisode.overview,
            })
            .from(animeEpisode)
            .where(eq(animeEpisode.anilistId, anilistId)),
    ]);

    return episodeMetadataRefreshRequired(
        episodeRows.map(({ image, title, overview }) => ({
            image,
            title: title ?? '',
            overview: overview ?? '',
        })),
        syncRows[0] ?? null,
        metadataExternalIdId
    );
}

export async function getStoredAiringSchedule(anilistId: number) {
    const [rows, confirmed] = await Promise.all([
        db
            .select({
                airingAt: animeEpisodeSync.nextAiringAt,
                episode: animeEpisodeSync.nextAiringEpisode,
            })
            .from(animeEpisodeSync)
            .where(eq(animeEpisodeSync.anilistId, anilistId))
            .limit(1),
        db
            .select({ episodeId: animeEpisode.episodeId })
            .from(animeEpisode)
            .innerJoin(animeEpisodeSync, eq(animeEpisodeSync.anilistId, animeEpisode.anilistId))
            .where(
                and(
                    eq(animeEpisode.anilistId, anilistId),
                    eq(animeEpisode.number, animeEpisodeSync.nextAiringEpisode)
                )
            )
            .limit(1),
    ]);
    const schedule = rows[0];

    if (!schedule) {
        return undefined;
    }
    if (!schedule.airingAt || !schedule.episode || confirmed.length) {
        return null;
    }

    return {
        airingAt: Math.floor(schedule.airingAt.getTime() / 1_000),
        episode: schedule.episode,
    };
}

export async function getEpisodeRevision(anilistId: number) {
    const [state] = await db
        .select({
            sourceRevision: animeEpisodeSync.sourceRevision,
            mediaStatus: animeEpisodeSync.mediaStatus,
            nextAiringAt: animeEpisodeSync.nextAiringAt,
            nextAiringEpisode: animeEpisodeSync.nextAiringEpisode,
            lastSuccessAt: animeEpisodeSync.lastSuccessAt,
        })
        .from(animeEpisodeSync)
        .where(eq(animeEpisodeSync.anilistId, anilistId))
        .limit(1);
    if (!state) {
        return null;
    }

    return episodeRevision(state);
}

export async function getRelatedReleaseTitles(anilistIds: number[]) {
    const ids = [...new Set(anilistIds)].filter((id) => Number.isSafeInteger(id) && id > 0);
    // Related titles are optional matching evidence. A watch request must not
    // discover and synchronize every adjacent release merely to obtain them.
    const stored = await storedRelatedReleaseTitles(ids);

    return stored.map(({ episodes }) => episodes);
}
