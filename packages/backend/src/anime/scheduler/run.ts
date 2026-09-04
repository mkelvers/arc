import { randomUUID } from 'node:crypto';

import { and, count, eq, gt, isNotNull, isNull, lte, or } from 'drizzle-orm';

import { db } from '@arc/shared/db';
import {
    animeEpisodeTarget,
    animeReleaseRequest,
    anilistRequestState,
    maintenanceTask,
    schedulerHeartbeat,
} from '@arc/shared/db/schema';
import { refreshAnimeRelease } from '../anilist/releases';
import { GraphQLRequestError } from '../../graphql';
import { drainEpisodeTargets } from './episodes';
import { refreshCatalogSnapshots } from './catalog';
import { drainMaintenanceTasks } from './maintenance';
import { reconcileAllAiringReleases } from './reconciliation';
import { refreshReleaseCalendar } from './catalog';
import { scheduleReleaseTargets } from './targets';
import { schedulerPolicy, schedulerRunLease } from './policy';
import { enqueueUnresolvedAnimeInterests, reconcileAnimeInterests } from './interests';

const heartbeatName = 'anime-scheduler';

async function refreshDueReleases(limit: number) {
    const rows = await db
        .select({ anilistId: animeReleaseRequest.anilistId })
        .from(animeReleaseRequest)
        .where(
            and(
                lte(animeReleaseRequest.nextAttemptAt, new Date()),
                or(
                    isNull(animeReleaseRequest.leaseUntil),
                    lte(animeReleaseRequest.leaseUntil, new Date())
                )
            )
        )
        .limit(limit);
    const results = await Promise.all(
        rows.map(async ({ anilistId }) => {
            try {
                await refreshAnimeRelease(anilistId, { force: true });
                return { ok: true as const };
            } catch (cause) {
                return { ok: false as const, cause };
            }
        })
    );
    const refreshedIds = rows.flatMap((row, index) => (results[index]?.ok ? [row.anilistId] : []));
    await scheduleReleaseTargets(refreshedIds);
    return {
        attempted: rows.length,
        completed: results.filter(({ ok }) => ok).length,
        failed: results.filter(({ ok }) => !ok).length,
    };
}

async function fullReconciliationDue(intervalMs: number) {
    const [heartbeat] = await db
        .select({
            completedAt: schedulerHeartbeat.lastFullReconciliationAt,
            nextAttemptAt: schedulerHeartbeat.nextFullReconciliationAt,
        })
        .from(schedulerHeartbeat)
        .where(eq(schedulerHeartbeat.name, heartbeatName))
        .limit(1);
    if (heartbeat?.nextAttemptAt) {
        return heartbeat.nextAttemptAt.getTime() <= Date.now();
    }
    return !heartbeat?.completedAt || Date.now() - heartbeat.completedAt.getTime() >= intervalMs;
}

async function catalogRefreshDue() {
    const [heartbeat] = await db
        .select({ nextAttemptAt: schedulerHeartbeat.nextCatalogRefreshAt })
        .from(schedulerHeartbeat)
        .where(eq(schedulerHeartbeat.name, heartbeatName))
        .limit(1);
    return !heartbeat?.nextAttemptAt || heartbeat.nextAttemptAt.getTime() <= Date.now();
}

async function calendarRefreshDue() {
    const [heartbeat] = await db
        .select({
            completedAt: schedulerHeartbeat.lastCalendarRefreshAt,
            nextAttemptAt: schedulerHeartbeat.nextCalendarRefreshAt,
        })
        .from(schedulerHeartbeat)
        .where(eq(schedulerHeartbeat.name, heartbeatName))
        .limit(1);
    return !heartbeat?.nextAttemptAt || heartbeat.nextAttemptAt.getTime() <= Date.now();
}

