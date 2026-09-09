import { sql } from 'drizzle-orm';

import { db } from '@arc/shared/db';

let migrationsReady = false;

export function markMigrationsReady() {
    migrationsReady = true;
}

export async function isReady() {
    if (!migrationsReady) {
        return false;
    }

    try {
        await db.execute(sql`SELECT 1`);
        return true;
    } catch {
        return false;
    }
}
