import { and, desc, eq, inArray } from 'drizzle-orm';

import {
    ensureInternalAnimeId,
    findInternalAnimeId,
} from '$lib/server/anime/identity';
import { db } from '$lib/server/db';
import {
    anime,
    animeExternalId,
    animeExternalIdLink,
    watchlist,
} from '$lib/server/db/schema';
import type { WatchlistState } from '$lib/server/db/schema';
import { chunks } from '$lib/utils';

// Keep bulk writes below PostgreSQL's parameter limit without restricting the
// number of anime a user may import.
const databaseBatchSize = 1_000;

export async function getWatchlistState(
    userId: string | undefined,
    anilistId: number,
) {
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
            addedAt: watchlist.createdAt,
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

export async function replaceWatchlist(
    userId: string,
    entries: Array<{
        anilistId: number;
        state: WatchlistState;
        position: number;
        addedAt?: Date;
    }>,
) {
    await db.transaction(async (tx) => {
        const importedAt = Date.now();
        const anilistIds = entries.map(({ anilistId }) => anilistId);

        for (const batch of chunks(anilistIds, databaseBatchSize)) {
            await tx
                .insert(animeExternalId)
                .values(
                    batch.map((externalId) => ({
                        provider: 'anilist' as const,
                        mediaType: 'anime' as const,
                        externalId,
                    })),
                )
                .onConflictDoNothing();
        }

        const externalIds: Array<{ id: number; externalId: number }> = [];
        for (const batch of chunks(anilistIds, databaseBatchSize)) {
            externalIds.push(
                ...(await tx
                    .select({
                        id: animeExternalId.id,
                        externalId: animeExternalId.externalId,
                    })
                    .from(animeExternalId)
                    .where(
                        and(
                            eq(animeExternalId.provider, 'anilist'),
                            eq(animeExternalId.mediaType, 'anime'),
                            inArray(
                                animeExternalId.externalId,
                                batch,
                            ),
                        ),
                    )),
            );
        }

        const externalIdValues = externalIds.map(({ id }) => id);
        const links: Array<{
            animeId: number;
            externalIdId: number;
        }> = [];
        for (const batch of chunks(
            externalIdValues,
            databaseBatchSize,
        )) {
            links.push(
                ...(await tx
                    .select({
                        animeId: animeExternalIdLink.animeId,
                        externalIdId:
                            animeExternalIdLink.externalIdId,
                    })
                    .from(animeExternalIdLink)
                    .where(
                        inArray(
                            animeExternalIdLink.externalIdId,
                            batch,
                        ),
                    )),
            );
        }
        const linkedExternalIds = new Set(
            links.map(({ externalIdId }) => externalIdId),
        );
        const missing = externalIds.filter(
            ({ id }) => !linkedExternalIds.has(id),
        );

        for (const batch of chunks(missing, databaseBatchSize)) {
            const created = await tx
                .insert(anime)
                .values(batch.map(() => ({ title: null })))
                .returning({ id: anime.id });

            if (created.length !== batch.length) {
                throw new Error('Failed to store imported anime');
            }

            const createdLinks = batch.map(({ id }, index) => ({
                animeId: created[index].id,
                externalIdId: id,
            }));

            await tx.insert(animeExternalIdLink).values(createdLinks);

            links.push(...createdLinks);
        }

        const animeIdByExternalId = new Map(
            links.map(({ animeId, externalIdId }) => [
                externalIdId,
                animeId,
            ]),
        );
        const animeIdByAniListId = new Map(
            externalIds.map(({ id, externalId }) => [
                externalId,
                animeIdByExternalId.get(id),
            ]),
        );
        const replacement = entries.map(
            ({ anilistId, state, position, addedAt }) => {
                const animeId = animeIdByAniListId.get(anilistId);
                if (!animeId) {
                    throw new Error(
                        `Failed to store anime identity ${anilistId}`,
                    );
                }

                return {
                    userId,
                    animeId,
                    state,
                    createdAt: addedAt,
                    updatedAt: new Date(importedAt - position),
                };
            },
        );

        await tx.delete(watchlist).where(eq(watchlist.userId, userId));

        for (const batch of chunks(replacement, databaseBatchSize)) {
            await tx.insert(watchlist).values(batch);
        }
    });
}
