import app from './app';
import { apiIdleTimeoutSeconds } from './server-policy';
import { migrateDatabase } from '@arc/db/migrate';

if (process.env.NODE_ENV === 'production') {
    await migrateDatabase();
}

Bun.serve({
    port: process.env.PORT,
    idleTimeout: apiIdleTimeoutSeconds,
    fetch: app.fetch,
});
