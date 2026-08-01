import { eq, isNull, lte, or } from 'drizzle-orm';
import { Effect } from 'effect';

import type { AnimeEpisode } from '$lib/anime/types';
import { db } from '$lib/server/db';
import { animeEpisodeSync } from '$lib/server/db/schema';
import { anilist } from './anilist';
import { storedEpisodes } from './episodes/model';
import { episodeRefreshReason } from './episodes/policy';
import { refreshEpisodes } from './episodes/sync';
import type { AniListAnime } from './episodes/types';
import { findMapping } from './tmdb/mapping-store';

export async function getEpisodes(
    anime: AniListAnime,
): Promise<AnimeEpisode[]> {
    const [stored, sync, metadataSource] = await Promise.all([
        storedEpisodes(anime),
        db
            .select({
                metadataExternalIdId:
                    animeEpisodeSync.metadataExternalIdId,
                nextRefreshAt: animeEpisodeSync.nextRefreshAt,
                lastError: animeEpisodeSync.lastError,
            })
            .from(animeEpisodeSync)
            .where(eq(animeEpisodeSync.anilistId, anime.id))
            .limit(1)
            .then((rows) => rows[0] ?? null),
        findMapping(anime.id).catch(() => null),
    ]);

    if (!stored.length) {
        if (
            sync?.lastError &&
            sync.nextRefreshAt &&
            sync.nextRefreshAt.getTime() > Date.now()
        ) {
            throw new Error(sync.lastError);
        }

        return refreshEpisodes(anime, metadataSource ?? undefined);
    }

    const reason = episodeRefreshReason(
        sync,
        metadataSource?.externalIdId ?? null,
    );

    if (reason === 'metadata-source' && metadataSource) {
        try {
            return await refreshEpisodes(anime, metadataSource);
        } catch (cause) {
            console.error(
                `Episode metadata source refresh failed for AniList ${anime.id}`,
                cause,
            );
            return stored;
        }
    }

    if (reason) {
        void refreshEpisodes(
            anime,
            metadataSource ?? undefined,
        ).catch((cause) =>
            console.error(
                `Episode refresh failed for AniList ${anime.id}`,
                cause,
            ),
        );
    }

    return stored;
}

async function refreshDue(limit = 20) {
    const due = await db
        .select({ anilistId: animeEpisodeSync.anilistId })
        .from(animeEpisodeSync)
        .where(
            or(
                isNull(animeEpisodeSync.nextRefreshAt),
                lte(animeEpisodeSync.nextRefreshAt, new Date()),
            ),
        )
        .limit(Math.max(1, Math.min(limit, 100)));
    const results = [];

    for (const { anilistId } of due) {
        try {
            const anime = await Effect.runPromise(
                anilist.getAnime(anilistId),
            );
            const episodes = await refreshEpisodes(anime);
            results.push({
                anilistId,
                episodes: episodes.length,
                ok: true,
            });
        } catch (cause) {
            results.push({
                anilistId,
                error:
                    cause instanceof Error
                        ? cause.message
                        : 'Refresh failed',
                ok: false,
            });
        }
    }

    return results;
}

export const episodes = {
    getEpisodes,
    refreshDue,
    refreshEpisodes,
};
