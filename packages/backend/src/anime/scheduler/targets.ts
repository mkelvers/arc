import { and, eq, exists, inArray, ne, not, sql } from 'drizzle-orm';

import { db } from '@arc/db';
import { animeEpisodeTarget, animeRelease, animeReleaseInterest } from '@arc/db/schema';
import { firstEpisodeAttemptAt } from './policy';

export async function scheduleInterestedTargets(anilistIds: number[]) {
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

    for (const release of releases) {
        if (
            (release.status !== 'RELEASING' && release.status !== 'NOT_YET_RELEASED') ||
            !release.airingAt ||
            !release.episode
        ) {
            await db
                .update(animeEpisodeTarget)
                .set({
                    state: 'retired',
                    retiredAt: new Date(),
                    leaseOwner: null,
                    leaseUntil: null,
                })
                .where(
                    and(
                        eq(animeEpisodeTarget.anilistId, release.anilistId),
                        eq(animeEpisodeTarget.state, 'pending')
                    )
                );
            continue;
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
                    nextAttemptAt: sql`case
                        when ${animeEpisodeTarget.state} = 'retired'
                            then least(${animeEpisodeTarget.nextAttemptAt}, excluded.next_attempt_at)
                        else ${animeEpisodeTarget.nextAttemptAt}
                    end`,
                    state: sql`case
                        when ${animeEpisodeTarget.state} = 'retired' then 'pending'::anime_episode_target_state
                        else ${animeEpisodeTarget.state}
                    end`,
                    retiredAt: sql`case
                        when ${animeEpisodeTarget.state} = 'retired' then null
                        else ${animeEpisodeTarget.retiredAt}
                    end`,
                },
            });
    }
}

export async function retireUninterestedTargets() {
    await db
        .update(animeEpisodeTarget)
        .set({ state: 'retired', retiredAt: new Date(), leaseOwner: null, leaseUntil: null })
        .where(
            and(
                ne(animeEpisodeTarget.state, 'confirmed'),
                ne(animeEpisodeTarget.state, 'failed'),
                not(
                    exists(
                        db
                            .select({ value: sql`1` })
                            .from(animeReleaseInterest)
                            .where(
                                eq(
                                    animeReleaseInterest.trackedAnilistId,
                                    animeEpisodeTarget.anilistId
                                )
                            )
                    )
                )
            )
        );
}
