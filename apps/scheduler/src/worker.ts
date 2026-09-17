import { randomUUID } from 'node:crypto';

import { logger, runAnimeMaintenance, runAnimeScheduler } from '@arc/core/server';
import { db } from '@arc/shared/db';

function waitForNextRun(delayMs: number, signal: AbortSignal) {
    if (signal.aborted) {
        return Promise.resolve(false);
    }

    return new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (shouldRunAgain: boolean) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            signal.removeEventListener('abort', stopWaiting);
            resolve(shouldRunAgain);
        };
        const stopWaiting = () => finish(false);
        const timer = setTimeout(() => finish(true), delayMs);
        signal.addEventListener('abort', stopWaiting, { once: true });

        if (signal.aborted) {
            finish(false);
        }
    });
}

async function runSchedulerLoop(
    name: string,
    delayMs: number,
    execute: () => Promise<void>,
    signal: AbortSignal
) {
    while (!signal.aborted) {
        const startedAt = performance.now();
        try {
            await execute();
            logger.debug(`${name} cycle completed`, {
                durationMs: Math.round(performance.now() - startedAt),
            });
        } catch (cause) {
            logger.error(`${name} cycle failed`, {
                durationMs: Math.round(performance.now() - startedAt),
                error: cause,
            });
        }

        if (!(await waitForNextRun(delayMs, signal))) {
            return;
        }
    }
}

export async function startScheduler() {
    const controller = new AbortController();
    const stop = () => controller.abort();
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);

    logger.info('Arc scheduler started');
    try {
        await Promise.all([
            runSchedulerLoop(
                'Anime scheduler',
                60 * 1_000,
                async () => {
                    await runAnimeScheduler();
                },
                controller.signal
            ),
            runSchedulerLoop(
                'Anime maintenance',
                10 * 1_000,
                async () => {
                    await runAnimeMaintenance(`maintenance-worker:${randomUUID()}`);
                },
                controller.signal
            ),
        ]);
    } finally {
        process.removeListener('SIGINT', stop);
        process.removeListener('SIGTERM', stop);
        logger.info('Arc scheduler stopped');
        await db.$client.end();
    }
}
