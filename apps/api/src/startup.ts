import { logger } from '@arc/core/server';

const migrationRetryDelaysMs = [1_000, 2_000, 4_000, 8_000, 16_000];

export async function runMigrationsWithRetry(
    migrateDatabase: () => Promise<void>,
    sleep: (delayMs: number) => Promise<void> = (delayMs) => Bun.sleep(delayMs)
): Promise<void> {
    for (let attempt = 0; attempt <= migrationRetryDelaysMs.length; attempt += 1) {
        try {
            await migrateDatabase();
            return;
        } catch (cause) {
            const delayMs = migrationRetryDelaysMs[attempt];
            if (delayMs === undefined) {
                throw cause;
            }

            logger.warn('Database migration attempt failed; retry scheduled', {
                attempt: attempt + 1,
                delayMs,
                error: cause,
            });
            await sleep(delayMs);
        }
    }
}
