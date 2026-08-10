import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

import { workerConfig } from './config';
import { syncAllUsers } from './jobs/sync-all';
import { syncAniList } from './jobs/sync-anilist';

interface SyncJob {
  userId?: string;
}

export function createQueue() {
  return new Queue('arc', {
    connection: new IORedis(workerConfig.redisUrl),
  });
}

export function createWorker(queue: Queue) {
  return new Worker<SyncJob>(
    'arc',
    async (job) => {
      switch (job.name) {
        case 'sync-anilist':
          if (!job.data.userId) {
            throw new Error('AniList sync job has no user ID');
          }
          return syncAniList(job.data.userId);
        case 'sync-anilist-all':
          return syncAllUsers(queue);
        default:
          throw new Error(`Unknown job: ${job.name}`);
      }
    },
    {
      connection: new IORedis(workerConfig.redisUrl, { maxRetriesPerRequest: null }),
      concurrency: 1,
    }
  );
}
