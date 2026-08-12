import { and, eq, gte, isNull, lt } from 'drizzle-orm';

import { db } from '$lib/server/db';
import {
    animeExternalId,
    animeExternalIdLink,
    animeRecentVisit,
    notificationInterest,
    playbackProgress,
    watchlist,
} from '$lib/server/db/schema';

const recentVisitLifetimeMs = 30 * 24 * 60 * 60 * 1_000;

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

function selectedAniListId() {
    return { anilistId: animeExternalId.externalId };
}

export async function getProactiveAnimeIds(now = new Date()) {
    const recentThreshold = new Date(now.getTime() - recentVisitLifetimeMs);
    await db.delete(animeRecentVisit).where(lt(animeRecentVisit.visitedAt, recentThreshold));

    const [watchlistRows, progressRows, visitRows, notificationRows] = await Promise.all([
        db
            .select(selectedAniListId())
            .from(watchlist)
            .innerJoin(animeExternalIdLink, eq(animeExternalIdLink.animeId, watchlist.animeId))
            .innerJoin(animeExternalId, eq(animeExternalId.id, animeExternalIdLink.externalIdId))
            .where(
                and(eq(animeExternalId.provider, 'anilist'), eq(animeExternalId.mediaType, 'anime'))
            ),
        db
            .select(selectedAniListId())
            .from(playbackProgress)
            .innerJoin(
                animeExternalIdLink,
                eq(animeExternalIdLink.animeId, playbackProgress.animeId)
            )
            .innerJoin(animeExternalId, eq(animeExternalId.id, animeExternalIdLink.externalIdId))
            .where(
                and(
                    isNull(playbackProgress.dismissedAt),
                    eq(animeExternalId.provider, 'anilist'),
                    eq(animeExternalId.mediaType, 'anime')
                )
            ),
        db
            .select({ anilistId: animeRecentVisit.anilistId })
            .from(animeRecentVisit)
            .where(gte(animeRecentVisit.visitedAt, recentThreshold)),
        db.selectDistinct({ anilistId: notificationInterest.anilistId }).from(notificationInterest),
    ]);

    return [
        ...new Set(
            [...watchlistRows, ...progressRows, ...visitRows, ...notificationRows].map(
                ({ anilistId }) => anilistId
            )
        ),
    ];
}
