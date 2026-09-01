import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { db } from './index';

export async function migrateDatabase() {
    await migrate(db, {
        migrationsFolder: 'packages/db/drizzle',
    });
}

if (import.meta.main) {
    try {
        await migrateDatabase();
    } finally {
        await db.$client.end();
    }
}
