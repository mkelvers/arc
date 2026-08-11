import { workerConfig } from './config';
import { createQueue, createWorker } from './queue';

const queue = createQueue();
const worker = createWorker(queue);

await queue.add(
    'scan-airing',
    {},
    {
        jobId: `airing-scan-${new Date().toISOString().slice(0, 10)}`,
        priority: 1,
        attempts: 3,
        removeOnComplete: 100,
    }
);

await queue.removeJobScheduler('daily-anilist-sync');

await queue.upsertJobScheduler(
    'daily-anilist-publication',
    { pattern: '0 59 23 * * *', tz: workerConfig.timezone },
    {
        name: 'publish-anilist-all',
        data: {},
        opts: { priority: 10, attempts: 3, removeOnComplete: 100 },
    }
);

await queue.upsertJobScheduler(
    'daily-airing-sync',
    { pattern: '0 0 0 * * *', tz: workerConfig.timezone },
    {
        name: 'scan-airing',
        data: {},
        opts: { priority: 1, attempts: 3, removeOnComplete: 100 },
    }
);

worker.on('error', (error) => {
    console.error('Arc worker error', error);
});

worker.on('failed', (job, error) => {
    const anime = job?.data.anilistId
        ? ` for AniList ${job.data.anilistId}${job.data.targetEpisode ? ` episode ${job.data.targetEpisode}` : ''}`
        : '';
    console.error(`Arc job failed: ${job?.name ?? 'unknown'}${anime}: ${error.message}`);
});

console.log('Arc worker started');