export async function runAnimeScheduler() {
    const runId = randomUUID();
    const startedAt = new Date();
    const leaseUntil = new Date(startedAt.getTime() + schedulerRunLease.durationMs);
    const [claimed] = await db
        .insert(schedulerHeartbeat)
        .values({ name: heartbeatName, activeRunId: runId, leaseUntil, startedAt })
        .onConflictDoUpdate({
            target: schedulerHeartbeat.name,
            set: {
                activeRunId: runId,
                leaseUntil,
                startedAt,
            },
            setWhere: or(
                isNull(schedulerHeartbeat.activeRunId),
                isNull(schedulerHeartbeat.leaseUntil),
                lte(schedulerHeartbeat.leaseUntil, startedAt)
            ),
        })
        .returning({ activeRunId: schedulerHeartbeat.activeRunId });
    if (!claimed) {
        return { skipped: 'already-running' as const };
    }

    const leaseRenewal = setInterval(() => {
        void db
            .update(schedulerHeartbeat)
            .set({ leaseUntil: new Date(Date.now() + schedulerRunLease.durationMs) })
            .where(
                and(
                    eq(schedulerHeartbeat.name, heartbeatName),
                    eq(schedulerHeartbeat.activeRunId, runId)
                )
            );
    }, schedulerRunLease.renewalMs);

    try {
        const interests = await reconcileAnimeInterests();
        const inventoryBackfills = await enqueueUnresolvedAnimeInterests();
        const maintenance = await drainMaintenanceTasks(runId, {
            limit: schedulerPolicy.concurrency,
            leaseDurationMs: schedulerPolicy.leaseDurationMs,
            leaseRenewalMs: schedulerPolicy.leaseRenewalMs,
        });
        let fullReconciliation:
            | { discovered: number; releaseRequests: number; targets: number }
            | { error: string; retryAt: string }
            | null = null;
        if (await fullReconciliationDue(schedulerPolicy.fullReconciliationIntervalMs)) {
            try {
                const result = await reconcileAllAiringReleases();
                fullReconciliation = {
                    discovered: result.discovered,
                    releaseRequests: result.releaseRequests,
                    targets: result.targets,
                };
            } catch (cause) {
                const retryAfterMs =
                    cause instanceof GraphQLRequestError && cause.retryAfterMs
                        ? cause.retryAfterMs
                        : 0;
                const retryAt = new Date(Date.now() + Math.max(30 * 60_000, retryAfterMs));
                const error =
                    cause instanceof Error ? cause.message : 'Airing reconciliation failed';
                fullReconciliation = { error, retryAt: retryAt.toISOString() };
                await db
                    .update(schedulerHeartbeat)
                    .set({
                        nextFullReconciliationAt: retryAt,
                        lastFailureAt: new Date(),
                        lastError: error,
                    })
                    .where(eq(schedulerHeartbeat.name, heartbeatName));
            }
        }

        let catalogRefresh: { completedAt: string } | { error: string; retryAt: string } | null =
            null;
        if (await catalogRefreshDue()) {
            try {
                await refreshCatalogSnapshots();
                const refreshedAt = new Date();
                catalogRefresh = { completedAt: refreshedAt.toISOString() };
                await db
                    .update(schedulerHeartbeat)
                    .set({
                        lastCatalogRefreshAt: refreshedAt,
                        nextCatalogRefreshAt: new Date(refreshedAt.getTime() + 24 * 60 * 60_000),
                    })
                    .where(eq(schedulerHeartbeat.name, heartbeatName));
            } catch (cause) {
                const error = cause instanceof Error ? cause.message : 'Catalog refresh failed';
                const retryAfterMs =
                    cause instanceof GraphQLRequestError && cause.retryAfterMs
                        ? cause.retryAfterMs
                        : 0;
                const retryAt = new Date(Date.now() + Math.max(60 * 60_000, retryAfterMs));
                catalogRefresh = { error, retryAt: retryAt.toISOString() };
                await db
                    .update(schedulerHeartbeat)
                    .set({
                        nextCatalogRefreshAt: retryAt,
                        lastFailureAt: new Date(),
                        lastError: error,
                    })
                    .where(eq(schedulerHeartbeat.name, heartbeatName));
            }
        }

        let calendarRefresh:
            | { completedAt: string; entries: number }
            | { error: string; retryAt: string }
            | null = null;
        if (await calendarRefreshDue()) {
            try {
                const result = await refreshReleaseCalendar();
                const refreshedAt = result.sourceFetchedAt;
                calendarRefresh = {
                    completedAt: refreshedAt.toISOString(),
                    entries: result.entries,
                };
                await db
                    .update(schedulerHeartbeat)
                    .set({
                        lastCalendarRefreshAt: refreshedAt,
                        nextCalendarRefreshAt: new Date(
                            refreshedAt.getTime() + schedulerPolicy.calendarRefreshIntervalMs
                        ),
                    })
                    .where(eq(schedulerHeartbeat.name, heartbeatName));
            } catch (cause) {
                const error = cause instanceof Error ? cause.message : 'Calendar refresh failed';
                const retryAfterMs =
                    cause instanceof GraphQLRequestError && cause.retryAfterMs
                        ? cause.retryAfterMs
                        : 0;
                const retryAt = new Date(Date.now() + Math.max(15 * 60_000, retryAfterMs));
                calendarRefresh = { error, retryAt: retryAt.toISOString() };
                await db
                    .update(schedulerHeartbeat)
                    .set({
                        nextCalendarRefreshAt: retryAt,
                        lastFailureAt: new Date(),
                        lastError: error,
                    })
                    .where(eq(schedulerHeartbeat.name, heartbeatName));
            }
        }

        const releases = await refreshDueReleases(schedulerPolicy.concurrency);
        const episodes = await drainEpisodeTargets(runId, schedulerPolicy);
        const completedAt = new Date();
        const stats = {
            releases,
            maintenance,
            episodes,
            interests,
            inventoryBackfills,
            fullReconciliation,
            catalogRefresh,
            calendarRefresh,
        };
        const reconciliationError =
            fullReconciliation && 'error' in fullReconciliation ? fullReconciliation.error : null;
        const catalogError =
            catalogRefresh && 'error' in catalogRefresh ? catalogRefresh.error : null;
        const calendarError =
            calendarRefresh && 'error' in calendarRefresh ? calendarRefresh.error : null;
        const heartbeatUpdate: Partial<typeof schedulerHeartbeat.$inferInsert> = {
            completedAt,
            lastSuccessAt: completedAt,
            lastError: reconciliationError ?? catalogError ?? calendarError,
            stats,
        };
        if (fullReconciliation && !reconciliationError) {
            heartbeatUpdate.lastFullReconciliationAt = completedAt;
            heartbeatUpdate.nextFullReconciliationAt = new Date(
                completedAt.getTime() + schedulerPolicy.fullReconciliationIntervalMs
            );
        }
        await db
            .update(schedulerHeartbeat)
            .set(heartbeatUpdate)
            .where(
                and(
                    eq(schedulerHeartbeat.name, heartbeatName),
                    eq(schedulerHeartbeat.activeRunId, runId)
                )
            );
        await db
            .update(schedulerHeartbeat)
            .set({ activeRunId: null, leaseUntil: null })
            .where(
                and(
                    eq(schedulerHeartbeat.name, heartbeatName),
                    eq(schedulerHeartbeat.activeRunId, runId)
                )
            );
        return stats;
    } catch (cause) {
        const completedAt = new Date();
        await db
            .update(schedulerHeartbeat)
            .set({
                completedAt,
                lastFailureAt: completedAt,
                lastError: cause instanceof Error ? cause.message : 'Anime scheduler failed',
            })
            .where(
                and(
                    eq(schedulerHeartbeat.name, heartbeatName),
                    eq(schedulerHeartbeat.activeRunId, runId)
                )
            );
        await db
            .update(schedulerHeartbeat)
            .set({ activeRunId: null, leaseUntil: null })
            .where(
                and(
                    eq(schedulerHeartbeat.name, heartbeatName),
                    eq(schedulerHeartbeat.activeRunId, runId)
                )
            );
        throw cause;
    } finally {
        clearInterval(leaseRenewal);
    }
}

