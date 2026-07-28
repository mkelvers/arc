import { and, desc, eq, inArray } from 'drizzle-orm';

import {
    ensureInternalAnimeId,
    findInternalAnimeId,
} from '$lib/server/anime/identity';
import { db } from '$lib/server/db';
import {
    animeExternalId,
    animeExternalIdLink,
    watchlist,
} from '$lib/server/db/schema';
import type { WatchlistState } from '$lib/server/db/schema';

export async function getWatchlistState(userId: string | undefined, anilistId: number) {
    if (!userId) {
        return null;
    }

    const animeId = await findInternalAnimeId(anilistId);
    if (!animeId) {
        return null;
    }

    const [item] = await db
        .select({ state: watchlist.state })
        .from(watchlist)
        .where(
            and(
                eq(watchlist.userId, userId),
                eq(watchlist.animeId, animeId),
            ),
        )
        .limit(1);

    return item?.state ?? null;
}

export async function getWatchlistedAnimeIds(
    userId: string | undefined,
    anilistIds: number[],
) {
    if (!userId || !anilistIds.length) {
        return new Set<number>();
    }

    const items = await db
        .select({ anilistId: animeExternalId.externalId })
        .from(watchlist)
        .innerJoin(
            animeExternalIdLink,
            eq(animeExternalIdLink.animeId, watchlist.animeId),
        )
        .innerJoin(
            animeExternalId,
            eq(animeExternalId.id, animeExternalIdLink.externalIdId),
        )
        .where(
            and(
                eq(watchlist.userId, userId),
                eq(animeExternalId.provider, 'anilist'),
                eq(animeExternalId.mediaType, 'anime'),
                inArray(animeExternalId.externalId, anilistIds),
            ),
        );

    return new Set(items.map(({ anilistId }) => anilistId));
}

export async function getWatchlistEntries(userId: string) {
    return db
        .select({
            anilistId: animeExternalId.externalId,
            state: watchlist.state,
        })
        .from(watchlist)
        .innerJoin(
            animeExternalIdLink,
            eq(animeExternalIdLink.animeId, watchlist.animeId),
        )
        .innerJoin(
            animeExternalId,
            eq(animeExternalId.id, animeExternalIdLink.externalIdId),
        )
        .where(
            and(
                eq(watchlist.userId, userId),
                eq(animeExternalId.provider, 'anilist'),
                eq(animeExternalId.mediaType, 'anime'),
            ),
        )
        .orderBy(desc(watchlist.updatedAt));
}

export async function removeFromWatchlist(
    userId: string,
    anilistId: number,
) {
    const animeId = await findInternalAnimeId(anilistId);
    if (!animeId) {
        return;
    }

    await db
        .delete(watchlist)
        .where(
            and(
                eq(watchlist.userId, userId),
                eq(watchlist.animeId, animeId),
            ),
        );
}

async function upsertWatchlistState(
    userId: string,
    animeId: number,
    state: WatchlistState,
) {
    await db
        .insert(watchlist)
        .values({ userId, animeId, state })
        .onConflictDoUpdate({
            target: [watchlist.userId, watchlist.animeId],
            set: { state, updatedAt: new Date() },
        });
}

export async function setWatchlistState(
    userId: string,
    anilistId: number,
    state: WatchlistState,
) {
    const animeId = await ensureInternalAnimeId(anilistId);

    await upsertWatchlistState(userId, animeId, state);

    return state;
}

export async function toggleWatchlist(userId: string, anilistId: number) {
    const animeId = await ensureInternalAnimeId(anilistId);

    const [item] = await db
        .select({ state: watchlist.state })
        .from(watchlist)
        .where(
            and(
                eq(watchlist.userId, userId),
                eq(watchlist.animeId, animeId),
            ),
        )
        .limit(1);

    if (item) {
        await db
            .delete(watchlist)
            .where(
                and(
                    eq(watchlist.userId, userId),
                    eq(watchlist.animeId, animeId),
                ),
            );
        return null;
    }

    await upsertWatchlistState(userId, animeId, 'plan_to_watch');

    return 'plan_to_watch' as const;
}
