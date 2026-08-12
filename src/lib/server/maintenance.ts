import { and, eq, isNull, lte, or } from 'drizzle-orm';

import { refreshScheduledEpisodes, scanAiringAnime } from '$lib/server/anime/airing-sync';
import { db } from '$lib/server/db';
import { maintenanceHeartbeat, maintenanceTask } from '$lib/server/db/schema';
import { reconcileAllNotificationInterests } from '$lib/server/notifications/reconcile';
import { publishPendingAniList, requestAllAniListPublications } from '$lib/server/sync/publication';

const dailyMs = 24 * 60 * 60 * 1_000;
const hourlyMs = 60 * 60 * 1_000;
const notificationReconciliationMs = 6 * 60 * 60 * 1_000;
const recurringLeaseMs = 10 * 60 * 1_000;
const recurringFailureRetryMs = 5 * 60 * 1_000;
const heartbeatName = 'scheduler';
const heartbeatStaleAfterMs = 3 * 60 * 1_000;

async function runRecurringTask(name: string, intervalMs: number, task: () => Promise<unknown>) {
    const now = new Date();
    await db.insert(maintenanceTask).values({ name, nextRunAt: now }).onConflictDoNothing();

    const [claimed] = await db
        .update(maintenanceTask)
        .set({ leaseUntil: new Date(now.getTime() + recurringLeaseMs) })
        .where(
            and(
                eq(maintenanceTask.name, name),
                lte(maintenanceTask.nextRunAt, now),
                or(isNull(maintenanceTask.leaseUntil), lte(maintenanceTask.leaseUntil, now))
            )
        )
        .returning({ name: maintenanceTask.name });

    if (!claimed) {
        return { ran: false, error: null };
    }

    try {
        await task();
        await db
            .update(maintenanceTask)
            .set({
                nextRunAt: new Date(Date.now() + intervalMs),
                leaseUntil: null,
                lastError: null,
            })
            .where(eq(maintenanceTask.name, name));

        return { ran: true, error: null };
    } catch (cause) {
        const message = cause instanceof Error ? cause.message : `${name} failed`;
        await db
            .update(maintenanceTask)
            .set({
                nextRunAt: new Date(Date.now() + recurringFailureRetryMs),
                leaseUntil: null,
                lastError: message,
            })
            .where(eq(maintenanceTask.name, name));

        return { ran: true, error: message };
    }
}

export async function runMaintenance() {
    const startedAt = new Date();
    await db
        .insert(maintenanceHeartbeat)
        .values({ name: heartbeatName, startedAt })
        .onConflictDoUpdate({
            target: maintenanceHeartbeat.name,
            set: { startedAt, lastError: null },
        });

    try {
        const notificationInterests = await runRecurringTask(
            'notification-interests',
            notificationReconciliationMs,
            reconcileAllNotificationInterests
        );
        const airingScan = await runRecurringTask('airing-scan', hourlyMs, scanAiringAnime);
        const episodes = await refreshScheduledEpisodes();
        const anilistReconciliation = await runRecurringTask(
            'anilist-reconciliation',
            dailyMs,
            requestAllAniListPublications
        );
        const anilist = await publishPendingAniList();
        const errors = [
            notificationInterests.error,
            airingScan.error,
            anilistReconciliation.error,
        ].filter((message): message is string => Boolean(message));
        const completedAt = new Date();

        await db
            .update(maintenanceHeartbeat)
            .set({ completedAt, lastError: errors.join('; ') || null })
            .where(eq(maintenanceHeartbeat.name, heartbeatName));

        return {
            healthy: errors.length === 0,
            episodes,
            notificationInterests,
            airingScan,
            anilistReconciliation,
            anilist,
        };
    } catch (cause) {
        const lastError = cause instanceof Error ? cause.message : 'Maintenance failed';
        await db
            .update(maintenanceHeartbeat)
            .set({ completedAt: new Date(), lastError })
            .where(eq(maintenanceHeartbeat.name, heartbeatName));
        throw cause;
    }
}

export async function maintenanceHealth(now = new Date()) {
    const [heartbeat] = await db
        .select({
            startedAt: maintenanceHeartbeat.startedAt,
            completedAt: maintenanceHeartbeat.completedAt,
            lastError: maintenanceHeartbeat.lastError,
        })
        .from(maintenanceHeartbeat)
        .where(eq(maintenanceHeartbeat.name, heartbeatName))
        .limit(1);
    const ageMs = heartbeat ? now.getTime() - heartbeat.startedAt.getTime() : null;
    const healthy = heartbeat !== undefined && ageMs !== null && ageMs <= heartbeatStaleAfterMs;

    return {
        healthy: healthy && heartbeat.lastError === null,
        reason: !heartbeat
            ? 'Maintenance has not run'
            : ageMs !== null && ageMs > heartbeatStaleAfterMs
              ? 'Maintenance heartbeat is stale'
              : heartbeat.lastError,
        startedAt: heartbeat?.startedAt ?? null,
        completedAt: heartbeat?.completedAt ?? null,
    };
}
