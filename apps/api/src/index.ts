import app from './app';
import { migrateDatabase } from '@arc/db/migrate';

if (process.env.NODE_ENV === 'production') {
    await migrateDatabase();
}

Bun.serve({
    port: process.env.PORT,
    idleTimeout: 60,
    fetch: app.fetch,
});
