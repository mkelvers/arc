import { and, eq, inArray } from 'drizzle-orm';

import { db } from '$lib/server/db';
import {
    anime,
    animeExternalId,
    animeExternalIdLink,
    users,
    watchlist,
} from '$lib/server/db/schema';

async function findAnimeId(anilistId: number) {
    const [stored] = await db
        .select({ animeId: animeExternalIdLink.animeId })
        .from(animeExternalId)
        .innerJoin(
            animeExternalIdLink,
            eq(animeExternalIdLink.externalIdId, animeExternalId.id),
        )
        .where(
            and(
                eq(animeExternalId.provider, 'anilist'),
                eq(animeExternalId.mediaType, 'anime'),
                eq(animeExternalId.externalId, anilistId),
            ),
        )
        .limit(1);

    return stored?.animeId ?? null;
}

async function ensureAnimeId(anilistId: number) {
    const stored = await findAnimeId(anilistId);

    if (stored) {
        return stored;
    }

    return db.transaction(async (tx) => {
        await tx
            .insert(animeExternalId)
            .values({
                provider: 'anilist',
                mediaType: 'anime',
                externalId: anilistId,
            })
            .onConflictDoNothing();

        const [externalId] = await tx
            .select({ id: animeExternalId.id })
            .from(animeExternalId)
            .where(
                and(
                    eq(animeExternalId.provider, 'anilist'),
                    eq(animeExternalId.mediaType, 'anime'),
                    eq(animeExternalId.externalId, anilistId),
                ),
            )
            .limit(1);

        if (!externalId) {
            throw new Error('Failed to store anime identity');
        }

        const [existingLink] = await tx
            .select({ animeId: animeExternalIdLink.animeId })
            .from(animeExternalIdLink)
            .where(eq(animeExternalIdLink.externalIdId, externalId.id))
            .limit(1);

        if (existingLink) {
            return existingLink.animeId;
        }

        const [created] = await tx
            .insert(anime)
            .values({})
            .returning({ id: anime.id });

        if (!created) {
            throw new Error('Failed to store anime');
        }

        await tx.insert(animeExternalIdLink).values({
            animeId: created.id,
            externalIdId: externalId.id,
        });

        return created.id;
    });
}

export async function getWatchlistState(userId: string | undefined, anilistId: number) {
    if (!userId) {
        return null;
    }

    const animeId = await findAnimeId(anilistId);
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

export async function togglePlanToWatch(userId: string, anilistId: number) {
    const animeId = await ensureAnimeId(anilistId);

    await db
        .insert(users)
        .values({
            id: userId,
            name: 'Arc user',
            email: `${userId}@legacy.invalid`,
        })
        .onConflictDoNothing();

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

    if (item?.state === 'plan_to_watch') {
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

    await db
        .insert(watchlist)
        .values({ userId, animeId, state: 'plan_to_watch' })
        .onConflictDoUpdate({
            target: [watchlist.userId, watchlist.animeId],
            set: { state: 'plan_to_watch', updatedAt: new Date() },
        });

    return 'plan_to_watch' as const;
}
