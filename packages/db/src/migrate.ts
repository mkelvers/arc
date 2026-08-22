import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { db } from './index';

try {
    await migrate(db, {
        migrationsFolder: 'packages/db/drizzle',
    });
} finally {
    await db.$client.end();
}
