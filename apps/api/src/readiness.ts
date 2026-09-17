import { sql } from 'drizzle-orm';

import { logger } from '@arc/core/server';
import { db } from '@arc/shared/db';

let migrationsReady = false;

export function markMigrationsReady() {
    migrationsReady = true;
}

export function areMigrationsReady() {
    return migrationsReady;
}

export async function isReady() {
    if (!migrationsReady) {
        return false;
    }

    try {
        await db.execute(sql`SELECT 1`);
        return true;
    } catch (cause) {
        logger.debug('Database readiness check failed', { error: cause });
        return false;
    }
}
