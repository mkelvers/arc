import { eq } from 'drizzle-orm';

import type { AnimeEpisode } from '$lib/anime/types';
import { db } from '$lib/server/db';
import { animeEpisodeSync } from '$lib/server/db/schema';
import type { AniListAnime } from './anilist/types';
import { storedEpisodes, storedRelatedReleaseTitles } from './episodes/model';
import { episodeRefreshReason } from './episodes/policy';
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
            })
            .from(animeEpisodeSync)
            .where(eq(animeEpisodeSync.anilistId, anime.id))
            .limit(1)
            .then((rows) => rows[0] ?? null),
        findMapping(anime.id).catch(() => null),
    ]);

    const incompleteFinishedRelease =
        anime.status === 'FINISHED' && !coversExpectedEpisodes(stored, anime.episodes);
    if (!stored.length || incompleteFinishedRelease) {
        const refreshDeferred = sync?.nextRefreshAt && sync.nextRefreshAt.getTime() > Date.now();
        if (refreshDeferred) {
            if (anime.status === 'NOT_YET_RELEASED') {
                return stored;
            }
            if (sync.lastError) {
                throw new Error(sync.lastError);
            }
        }

        return refreshEpisodes(anime, metadataSource ?? undefined);
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
