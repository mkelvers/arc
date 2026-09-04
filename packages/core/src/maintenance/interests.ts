import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import { db } from '@arc/shared/db';
import {
    anime,
    animeEpisodeSync,
    animeExternalId,
    animeExternalIdLink,
    animeInterestDirty,
    animeRelease,
    animeReleaseInterest,
    watchlist,
} from '@arc/shared/db/schema';
import { ensureEpisodeInventoryBackfill } from '../catalog/episode-sync';

export async function reconcileAnimeInterests() {
    const dirty = await db.select().from(animeInterestDirty);
    let reconciled = 0;

    for (const entry of dirty) {
        const rows = await db
            .select({
                state: watchlist.state,
                anilistId: animeExternalId.externalId,
                hasRelease: animeRelease.data,
            })
            .from(watchlist)
            .innerJoin(anime, eq(anime.id, watchlist.animeId))
            .innerJoin(animeExternalIdLink, eq(animeExternalIdLink.animeId, anime.id))
            .innerJoin(animeExternalId, eq(animeExternalId.id, animeExternalIdLink.externalIdId))
            .leftJoin(animeRelease, eq(animeRelease.anilistId, animeExternalId.externalId))
            .where(
                and(
                    eq(watchlist.userId, entry.userId),
                    eq(watchlist.animeId, entry.animeId),
                    eq(animeExternalId.provider, 'anilist'),
                    eq(animeExternalId.mediaType, 'anime')
                )
            );

        const activeRows = rows.filter(({ state }) => state !== 'dropped');
        if (activeRows.length) {
            if (activeRows.some(({ hasRelease }) => hasRelease !== null)) {
                await db
                    .insert(animeReleaseInterest)
                    .values(
                        activeRows
                            .filter(({ hasRelease }) => hasRelease !== null)
                            .map(({ anilistId }) => ({
                                userId: entry.userId,
                                source: 'watchlist' as const,
                                sourceAnimeId: entry.animeId,
                                trackedAnilistId: anilistId,
                            }))
                    )
                    .onConflictDoNothing();
            }
        } else {
            await db
                .delete(animeReleaseInterest)
                .where(
                    and(
                        eq(animeReleaseInterest.userId, entry.userId),
                        eq(animeReleaseInterest.source, 'watchlist'),
                        eq(animeReleaseInterest.sourceAnimeId, entry.animeId)
                    )
                );
        }

        if (!activeRows.length || activeRows.every(({ hasRelease }) => hasRelease !== null)) {
            await db
                .delete(animeInterestDirty)
                .where(
                    and(
                        eq(animeInterestDirty.userId, entry.userId),
                        eq(animeInterestDirty.animeId, entry.animeId)
                    )
                );
            reconciled += 1;
        }
    }

    return reconciled;
}

export async function enqueueUnresolvedAnimeInterests() {
    const interests = await db
        .selectDistinct({ anilistId: animeReleaseInterest.trackedAnilistId })
        .from(animeReleaseInterest)
        .innerJoin(animeRelease, eq(animeRelease.anilistId, animeReleaseInterest.trackedAnilistId))
        .where(eq(animeReleaseInterest.source, 'watchlist'));
    if (!interests.length) {
        return 0;
    }

    const ids = interests.map(({ anilistId }) => anilistId);
    const synced = await db
        .select({ anilistId: animeEpisodeSync.anilistId })
        .from(animeEpisodeSync)
        .where(
            and(inArray(animeEpisodeSync.anilistId, ids), isNotNull(animeEpisodeSync.lastSuccessAt))
        );
    const syncedIds = new Set(synced.map(({ anilistId }) => anilistId));
    const unresolved = ids.filter((id) => !syncedIds.has(id));

    for (const anilistId of unresolved) {
        await ensureEpisodeInventoryBackfill(anilistId);
    }

    return unresolved.length;
}
