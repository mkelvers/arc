import { and, eq, inArray, or } from 'drizzle-orm';

import { db } from '$lib/server/db';
import { animeEpisode, animeEpisodeSync, notificationInterest } from '$lib/server/db/schema';
import { notificationInventoryRefreshDue } from '$lib/server/notifications/inventory';
import { getAiringAnime } from './anilist/airing';
import { refreshAnime } from './anilist/details';
import { createEpisodeRefreshQueue, type EpisodeRefreshTarget } from './episode-refresh';
import { refreshEpisodes } from './episodes/sync';
import { getProactiveAnimeIds } from './interest';

const episodeRefreshQueue = createEpisodeRefreshQueue(db);

async function scheduleNotificationInventoryRefreshes() {
    const rows = await db
        .selectDistinct({
            anilistId: notificationInterest.anilistId,
            mediaStatus: animeEpisodeSync.mediaStatus,
            lastSuccessAt: animeEpisodeSync.lastSuccessAt,
            nextRefreshAt: animeEpisodeSync.nextRefreshAt,
        })
        .from(notificationInterest)
        .innerJoin(
            animeEpisodeSync,
            eq(animeEpisodeSync.anilistId, notificationInterest.anilistId)
        );
    const now = new Date();

    await episodeRefreshQueue.schedule(
        rows.flatMap((row) =>
            notificationInventoryRefreshDue(row, now.getTime())
                ? [{ anilistId: row.anilistId, targetEpisode: 0, runAt: now }]
                : []
        )
    );
}

export async function scanAiringAnime() {
    const proactiveIds = await getProactiveAnimeIds();
    const airing = await getAiringAnime(proactiveIds);

    const syncRows = proactiveIds.length
        ? await db
              .select({
                  anilistId: animeEpisodeSync.anilistId,
                  nextAiringAt: animeEpisodeSync.nextAiringAt,
                  nextAiringEpisode: animeEpisodeSync.nextAiringEpisode,
              })
              .from(animeEpisodeSync)
              .where(inArray(animeEpisodeSync.anilistId, proactiveIds))
        : [];
    const syncByAnime = new Map(syncRows.map((row) => [row.anilistId, row]));

    const targetEpisodes = airing.flatMap(({ id, episode }) => {
        const pendingEpisode = syncByAnime.get(id)?.nextAiringEpisode;
        return [
            ...(episode && episode > 1 ? [{ anilistId: id, number: episode - 1 }] : []),
            ...(pendingEpisode && pendingEpisode < (episode ?? Infinity)
                ? [{ anilistId: id, number: pendingEpisode }]
                : []),
        ];
    });
    const storedTargets = targetEpisodes.length
        ? await db
              .select({
                  anilistId: animeEpisode.anilistId,
                  number: animeEpisode.number,
              })
              .from(animeEpisode)
              .where(
                  or(
                      ...targetEpisodes.map(({ anilistId, number }) =>
                          and(
                              eq(animeEpisode.anilistId, anilistId),
                              eq(animeEpisode.number, number)
                          )
                      )
                  )
              )
        : [];
    const available = new Set(
        storedTargets.map(({ anilistId, number }) => `${anilistId}:${number}`)
    );

    for (const anime of airing) {
        const stored = syncByAnime.get(anime.id);
        const pendingEpisode =
            stored?.nextAiringEpisode &&
            anime.episode &&
            stored.nextAiringEpisode < anime.episode &&
            !available.has(`${anime.id}:${stored.nextAiringEpisode}`)
                ? stored.nextAiringEpisode
                : null;

        await db
            .insert(animeEpisodeSync)
            .values({
                anilistId: anime.id,
                mediaStatus: 'RELEASING',
                nextAiringAt:
                    pendingEpisode && stored?.nextAiringAt
                        ? stored.nextAiringAt
                        : anime.airingAt
                          ? new Date(anime.airingAt * 1_000)
                          : null,
                nextAiringEpisode: pendingEpisode ?? anime.episode,
            })
            .onConflictDoUpdate({
                target: animeEpisodeSync.anilistId,
                set: {
                    mediaStatus: 'RELEASING',
                    nextAiringAt:
                        pendingEpisode && stored?.nextAiringAt
                            ? stored.nextAiringAt
                            : anime.airingAt
                              ? new Date(anime.airingAt * 1_000)
                              : null,
                    nextAiringEpisode: pendingEpisode ?? anime.episode,
                },
            });
    }

    const scheduled = airing.map((anime) => {
        const stored = syncByAnime.get(anime.id);
        const pendingEpisode =
            stored?.nextAiringEpisode &&
            anime.episode &&
            stored.nextAiringEpisode < anime.episode &&
            !available.has(`${anime.id}:${stored.nextAiringEpisode}`)
                ? stored.nextAiringEpisode
                : null;
        const refreshEpisode =
            pendingEpisode ?? (anime.episode && anime.episode > 1 ? anime.episode - 1 : null);

        return {
            ...anime,
            airingAt:
                pendingEpisode && stored?.nextAiringAt
                    ? Math.floor(stored.nextAiringAt.getTime() / 1_000)
                    : anime.airingAt,
            episode: pendingEpisode ?? anime.episode,
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
    await scheduleNotificationInventoryRefreshes();

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
    if (targetEpisode === 0) {
        return (await refreshAiringAnime(anilistId)).episodeAvailable;
    }

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
