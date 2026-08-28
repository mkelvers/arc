import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@arc/db';
import { animeEpisode, animeEpisodeSync, animeEpisodeTarget, animeRelease } from '@arc/db/schema';
import { episodeInventoryCoversTarget } from '../episodes/policy';
import { firstEpisodeAttemptAt } from './policy';
import { enqueueScheduleDiscovery } from './schedule-repair';

interface AiringTargetSchedule {
    anilistId: number;
    episode: number;
    airingAt: Date;
}

interface SchedulableRelease extends AiringTargetSchedule {
    expectedEpisodes: number | null;
}

async function scheduleTarget(release: SchedulableRelease, discoverNextSchedule: boolean) {
    const [[storedTarget], inventory] = await Promise.all([
        db
            .select({
                episodeId: animeEpisode.episodeId,
                inventoryRevision: animeEpisodeSync.sourceRevision,
                targetState: animeEpisodeTarget.state,
            })
            .from(animeEpisode)
            .leftJoin(animeEpisodeSync, eq(animeEpisodeSync.anilistId, animeEpisode.anilistId))
            .leftJoin(
                animeEpisodeTarget,
                and(
                    eq(animeEpisodeTarget.anilistId, animeEpisode.anilistId),
                    eq(animeEpisodeTarget.targetEpisode, release.episode)
                )
            )
            .where(
                and(
                    eq(animeEpisode.anilistId, release.anilistId),
                    eq(animeEpisode.number, release.episode)
                )
            )
            .limit(1),
        db
            .select({ number: animeEpisode.number })
            .from(animeEpisode)
            .where(eq(animeEpisode.anilistId, release.anilistId)),
    ]);
    if (
        storedTarget?.episodeId.trim() &&
        episodeInventoryCoversTarget(inventory, release.episode)
    ) {
        if (storedTarget.targetState === 'confirmed') {
            return false;
        }
        const confirmedAt = new Date();
        await db
            .insert(animeEpisodeTarget)
            .values({
                anilistId: release.anilistId,
                targetEpisode: release.episode,
                expectedEpisodes: release.expectedEpisodes,
                airingAt: release.airingAt,
                nextAttemptAt: confirmedAt,
                state: 'confirmed',
                inventoryRevision: storedTarget.inventoryRevision,
                confirmedAt,
            })
            .onConflictDoUpdate({
                target: [animeEpisodeTarget.anilistId, animeEpisodeTarget.targetEpisode],
                set: {
                    expectedEpisodes: release.expectedEpisodes,
                    airingAt: release.airingAt,
                    state: 'confirmed',
                    inventoryRevision: storedTarget.inventoryRevision,
                    confirmedAt,
                    leaseOwner: null,
                    leaseUntil: null,
                    lastError: null,
                    retiredAt: null,
                },
            });
        if (discoverNextSchedule) {
            await enqueueScheduleDiscovery(release.anilistId, release.episode);
        }
        return true;
    }

    const firstAttempt = firstEpisodeAttemptAt(release.airingAt);
    await db
        .insert(animeEpisodeTarget)
        .values({
            anilistId: release.anilistId,
            targetEpisode: release.episode,
            expectedEpisodes: release.expectedEpisodes,
            airingAt: release.airingAt,
            nextAttemptAt: firstAttempt,
        })
        .onConflictDoUpdate({
            target: [animeEpisodeTarget.anilistId, animeEpisodeTarget.targetEpisode],
            set: {
                expectedEpisodes: release.expectedEpisodes,
                airingAt: release.airingAt,
                nextAttemptAt: sql`least(${animeEpisodeTarget.nextAttemptAt}, excluded.next_attempt_at)`,
                state: sql`case
                    when ${animeEpisodeTarget.state} in ('confirmed', 'retired')
                        then 'pending'::anime_episode_target_state
                    else ${animeEpisodeTarget.state}
                end`,
                confirmedAt: sql`case
                    when ${animeEpisodeTarget.state} = 'confirmed' then null
                    else ${animeEpisodeTarget.confirmedAt}
                end`,
                inventoryRevision: sql`case
                    when ${animeEpisodeTarget.state} = 'confirmed' then null
                    else ${animeEpisodeTarget.inventoryRevision}
                end`,
                retiredAt: sql`case
                    when ${animeEpisodeTarget.state} = 'retired' then null
                    else ${animeEpisodeTarget.retiredAt}
                end`,
                leaseOwner: sql`case
                    when ${animeEpisodeTarget.state} in ('confirmed', 'retired') then null
                    else ${animeEpisodeTarget.leaseOwner}
                end`,
                leaseUntil: sql`case
                    when ${animeEpisodeTarget.state} in ('confirmed', 'retired') then null
                    else ${animeEpisodeTarget.leaseUntil}
                end`,
            },
        });
    return true;
}

export async function scheduleAiringTargets(
    schedules: AiringTargetSchedule[],
    options: { discoverNextSchedule?: boolean } = {}
) {
    const uniqueSchedules = [
        ...new Map(
            schedules.map((schedule) => [`${schedule.anilistId}:${schedule.episode}`, schedule])
        ).values(),
    ];
    if (!uniqueSchedules.length) {
        return 0;
    }

    const releases = await db
        .select({
            anilistId: animeRelease.anilistId,
            expectedEpisodes: animeRelease.episodeCount,
            data: animeRelease.data,
        })
        .from(animeRelease)
        .where(
            inArray(
                animeRelease.anilistId,
                uniqueSchedules.map(({ anilistId }) => anilistId)
            )
        );
    const available = new Map(
        releases.flatMap((release) => (release.data ? [[release.anilistId, release] as const] : []))
    );
    let scheduled = 0;

    for (const schedule of uniqueSchedules) {
        const release = available.get(schedule.anilistId);
        if (!release) {
            continue;
        }
        const changed = await scheduleTarget(
            { ...schedule, expectedEpisodes: release.expectedEpisodes },
            options.discoverNextSchedule ?? false
        );
        scheduled += Number(changed);
    }

    return scheduled;
}

export async function scheduleReleaseTargets(anilistIds: number[]) {
    const ids = [...new Set(anilistIds)];
    if (!ids.length) {
        return;
    }

    const releases = await db
        .select({
            anilistId: animeRelease.anilistId,
            status: animeRelease.status,
            expectedEpisodes: animeRelease.episodeCount,
            airingAt: animeRelease.nextAiringAt,
            episode: animeRelease.nextAiringEpisode,
        })
        .from(animeRelease)
        .where(inArray(animeRelease.anilistId, ids));

    return scheduleAiringTargets(
        releases.flatMap((release) =>
            (release.status === 'RELEASING' || release.status === 'NOT_YET_RELEASED') &&
            release.airingAt &&
            release.episode
                ? [
                      {
                          anilistId: release.anilistId,
                          episode: release.episode,
                          airingAt: release.airingAt,
                      },
                  ]
                : []
        ),
        { discoverNextSchedule: true }
    );
}
