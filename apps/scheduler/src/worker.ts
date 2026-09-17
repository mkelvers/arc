import { randomUUID } from 'node:crypto';

import { runAnimeMaintenance, runAnimeScheduler } from '@arc/core/server';
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
    delayMs: number,
    execute: () => Promise<void>,
    signal: AbortSignal
) {
    while (!signal.aborted) {
        try {
            await execute();
        } catch {}

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

    try {
        await Promise.all([
            runSchedulerLoop(
                60 * 1_000,
                async () => {
                    await runAnimeScheduler();
                },
                controller.signal
            ),
            runSchedulerLoop(
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
        await db.$client.end();
    }
}
