import { runAnimeScheduler } from '@arc/backend/internal/anime/scheduler/run';
import { logger } from '@arc/backend/internal/logger';
import { db } from '@arc/db';

const schedulerPollIntervalMs = 60 * 1_000;

export async function startScheduler() {
    let stopping = false;
    const stop = () => {
        stopping = true;
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);

    try {
        while (!stopping) {
            try {
                await runAnimeScheduler();
            } catch (cause) {
                logger.debug('Arc anime scheduler failed', cause);
            }

            if (!stopping) {
                await Bun.sleep(schedulerPollIntervalMs);
            }
        }
    } finally {
        await db.$client.end();
    }
}
