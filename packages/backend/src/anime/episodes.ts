import { createHash } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import { db } from '@arc/db';
import { animeEpisode, animeEpisodeSync } from '@arc/db/schema';
import type { AniListAnime } from './anilist/types';
import { storedEpisodes, storedRelatedReleaseTitles } from './episodes/model';
import { episodeInventoryNeedsDiscovery, episodesAvailableToWatch } from './episodes/policy';
import { discoverEpisodeInventory, TargetEpisodeUnavailableError } from './episodes/sync';

export { withMovieBackdrop } from './movie-backdrop';

export async function getEpisodes(anime: AniListAnime) {
    const [stored, sync] = await Promise.all([
        storedEpisodes(anime),
        db
            .select({ nextRefreshAt: animeEpisodeSync.nextRefreshAt })
            .from(animeEpisodeSync)
            .where(eq(animeEpisodeSync.anilistId, anime.id))
            .limit(1)
            .then(([state]) => state ?? null),
    ]);
    if (!episodeInventoryNeedsDiscovery(anime, stored, sync?.nextRefreshAt)) {
        return episodesAvailableToWatch(stored, anime);
    }

    return discoverEpisodeInventory(anime)
        .then((episodes) => episodesAvailableToWatch(episodes, anime))
        .catch((cause) => {
            if (cause instanceof TargetEpisodeUnavailableError && stored.length) {
                return episodesAvailableToWatch(stored, anime);
            }
            throw cause;
        });
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
        })
        .from(animeEpisodeSync)
        .where(eq(animeEpisodeSync.anilistId, anilistId))
        .limit(1);
    if (!state) {
        return null;
    }

    return createHash('sha256')
        .update(
            JSON.stringify({
                sourceRevision: state.sourceRevision,
                mediaStatus: state.mediaStatus,
                nextAiringAt: state.nextAiringAt?.toISOString() ?? null,
                nextAiringEpisode: state.nextAiringEpisode,
            })
        )
        .digest('hex');
}

export async function getRelatedReleaseTitles(anilistIds: number[]) {
    const ids = [...new Set(anilistIds)].filter((id) => Number.isSafeInteger(id) && id > 0);
    // Related titles are optional matching evidence. A watch request must not
    // discover and synchronize every adjacent release merely to obtain them.
    const stored = await storedRelatedReleaseTitles(ids);

    return stored.map(({ episodes }) => episodes);
}
