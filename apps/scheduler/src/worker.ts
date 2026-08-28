import { runAnimeScheduler } from '@arc/backend/internal/anime/scheduler/run';
import { db } from '@arc/db';

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
                console.error('Arc anime scheduler failed', cause);
            }

            if (!stopping) {
                await Bun.sleep(5 * 60 * 1_000);
            }
        }
    } finally {
        await db.$client.end();
    }
}
