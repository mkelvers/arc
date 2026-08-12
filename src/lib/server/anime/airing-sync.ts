import { and, eq, inArray } from 'drizzle-orm';

import { db } from '$lib/server/db';
import { animeEpisode, animeEpisodeSync } from '$lib/server/db/schema';
import { getAiringAnime } from './anilist/airing';
import { refreshAnime } from './anilist/details';
import { createEpisodeRefreshQueue, type EpisodeRefreshTarget } from './episode-refresh';
import { refreshEpisodes } from './episodes/sync';
import { getProactiveAnimeIds } from './interest';

const episodeRefreshQueue = createEpisodeRefreshQueue(db);

export async function scanAiringAnime() {
    const proactiveIds = await getProactiveAnimeIds();
    const airing = await getAiringAnime(proactiveIds);

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

    const scheduled = airing.map((anime) => {
        const refreshEpisode = anime.episode && anime.episode > 1 ? anime.episode - 1 : null;

        return {
            ...anime,
            refreshNow: refreshEpisode !== null && !available.has(`${anime.id}:${refreshEpisode}`),
            refreshEpisode,
        };
    });

    const refreshes = scheduled.flatMap((anime) => {
        const rows: Array<{ anilistId: number; targetEpisode: number; runAt: Date }> = [];

        if (anime.refreshNow && anime.refreshEpisode) {
            rows.push({
                anilistId: anime.id,
                targetEpisode: anime.refreshEpisode,
                runAt: new Date(),
            });
        }
        if (anime.airingAt && anime.episode) {
            rows.push({
                anilistId: anime.id,
                targetEpisode: anime.episode,
                runAt: new Date(anime.airingAt * 1_000 + 10 * 60 * 1_000),
            });
        }

        return rows;
    });

    await episodeRefreshQueue.schedule(refreshes);

    return scheduled;
}

async function refreshAiringAnime(anilistId: number, targetEpisode?: number) {
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

    const episodeAvailable =
        providerInventoryAvailable &&
        (targetEpisode === undefined || episodes.some(({ number }) => number === targetEpisode));

    await db
        .update(animeEpisodeSync)
        .set({
            mediaStatus: anime.status,
            ...(episodeAvailable
                ? {
                      nextAiringAt: anime.nextAiringEpisode
                          ? new Date(anime.nextAiringEpisode.airingAt * 1_000)
                          : null,
                      nextAiringEpisode: anime.nextAiringEpisode?.episode ?? null,
                  }
                : {}),
        })
        .where(eq(animeEpisodeSync.anilistId, anilistId));

    return {
        episodeAvailable,
        mediaStatus: anime.status,
        nextAiringAt: anime.nextAiringEpisode?.airingAt ?? null,
        nextAiringEpisode: anime.nextAiringEpisode?.episode ?? null,
    };
}

async function refreshScheduledEpisode({ anilistId, targetEpisode }: EpisodeRefreshTarget) {
    const stored = await db
        .select({ episodeId: animeEpisode.episodeId })
        .from(animeEpisode)
        .where(and(eq(animeEpisode.anilistId, anilistId), eq(animeEpisode.number, targetEpisode)))
        .limit(1);

    if (stored.length) {
        return true;
    }

    return (await refreshAiringAnime(anilistId, targetEpisode)).episodeAvailable;
}

export async function refreshScheduledEpisodes() {
    await episodeRefreshQueue.prune(await getProactiveAnimeIds());
    return episodeRefreshQueue.drain(refreshScheduledEpisode);
}
