import { sql } from 'drizzle-orm';

import { db } from '$lib/server/db';
import { anilistPublication } from '$lib/server/db/schema';

export async function requestAniListPublication(userId: string) {
    const now = new Date();

    await db
        .insert(anilistPublication)
        .values({ userId, nextAttemptAt: now })
        .onConflictDoUpdate({
            target: anilistPublication.userId,
            set: {
                version: sql`${anilistPublication.version} + 1`,
                nextAttemptAt: now,
                attempts: 0,
                lastError: null,
            },
        });
}
