import { randomUUID } from 'node:crypto';

import { logger, runAnimeMaintenance, runAnimeScheduler } from '@arc/core/server';
import { db } from '@arc/shared/db';

export async function startScheduler() {
    let stopping = false;
    const stop = () => {
        stopping = true;
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);

    try {
        await Promise.all([
            (async () => {
                while (!stopping) {
                    try {
                        await runAnimeScheduler();
                    } catch (cause) {
                        logger.debug('Arc anime scheduler failed', cause);
                    }

                    if (!stopping) {
                        await Bun.sleep(60 * 1_000);
                    }
                }
            })(),
            (async () => {
                while (!stopping) {
                    try {
                        await runAnimeMaintenance(`maintenance-worker:${randomUUID()}`);
                    } catch (cause) {
                        logger.debug('Arc maintenance worker failed', cause);
                    }

                    if (!stopping) {
                        await Bun.sleep(10 * 1_000);
                    }
                }
            })(),
        ]);
    } finally {
        await db.$client.end();
    }
}
