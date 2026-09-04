import app from './app';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { db } from '@arc/db';

if (process.env.NODE_ENV === 'production') {
    await migrate(db, {
        migrationsFolder: 'packages/db/drizzle',
    });
}

Bun.serve({
    port: process.env.PORT,
    idleTimeout: 60,
    fetch: app.fetch,
});
