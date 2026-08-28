import { loadSchedulerConfig } from './config';

const config = await loadSchedulerConfig();
const { runAnimeScheduler } = await import('@arc/backend/internal/anime/scheduler/run');
const { db } = await import('@arc/db');

let stopping = false;
process.once('SIGINT', () => {
    stopping = true;
});
process.once('SIGTERM', () => {
    stopping = true;
});

try {
    console.info('Arc anime scheduler service started');
    while (!stopping) {
        try {
            console.info('Arc anime scheduler run started');
            console.info('Arc anime scheduler run completed', await runAnimeScheduler(config));
        } catch (cause) {
            console.error('Arc anime scheduler run failed', cause);
        }

        if (!stopping) {
            await Bun.sleep(config.pollIntervalMs);
        }
    }
} finally {
    await db.$client.end();
    console.info('Arc anime scheduler service stopped');
}
