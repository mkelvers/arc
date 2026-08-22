import { db } from '@arc/db';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

import app from './app';

if (process.env.NODE_ENV === 'production') {
    await migrate(db, {
        migrationsFolder: 'packages/db/drizzle'
    });
}

Bun.serve({
    port: process.env.PORT,
    fetch: app.fetch,
});
