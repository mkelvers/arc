import { and, eq, inArray, notInArray } from 'drizzle-orm';

import { db } from '@arc/shared/db';
import { animeEpisodeSync, animeRelease, animeReleaseRequest } from '@arc/shared/db/schema';
import { discoverAiringAnime } from '../anilist/airing';
import { airingTargetSchedules } from './airing-policy';
import { scheduleAiringTargets, scheduleReleaseTargets } from './targets';

async function enqueueReleaseRequests(anilistIds: number[]) {
    const ids = [...new Set(anilistIds)];
    if (!ids.length) {
        return 0;
    }

    return db
        .insert(animeReleaseRequest)
        .values(ids.map((anilistId) => ({ anilistId, nextAttemptAt: new Date() })))
        .onConflictDoNothing()
        .returning({ anilistId: animeReleaseRequest.anilistId })
        .then((rows) => rows.length);
}

export async function reconcileAllAiringReleases(now = new Date()) {
    const snapshot = await discoverAiringAnime(now);
    const discoveredIds = snapshot.map(({ id }) => id);
    const stored = discoveredIds.length
        ? await db
              .select({
                  anilistId: animeRelease.anilistId,
                  data: animeRelease.data,
              })
              .from(animeRelease)
              .where(inArray(animeRelease.anilistId, discoveredIds))
        : [];
    const storedById = new Map(stored.map((release) => [release.anilistId, release]));
    const noLongerAiring = await db
        .select({ anilistId: animeRelease.anilistId })
        .from(animeRelease)
        .where(
            discoveredIds.length
                ? and(
                      eq(animeRelease.status, 'RELEASING'),
                      notInArray(animeRelease.anilistId, discoveredIds)
                  )
                : eq(animeRelease.status, 'RELEASING')
        );

    // Preserve a target for a previously known airing before accepting a newer AniList schedule.
    const previousTargets = await scheduleReleaseTargets(discoveredIds);

    await db.transaction(async (tx) => {
        for (const release of snapshot) {
            if (!storedById.has(release.id)) {
                continue;
            }

            const nextAiringAt = release.nextAiringAt
                ? new Date(release.nextAiringAt * 1_000)
                : null;
            await tx
                .update(animeRelease)
                .set({
                    status: 'RELEASING',
                    nextAiringAt,
                    nextAiringEpisode: release.nextAiringEpisode,
                    updatedAt: now,
                })
                .where(eq(animeRelease.anilistId, release.id));
            await tx
                .insert(animeEpisodeSync)
                .values({
                    anilistId: release.id,
                    mediaStatus: 'RELEASING',
                    nextAiringAt,
                    nextAiringEpisode: release.nextAiringEpisode,
                })
                .onConflictDoUpdate({
                    target: animeEpisodeSync.anilistId,
                    set: {
                        mediaStatus: 'RELEASING',
                        nextAiringAt,
                        nextAiringEpisode: release.nextAiringEpisode,
                    },
                });
        }
    });

    const missingReleaseIds = discoveredIds.filter((id) => !storedById.get(id)?.data);
    const releaseRequests = await enqueueReleaseRequests([
        ...missingReleaseIds,
        ...noLongerAiring.map(({ anilistId }) => anilistId),
    ]);

    const latestTargets = await scheduleAiringTargets(airingTargetSchedules(snapshot));
    return {
        discovered: snapshot.length,
        releaseRequests,
        targets: (previousTargets ?? 0) + latestTargets,
        snapshot,
    };
}
