import { loadSchedulerConfig } from './config';

export default {
    async scheduled(controller: Bun.CronController) {
        const config = loadSchedulerConfig();
        const { runAnimeScheduler } = await import('@arc/backend/internal/anime/scheduler/run');
        const { db } = await import('@arc/db');
        const startedAt = new Date(controller.scheduledTime).toISOString();
        console.info(`Arc anime scheduler started for ${startedAt}`);
        try {
            const result = await runAnimeScheduler(config);
            console.info('Arc anime scheduler completed', result);
        } finally {
            await db.$client.end();
        }
    },
};
