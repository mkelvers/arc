import { and, eq } from 'drizzle-orm';

import type { AnimeEpisode } from '$lib/types';
import { db } from '@arc/db';
import { animeEpisode, animeEpisodeSync } from '@arc/db/schema';
import type { AniListAnime } from './anilist/types';
import { storedEpisodes, storedRelatedReleaseTitles } from './episodes/model';
import {
    availableEpisodeCount,
    classificationRefreshDue,
    episodeMetadataNeedsRefresh,
    episodeRefreshReason,
    providerEpisodeCount,
} from './episodes/policy';
import { refreshEpisodes } from './episodes/sync';
import { coversExpectedEpisodes } from './providers/match';
import { findMapping } from './tmdb/mapping-store';

export async function getEpisodes(anime: AniListAnime): Promise<AnimeEpisode[]> {
    const [stored, sync, metadataSource] = await Promise.all([
        storedEpisodes(anime),
        db
            .select({
                metadataExternalIdId: animeEpisodeSync.metadataExternalIdId,
                nextRefreshAt: animeEpisodeSync.nextRefreshAt,
                lastError: animeEpisodeSync.lastError,
                nextAiringAt: animeEpisodeSync.nextAiringAt,
                nextAiringEpisode: animeEpisodeSync.nextAiringEpisode,
                classificationRevision: animeEpisodeSync.classificationRevision,
                classificationsRefreshedAt: animeEpisodeSync.classificationsRefreshedAt,
            })
            .from(animeEpisodeSync)
            .where(eq(animeEpisodeSync.anilistId, anime.id))
            .limit(1)
            .then((rows) => rows[0] ?? null),
        findMapping(anime.id).catch(() => null),
    ]);

    const incompleteFinishedRelease =
        anime.status === 'FINISHED' && !coversExpectedEpisodes(stored, providerEpisodeCount(anime));
    const persistedAiredEpisodes =
        anime.status === 'RELEASING' &&
        sync?.nextAiringAt &&
        sync.nextAiringAt.getTime() <= Date.now() &&
        sync.nextAiringEpisode
            ? sync.nextAiringEpisode
            : 0;
    const availableEpisodes = Math.max(availableEpisodeCount(anime) ?? 0, persistedAiredEpisodes);
    const incompleteReleasingRelease =
        availableEpisodes > 0 && !coversExpectedEpisodes(stored, availableEpisodes);
    const incompleteMetadata = episodeMetadataNeedsRefresh(
        stored,
        sync?.metadataExternalIdId !== null && sync?.metadataExternalIdId !== undefined
    );
    const classificationsNeedRefresh =
        stored.length > 0 &&
        classificationRefreshDue(
            sync?.classificationsRefreshedAt,
            anime.status,
            sync?.classificationRevision
        );
    if (
        !stored.length ||
        incompleteFinishedRelease ||
        incompleteReleasingRelease ||
        incompleteMetadata ||
        classificationsNeedRefresh
    ) {
        const refreshDeferred = sync?.nextRefreshAt && sync.nextRefreshAt.getTime() > Date.now();
        if (incompleteMetadata || classificationsNeedRefresh) {
            try {
                return await refreshEpisodes(anime, metadataSource ?? undefined);
            } catch (cause) {
                console.error(
                    `${classificationsNeedRefresh ? 'Episode classification' : 'Stale episode metadata'} refresh failed for AniList ${anime.id}`,
                    cause
                );
                return stored;
            }
        }

        if (refreshDeferred) {
            if (anime.status === 'NOT_YET_RELEASED') {
                return stored;
            }
            if (sync.lastError) {
                throw new Error(sync.lastError);
            }
        }

        try {
            return await refreshEpisodes(anime, metadataSource ?? undefined);
        } catch (cause) {
            if (stored.length) {
                console.error(`Episode refresh failed for AniList ${anime.id}`, cause);
                return stored;
            }

            throw cause;
        }
    }

    const reason = episodeRefreshReason(sync, metadataSource?.externalIdId ?? null);

    if (reason === 'metadata-source' && metadataSource) {
        try {
            return await refreshEpisodes(anime, metadataSource);
        } catch (cause) {
            console.error(`Episode metadata source refresh failed for AniList ${anime.id}`, cause);
            return stored;
        }
    }

    if (reason) {
        void refreshEpisodes(anime, metadataSource ?? undefined).catch((cause) =>
            console.error(`Episode refresh failed for AniList ${anime.id}`, cause)
        );
    }

    return stored;
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

    if (!schedule?.airingAt || !schedule.episode || confirmed.length) {
        return null;
    }

    return {
        airingAt: Math.floor(schedule.airingAt.getTime() / 1_000),
        episode: schedule.episode,
    };
}

export async function getEpisodeRevision(anilistId: number) {
    return db
        .select({ revision: animeEpisodeSync.sourceRevision })
        .from(animeEpisodeSync)
        .where(eq(animeEpisodeSync.anilistId, anilistId))
        .limit(1)
        .then((rows) => rows[0]?.revision ?? null);
}

export async function getRelatedReleaseTitles(anilistIds: number[]) {
    const ids = [...new Set(anilistIds)].filter((id) => Number.isSafeInteger(id) && id > 0);
    // Related titles are optional matching evidence. A watch request must not
    // discover and synchronize every adjacent release merely to obtain them.
    const stored = await storedRelatedReleaseTitles(ids);

    return stored.map(({ episodes }) => episodes);
}
