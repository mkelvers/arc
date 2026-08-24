import { and, eq } from 'drizzle-orm';

import type { AnimeEpisode } from '@arc/shared/types';
import { db } from '@arc/db';
import { animeEpisode, animeEpisodeSync } from '@arc/db/schema';
import type { AniListAnime } from './anilist/types';
import { storedEpisodes, storedRelatedReleaseTitles } from './episodes/model';

export async function getEpisodes(anime: AniListAnime) {
    return storedEpisodes(anime);
}

export function withMovieBackdrop(
    anime: Pick<AniListAnime, 'format'>,
    episodes: AnimeEpisode[],
    backdrop: string | null | undefined
) {
    if (anime.format !== 'MOVIE' || !backdrop) {
        return episodes;
    }

    return episodes.map((episode) => ({ ...episode, image: backdrop }));
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
