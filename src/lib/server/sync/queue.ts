import { env } from '$env/dynamic/private';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const arcQueue = new Queue('arc', {
    connection: new IORedis(env.REDIS_URL),
});

export async function enqueueAniListPublication(userId: string, priority = 1) {
    await arcQueue.add(
        'publish-anilist',
        { userId },
        {
            jobId: `publish-anilist-${userId}`,
            priority,
            attempts: 3,
            backoff: { type: 'exponential', delay: 60_000 },
            removeOnComplete: true,
            removeOnFail: true,
        }
    );
}
