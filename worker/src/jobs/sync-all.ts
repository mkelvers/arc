import type { Queue } from 'bullmq';

import { workerConfig } from '../config';

export async function syncAllUsers(queue: Queue) {
    const response = await fetch(`${workerConfig.webUrl}/api/internal/sync/anilist`, {
        headers: { Authorization: `Bearer ${workerConfig.workerToken}` },
        signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
        throw new Error(`Could not load automatic sync users: ${response.status}`);
    }

    const users = (await response.json()) as Array<{ userId: string }>;
    for (const { userId } of users) {
        await queue.add(
            'sync-anilist',
            { userId },
            {
                jobId: `sync-anilist-${userId}`,
                priority: 10,
                attempts: 3,
                backoff: { type: 'exponential', delay: 60_000 },
                removeOnComplete: true,
                removeOnFail: true,
            }
        );
    }
}
