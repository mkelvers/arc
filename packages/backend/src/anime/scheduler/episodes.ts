import { and, asc, eq, isNull, lte, or } from 'drizzle-orm';

import { db } from '@arc/shared/db';
import { animeEpisodeTarget } from '@arc/shared/db/schema';
import { refreshAnimeSchedule, storedAnimeRelease } from '@arc/core/server';
import { confirmScheduledEpisode } from '../episodes/sync';
import { nextEpisodeAttemptAt } from './policy';
import { scheduleReleaseTargets } from './targets';
import { enqueueScheduleDiscovery } from './schedule-repair';

interface SchedulerLimits {
    concurrency: number;
    maxClaimedTargets: number;
    claimingWindowMs: number;
    leaseDurationMs: number;
    leaseRenewalMs: number;
}

type ClaimedTarget = {
    anilistId: number;
    targetEpisode: number;
    airingAt: Date;
    attemptCount: number;
    failureCount: number;
    leaseOwner: string;
};

async function claimTargets(runId: string, limit: number, leaseDurationMs: number) {
    const now = new Date();
    const candidates = await db
        .select({
            anilistId: animeEpisodeTarget.anilistId,
            targetEpisode: animeEpisodeTarget.targetEpisode,
            airingAt: animeEpisodeTarget.airingAt,
            attemptCount: animeEpisodeTarget.attemptCount,
            failureCount: animeEpisodeTarget.failureCount,
        })
        .from(animeEpisodeTarget)
        .where(
            and(
                eq(animeEpisodeTarget.state, 'pending'),
                lte(animeEpisodeTarget.nextAttemptAt, now),
                or(isNull(animeEpisodeTarget.leaseUntil), lte(animeEpisodeTarget.leaseUntil, now))
            )
        )
        .orderBy(asc(animeEpisodeTarget.nextAttemptAt))
        .limit(limit * 2);
    const claimed: ClaimedTarget[] = [];

    for (const candidate of candidates) {
        const leaseOwner = `${runId}:${candidate.anilistId}:${candidate.targetEpisode}`;
        const [row] = await db
            .update(animeEpisodeTarget)
            .set({
                leaseOwner,
                leaseUntil: new Date(Date.now() + leaseDurationMs),
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(animeEpisodeTarget.anilistId, candidate.anilistId),
                    eq(animeEpisodeTarget.targetEpisode, candidate.targetEpisode),
                    eq(animeEpisodeTarget.state, 'pending'),
                    lte(animeEpisodeTarget.nextAttemptAt, new Date()),
                    or(
                        isNull(animeEpisodeTarget.leaseUntil),
                        lte(animeEpisodeTarget.leaseUntil, new Date())
                    )
                )
            )
            .returning({ anilistId: animeEpisodeTarget.anilistId });
        if (row) {
            claimed.push({ ...candidate, leaseOwner });
        }
        if (claimed.length === limit) {
            break;
        }
    }

    return claimed;
}

async function retryTarget(target: ClaimedTarget, cause: unknown) {
    const now = new Date();
    const nextAttemptAt = nextEpisodeAttemptAt(target.airingAt, now);
    const message = cause instanceof Error ? cause.message : 'Episode provider check failed';
    await db
        .update(animeEpisodeTarget)
        .set({
            state: nextAttemptAt ? 'pending' : 'failed',
            attemptCount: target.attemptCount + 1,
            failureCount: target.failureCount + 1,
            nextAttemptAt: nextAttemptAt ?? now,
            lastError: message,
            leaseOwner: null,
            leaseUntil: null,
            updatedAt: now,
        })
        .where(
            and(
                eq(animeEpisodeTarget.anilistId, target.anilistId),
                eq(animeEpisodeTarget.targetEpisode, target.targetEpisode),
                eq(animeEpisodeTarget.state, 'pending'),
                eq(animeEpisodeTarget.leaseOwner, target.leaseOwner)
            )
        );
    return {
        outcome: nextAttemptAt ? ('retried' as const) : ('failed' as const),
        retryAt: nextAttemptAt,
    };
}

async function processTarget(target: ClaimedTarget, limits: SchedulerLimits) {
    let stopped = false;
    const renew = async () => {
        try {
            await db
                .update(animeEpisodeTarget)
                .set({
                    leaseUntil: new Date(Date.now() + limits.leaseDurationMs),
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(animeEpisodeTarget.anilistId, target.anilistId),
                        eq(animeEpisodeTarget.targetEpisode, target.targetEpisode),
                        eq(animeEpisodeTarget.state, 'pending'),
                        eq(animeEpisodeTarget.leaseOwner, target.leaseOwner)
                    )
                );
        } catch {}
    };
    const timer = setInterval(() => {
        if (!stopped) {
            void renew();
        }
    }, limits.leaseRenewalMs);

    try {
        const release = await storedAnimeRelease(target.anilistId);
        if (!release) {
            throw new Error(`Permanent release ${target.anilistId} is unavailable`);
        }
        await confirmScheduledEpisode(
            release,
            target.targetEpisode,
            target.leaseOwner,
            target.airingAt
        );

        try {
            await refreshAnimeSchedule(target.anilistId);
            await scheduleReleaseTargets([target.anilistId]);
        } catch (cause) {
            await enqueueScheduleDiscovery(target.anilistId, target.targetEpisode, cause);
        }
        return { outcome: 'confirmed' as const, retryAt: null, cause: undefined };
    } catch (cause) {
        return { ...(await retryTarget(target, cause)), cause };
    } finally {
        stopped = true;
        clearInterval(timer);
    }
}

export async function drainEpisodeTargets(runId: string, limits: SchedulerLimits) {
    const deadline = Date.now() + limits.claimingWindowMs;
    const totals = { claimed: 0, confirmed: 0, retried: 0, failed: 0 };

    while (Date.now() < deadline && totals.claimed < limits.maxClaimedTargets) {
        const available = Math.min(limits.concurrency, limits.maxClaimedTargets - totals.claimed);
        const claimed = await claimTargets(runId, available, limits.leaseDurationMs);
        if (!claimed.length) {
            break;
        }

        totals.claimed += claimed.length;
        const outcomes = await Promise.all(
            claimed.map(async (target) => {
                return processTarget(target, limits);
            })
        );
        for (const outcome of outcomes) {
            totals[outcome.outcome === 'confirmed' ? 'confirmed' : outcome.outcome] += 1;
        }
    }

    return totals;
}
