import { DelayedError, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

import { workerConfig } from './config';
import { publishAllUsers } from './jobs/sync-all';
import { publishAniList } from './jobs/sync-anilist';
import { scanAiring, syncAiring } from './jobs/sync-airing';

interface SyncJob {
    userId?: string;
    anilistId?: number;
    targetEpisode?: number;
}

export function createQueue() {
    return new Queue('arc', {
        connection: new IORedis(workerConfig.redisUrl),
    });
}

export function createWorker(queue: Queue) {
    return new Worker<SyncJob>(
        'arc',
        async (job, token) => {
            switch (job.name) {
                // Jobs already persisted under the old name remain outbound-only.
                case 'sync-anilist':
                case 'publish-anilist':
                    if (!job.data.userId) {
                        throw new Error('AniList publication job has no user ID');
                    }
                    return publishAniList(job.data.userId);
                case 'sync-anilist-all':
                case 'publish-anilist-all':
                    return publishAllUsers(queue);
                case 'scan-airing':
                    return scanAiring(queue);
                case 'sync-airing':
                    if (!job.data.anilistId) {
                        throw new Error('Airing sync job has no AniList ID');
                    }
                    if (
                        job.data.targetEpisode !== undefined &&
                        (!Number.isSafeInteger(job.data.targetEpisode) ||
                            job.data.targetEpisode <= 0)
                    ) {
                        throw new Error('Airing sync job has an invalid target episode');
                    }

                    const result = await syncAiring(job.data.anilistId, job.data.targetEpisode);
                    if (job.data.targetEpisode && !result.episodeAvailable) {
                        const delay = Math.min(
                            30 * 60 * 1_000,
                            2 * 60 * 1_000 * 2 ** Math.min(job.attemptsMade, 4)
                        );
                        await job.moveToDelayed(Date.now() + delay, token);
                        throw new DelayedError();
                    }

                    return result;
                default:
                    throw new Error(`Unknown job: ${job.name}`);
            }
        },
        {
            connection: new IORedis(workerConfig.redisUrl, { maxRetriesPerRequest: null }),
            concurrency: 5,
            limiter: { max: 2, duration: 1_000 },
        }
    );
}
