import { asc, and, eq, inArray } from 'drizzle-orm';

import { db } from '@arc/shared/db';
import { animeEpisode, animeEpisodeSync } from '@arc/shared/db/schema';
import { episodeMetadataRefreshRequired } from './episode-policy';
import { episodeRevision } from './episode-revision';

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
    return state ? episodeRevision(state) : null;
}

export async function getRelatedReleaseTitles(anilistIds: number[]) {
    const ids = [...new Set(anilistIds)].filter((id) => Number.isSafeInteger(id) && id > 0);
    if (!ids.length) {
        return [];
    }

    const rows = await db
        .select({
            anilistId: animeEpisode.anilistId,
            number: animeEpisode.number,
            title: animeEpisode.metadataTitle,
            titleSource: animeEpisode.metadataTitleSource,
        })
        .from(animeEpisode)
        .where(inArray(animeEpisode.anilistId, ids))
        .orderBy(asc(animeEpisode.anilistId), asc(animeEpisode.number));
    const releases = new Map<number, { number: number; title: string }[]>();

    for (const row of rows) {
        if (!row.titleSource || !row.title?.trim()) {
            continue;
        }

        const release = releases.get(row.anilistId) ?? [];
        release.push({ number: row.number, title: row.title });
        releases.set(row.anilistId, release);
    }

    return [...releases].map(([, episodes]) => episodes);
}
