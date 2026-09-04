import { db } from '@arc/shared/db';
import { maintenanceTask } from '@arc/shared/db/schema';
import { ne } from 'drizzle-orm';
import type { MaintenanceRequest } from '@arc/api-contract/maintenance';

export async function enqueueScheduleDiscovery(
    anilistId: number,
    targetEpisode: number,
    cause?: unknown
) {
    const message =
        cause instanceof Error ? cause.message : cause ? 'AniList schedule discovery failed' : null;
    const payload = {
        kind: 'release_refresh',
        anilistId,
        mode: 'schedule',
    } satisfies MaintenanceRequest;
    await db
        .insert(maintenanceTask)
        .values({
            kind: 'release_refresh',
            dedupeKey: `schedule:${anilistId}:${targetEpisode}`,
            payload,
            lastError: message,
        })
        .onConflictDoUpdate({
            target: maintenanceTask.dedupeKey,
            setWhere: ne(maintenanceTask.state, 'running'),
            set: {
                state: 'pending',
                nextAttemptAt: new Date(),
                leaseOwner: null,
                leaseUntil: null,
                lastError: message,
                completedAt: null,
            },
        });
}
