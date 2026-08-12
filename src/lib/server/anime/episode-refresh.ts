import { and, asc, eq, isNull, lte, notInArray, or, sql } from 'drizzle-orm';

import type { db } from '$lib/server/db';
import { animeEpisodeRefresh } from '$lib/server/db/schema';
import { episodeRefreshRetryDelay } from './episodes/policy';

const leaseDurationMs = 2 * 60 * 1_000;
const retiredRetentionMs = 90 * 24 * 60 * 60 * 1_000;

export interface EpisodeRefreshTarget {
    anilistId: number;
    targetEpisode: number;
}

interface ScheduledEpisodeRefresh extends EpisodeRefreshTarget {
    runAt: Date;
}

interface DrainOptions {
    concurrency?: number;
    timeBudgetMs?: number;
}

export function createEpisodeRefreshQueue(database: typeof db) {
    async function schedule(refreshes: ScheduledEpisodeRefresh[]) {
        if (!refreshes.length) {
            return;
        }

        await database
            .insert(animeEpisodeRefresh)
            .values(refreshes)
            .onConflictDoUpdate({
                target: [animeEpisodeRefresh.anilistId, animeEpisodeRefresh.targetEpisode],
                set: {
                    runAt: sql`least(${animeEpisodeRefresh.runAt}, excluded.run_at)`,
                },
            });
    }

    async function prune(anilistIds: number[]) {
        if (!anilistIds.length) {
            await database.delete(animeEpisodeRefresh);
            return;
        }

        await database
            .delete(animeEpisodeRefresh)
            .where(
                or(
                    notInArray(animeEpisodeRefresh.anilistId, anilistIds),
                    lte(animeEpisodeRefresh.retiredAt, new Date(Date.now() - retiredRetentionMs))
                )
            );
    }

    async function claim(limit: number) {
        const now = new Date();
        const candidates = await database
            .select({
                anilistId: animeEpisodeRefresh.anilistId,
                targetEpisode: animeEpisodeRefresh.targetEpisode,
                firstScheduledAt: animeEpisodeRefresh.firstScheduledAt,
                attempts: animeEpisodeRefresh.attempts,
            })
            .from(animeEpisodeRefresh)
            .where(
                and(
                    isNull(animeEpisodeRefresh.retiredAt),
                    lte(animeEpisodeRefresh.runAt, now),
                    or(
                        isNull(animeEpisodeRefresh.leaseUntil),
                        lte(animeEpisodeRefresh.leaseUntil, now)
                    )
                )
            )
            .orderBy(asc(animeEpisodeRefresh.runAt))
            .limit(limit * 2);
        const claimed: typeof candidates = [];

        for (const candidate of candidates) {
            const [row] = await database
                .update(animeEpisodeRefresh)
                .set({ leaseUntil: new Date(now.getTime() + leaseDurationMs) })
                .where(
                    and(
                        eq(animeEpisodeRefresh.anilistId, candidate.anilistId),
                        eq(animeEpisodeRefresh.targetEpisode, candidate.targetEpisode),
                        isNull(animeEpisodeRefresh.retiredAt),
                        lte(animeEpisodeRefresh.runAt, now),
                        or(
                            isNull(animeEpisodeRefresh.leaseUntil),
                            lte(animeEpisodeRefresh.leaseUntil, now)
                        )
                    )
                )
                .returning({ anilistId: animeEpisodeRefresh.anilistId });

            if (row) {
                claimed.push(candidate);
            }
            if (claimed.length === limit) {
                break;
            }
        }

        return claimed;
    }

    async function finish(
        refresh: Awaited<ReturnType<typeof claim>>[number],
        available: boolean,
        cause?: unknown
    ) {
        const identity = and(
            eq(animeEpisodeRefresh.anilistId, refresh.anilistId),
            eq(animeEpisodeRefresh.targetEpisode, refresh.targetEpisode)
        );

        if (available) {
            await database.delete(animeEpisodeRefresh).where(identity);
            return 'refreshed' as const;
        }

        const now = Date.now();
        const retryDelay = episodeRefreshRetryDelay(
            refresh.attempts,
            refresh.firstScheduledAt.getTime(),
            now
        );
        const lastError = cause instanceof Error ? cause.message : null;

        if (retryDelay === null) {
            await database
                .update(animeEpisodeRefresh)
                .set({
                    attempts: refresh.attempts + 1,
                    leaseUntil: null,
                    retiredAt: new Date(now),
                    lastError,
                })
                .where(identity);
            return 'retired' as const;
        }

        await database
            .update(animeEpisodeRefresh)
            .set({
                attempts: refresh.attempts + 1,
                runAt: new Date(now + retryDelay),
                leaseUntil: null,
                lastError,
            })
            .where(identity);
        return 'retried' as const;
    }

    async function drain(
        refresh: (target: EpisodeRefreshTarget) => Promise<boolean>,
        options: DrainOptions = {}
    ) {
        const concurrency = Math.max(1, Math.min(options.concurrency ?? 3, 5));
        const timeBudgetMs = Math.max(1_000, Math.min(options.timeBudgetMs ?? 15_000, 45_000));
        const deadline = Date.now() + timeBudgetMs;
        const totals = { claimed: 0, refreshed: 0, retried: 0, retired: 0 };

        while (Date.now() < deadline) {
            const claimed = await claim(concurrency);
            if (!claimed.length) {
                break;
            }

            totals.claimed += claimed.length;
            const outcomes = await Promise.all(
                claimed.map(async (target) => {
                    try {
                        return await finish(target, await refresh(target));
                    } catch (cause) {
                        return finish(target, false, cause);
                    }
                })
            );

            for (const outcome of outcomes) {
                totals[outcome] += 1;
            }
        }

        return totals;
    }

    return { schedule, prune, drain };
}
