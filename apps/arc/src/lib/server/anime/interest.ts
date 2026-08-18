import { db } from '$lib/server/db';
import { animeRecentVisit } from '$lib/server/db/schema';

export async function recordAnimeVisit(userId: string | undefined, anilistId: number) {
    if (!userId) {
        return;
    }

    const visitedAt = new Date();
    await db
        .insert(animeRecentVisit)
        .values({ userId, anilistId, visitedAt })
        .onConflictDoUpdate({
            target: [animeRecentVisit.userId, animeRecentVisit.anilistId],
            set: { visitedAt },
        });
}
