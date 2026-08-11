if (!process.env.REDIS_URL || !process.env.ARC_WEB_URL || !process.env.ARC_WORKER_TOKEN) {
    throw new Error('REDIS_URL, ARC_WEB_URL, and ARC_WORKER_TOKEN are required');
}

if (!process.env.TZ) {
    throw new Error('TZ is not configured');
}

export const workerConfig = {
    redisUrl: process.env.REDIS_URL,
    webUrl: process.env.ARC_WEB_URL,
    workerToken: process.env.ARC_WORKER_TOKEN,
    timezone: process.env.TZ,
};
