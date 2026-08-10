import { env } from '$env/dynamic/private';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const arcQueue = new Queue('arc', {
  connection: new IORedis(env.REDIS_URL),
});

export async function enqueueUserSync(userId: string, priority = 1) {
  await arcQueue.add(
    'sync-anilist',
    { userId },
    {
      priority,
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    }
  );
}
