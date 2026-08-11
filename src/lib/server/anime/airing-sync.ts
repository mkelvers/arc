import { and, eq, inArray } from 'drizzle-orm';

import { db } from '$lib/server/db';
import { animeEpisode, animeEpisodeSync } from '$lib/server/db/schema';
import { getAiringAnime } from './anilist/airing';
import { refreshAnime } from './anilist/details';
import { refreshEpisodes } from './episodes/sync';

export async function scanAiringAnime() {
    const airing = await getAiringAnime();

    for (const anime of airing) {
        await db
            .insert(animeEpisodeSync)
            .values({
                anilistId: anime.id,
                mediaStatus: 'RELEASING',
                nextAiringAt: anime.airingAt ? new Date(anime.airingAt * 1_000) : null,
                nextAiringEpisode: anime.episode,
            })
            .onConflictDoUpdate({
                target: animeEpisodeSync.anilistId,
                set: {
                    mediaStatus: 'RELEASING',
                    nextAiringAt: anime.airingAt ? new Date(anime.airingAt * 1_000) : null,
                    nextAiringEpisode: anime.episode,
                },
            });
    }

    const targetEpisodes = airing.flatMap(({ id, episode }) =>
        episode && episode > 1 ? [{ anilistId: id, number: episode - 1 }] : []
    );
    const storedTargets = targetEpisodes.length
        ? await db
              .select({
                  anilistId: animeEpisode.anilistId,
                  number: animeEpisode.number,
              })
              .from(animeEpisode)
              .where(
                  and(
                      inArray(
                          animeEpisode.anilistId,
                          targetEpisodes.map(({ anilistId }) => anilistId)
                      ),
                      inArray(
                          animeEpisode.number,
                          targetEpisodes.map(({ number }) => number)
                      )
                  )
              )
        : [];
    const available = new Set(
        storedTargets.map(({ anilistId, number }) => `${anilistId}:${number}`)
    );

    return airing.map((anime) => {
        const refreshEpisode = anime.episode && anime.episode > 1 ? anime.episode - 1 : null;

        return {
            ...anime,
            refreshNow: refreshEpisode !== null && !available.has(`${anime.id}:${refreshEpisode}`),
            refreshEpisode,
        };
    });
}

export async function refreshAiringAnime(anilistId: number, targetEpisode?: number) {
    const anime = await refreshAnime(anilistId);
    let episodes: Awaited<ReturnType<typeof refreshEpisodes>> = [];
    let providerInventoryAvailable = true;

    try {
        episodes = await refreshEpisodes(anime);
    } catch (cause) {
        if (
            cause instanceof Error &&
            cause.message.startsWith('No playback provider returned episodes')
        ) {
            providerInventoryAvailable = false;
        } else {
            throw cause;
        }
    }

    await db
        .update(animeEpisodeSync)
        .set({
            mediaStatus: anime.status,
            nextAiringAt: anime.nextAiringEpisode
                ? new Date(anime.nextAiringEpisode.airingAt * 1_000)
                : null,
            nextAiringEpisode: anime.nextAiringEpisode?.episode ?? null,
        })
        .where(eq(animeEpisodeSync.anilistId, anilistId));

    return {
        episodeAvailable:
            providerInventoryAvailable &&
            (targetEpisode === undefined ||
                episodes.some(({ number }) => number === targetEpisode)),
        mediaStatus: anime.status,
        nextAiringAt: anime.nextAiringEpisode?.airingAt ?? null,
        nextAiringEpisode: anime.nextAiringEpisode?.episode ?? null,
    };
}
