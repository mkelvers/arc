import { workerConfig } from './config';
import { createQueue, createWorker } from './queue';

const queue = createQueue();
const worker = createWorker(queue);

await queue.upsertJobScheduler(
    'daily-anilist-sync',
    { pattern: '0 59 23 * * *', tz: workerConfig.timezone },
    {
        name: 'sync-anilist-all',
        data: {},
        opts: { priority: 10, attempts: 3, removeOnComplete: 100 },
    }
);

worker.on('error', (error) => {
    console.error('Arc worker error', error);
});

console.log('Arc worker started');
