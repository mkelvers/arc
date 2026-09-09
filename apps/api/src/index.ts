import app from './app';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { logger } from '@arc/core/server';
import { db } from '@arc/shared/db';
import { markMigrationsReady } from './readiness';
import { runMigrationsWithRetry } from './startup';

const isProduction = process.env.NODE_ENV === 'production';

if (!isProduction) {
    markMigrationsReady();
}

const server = Bun.serve({
    port: process.env.PORT,
    idleTimeout: 60,
    fetch: app.fetch,
});

if (isProduction) {
    void runMigrationsWithRetry(() =>
        migrate(db, {
            migrationsFolder: 'packages/shared/drizzle',
        })
    )
        .then(markMigrationsReady)
        .catch((cause) => {
            logger.error(
                'Database migrations failed after all startup retries',
                cause instanceof Error ? cause.message : String(cause)
            );
            server.stop(true);
            process.exit(1);
        });
}