export async function runAnimeMaintenance(runId: string) {
    return drainMaintenanceTasks(runId, {
        limit: schedulerPolicy.concurrency,
        leaseDurationMs: schedulerPolicy.leaseDurationMs,
        leaseRenewalMs: schedulerPolicy.leaseRenewalMs,
    });
}

export async function animeSchedulerHealth(now = new Date()) {
    const [
        heartbeat,
        requestState,
        targetCounts,
        taskCounts,
        [oldestDueMaintenance],
        [oldestDue],
        [dueTargets],
        [leasedTargets],
    ] = await Promise.all([
        db
            .select()
            .from(schedulerHeartbeat)
            .where(eq(schedulerHeartbeat.name, heartbeatName))
            .limit(1)
            .then((rows) => rows[0] ?? null),
        db
            .select()
            .from(anilistRequestState)
            .where(eq(anilistRequestState.name, 'global'))
            .limit(1)
            .then((rows) => rows[0] ?? null),
        db
            .select({ state: animeEpisodeTarget.state, count: count() })
            .from(animeEpisodeTarget)
            .groupBy(animeEpisodeTarget.state),
        db
            .select({ state: maintenanceTask.state, count: count() })
            .from(maintenanceTask)
            .groupBy(maintenanceTask.state),
        db
            .select({ nextAttemptAt: maintenanceTask.nextAttemptAt })
            .from(maintenanceTask)
            .where(
                and(
                    or(eq(maintenanceTask.state, 'pending'), eq(maintenanceTask.state, 'running')),
                    lte(maintenanceTask.nextAttemptAt, now),
                    or(isNull(maintenanceTask.leaseUntil), lte(maintenanceTask.leaseUntil, now))
                )
            )
            .orderBy(maintenanceTask.nextAttemptAt)
            .limit(1),
        db
            .select({ nextAttemptAt: animeEpisodeTarget.nextAttemptAt })
            .from(animeEpisodeTarget)
            .where(
                and(
                    eq(animeEpisodeTarget.state, 'pending'),
                    lte(animeEpisodeTarget.nextAttemptAt, now)
                )
            )
            .orderBy(animeEpisodeTarget.nextAttemptAt)
            .limit(1),
        db
            .select({ count: count() })
            .from(animeEpisodeTarget)
            .where(
                and(
                    eq(animeEpisodeTarget.state, 'pending'),
                    lte(animeEpisodeTarget.nextAttemptAt, now),
                    or(
                        isNull(animeEpisodeTarget.leaseUntil),
                        lte(animeEpisodeTarget.leaseUntil, now)
                    )
                )
            ),
        db
            .select({ count: count() })
            .from(animeEpisodeTarget)
            .where(
                and(
                    eq(animeEpisodeTarget.state, 'pending'),
                    isNotNull(animeEpisodeTarget.leaseUntil),
                    gt(animeEpisodeTarget.leaseUntil, now)
                )
            ),
    ]);
    const successAge = heartbeat?.lastSuccessAt
        ? now.getTime() - heartbeat.lastSuccessAt.getTime()
        : null;
    const reconciliationAge = heartbeat?.lastFullReconciliationAt
        ? now.getTime() - heartbeat.lastFullReconciliationAt.getTime()
        : null;
    const latestFailed = Boolean(
        heartbeat?.lastFailureAt &&
        (!heartbeat.lastSuccessAt || heartbeat.lastFailureAt > heartbeat.lastSuccessAt)
    );
    const healthy =
        successAge !== null &&
        successAge <= 15 * 60_000 &&
        !latestFailed &&
        reconciliationAge !== null &&
        reconciliationAge <= 2 * 60 * 60_000;
    const active = heartbeat?.activeRunId !== null && heartbeat?.activeRunId !== undefined;
    const durationMs =
        !active && heartbeat?.startedAt && heartbeat.completedAt
            ? heartbeat.completedAt.getTime() - heartbeat.startedAt.getTime()
            : null;
    const targetTotals = Object.fromEntries(
        targetCounts.map((row) => [row.state, row.count])
    ) as Record<string, number>;

    return {
        healthy,
        reason:
            successAge === null
                ? 'The scheduler has not completed successfully'
                : successAge > 15 * 60_000
                  ? 'The scheduler success heartbeat is stale'
                  : latestFailed
                    ? 'The latest scheduler invocation failed'
                    : reconciliationAge === null || reconciliationAge > 2 * 60 * 60_000
                      ? 'Full airing reconciliation is stale'
                      : null,
        active,
        startedAt: heartbeat?.startedAt ?? null,
        completedAt: heartbeat?.completedAt ?? null,
        lastSuccessAt: heartbeat?.lastSuccessAt ?? null,
        lastFailureAt: heartbeat?.lastFailureAt ?? null,
        lastFullReconciliationAt: heartbeat?.lastFullReconciliationAt ?? null,
        nextFullReconciliationAt: heartbeat?.nextFullReconciliationAt ?? null,
        lastCatalogRefreshAt: heartbeat?.lastCatalogRefreshAt ?? null,
        nextCatalogRefreshAt: heartbeat?.nextCatalogRefreshAt ?? null,
        durationMs,
        stats: heartbeat?.stats ?? null,
        targets: {
            pending: targetTotals.pending ?? 0,
            due: dueTargets?.count ?? 0,
            leased: leasedTargets?.count ?? 0,
            confirmed: targetTotals.confirmed ?? 0,
            failed: targetTotals.failed ?? 0,
            retired: targetTotals.retired ?? 0,
        },
        maintenanceTasks: Object.fromEntries(taskCounts.map((row) => [row.state, row.count])),
        maintenanceOldestDueAgeMs: oldestDueMaintenance
            ? now.getTime() - oldestDueMaintenance.nextAttemptAt.getTime()
            : null,
        anilist: requestState
            ? {
                  blockedUntil: requestState.blockedUntil,
                  lastRequestAt: requestState.lastRequestAt,
                  lastOperation: requestState.lastOperation,
                  lastStatus: requestState.lastStatus,
                  lastError: requestState.lastError,
                  requestCount: requestState.requestCount,
                  successCount: requestState.successCount,
                  failureCount: requestState.failureCount,
              }
            : null,
        oldestDueAgeMs: oldestDue ? now.getTime() - oldestDue.nextAttemptAt.getTime() : null,
    };
}
