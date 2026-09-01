import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import type { PlaybackProgressInput } from '../progress/input';
import { ensureInternalAnimeId, findInternalAnimeId } from '../anime/identity';
import { db } from '@arc/db';
import {
    anime,
    animeCatalog,
    animeEpisode,
    animeEpisodeSync,
    animeExternalId,
    animeExternalIdLink,
    animeInterestDirty,
    animeRelease,
    watchlist,
    type WatchlistState,
} from '@arc/db/schema';
import { watchlistStateAfterPlayback } from './completion';
import { batches } from '../utils';

const databaseBatchSize = 1_000;

export type WatchlistImportMode = 'add' | 'replace';

export interface WatchlistEntryInput {
    anilistId: number;
    title: string | null;
    state: WatchlistState;
    addedAt: Date;
    updatedAt: Date;
}

export async function getWatchlistState(userId: string | undefined, anilistId: number) {
    if (!userId) {
        return null;
    }

    const animeId = await findInternalAnimeId(anilistId);
    if (!animeId) {
        return null;
    }

    const [entry] = await db
        .select({ state: watchlist.state })
        .from(watchlist)
        .where(and(eq(watchlist.userId, userId), eq(watchlist.animeId, animeId)))
        .limit(1);

    return entry?.state ?? null;
}

export async function getWatchlistStates(userId: string) {
    return db
        .select({
            animeId: animeExternalId.externalId,
            state: watchlist.state,
        })
        .from(watchlist)
        .innerJoin(animeExternalIdLink, eq(animeExternalIdLink.animeId, watchlist.animeId))
        .innerJoin(animeExternalId, eq(animeExternalId.id, animeExternalIdLink.externalIdId))
        .where(
            and(
                eq(watchlist.userId, userId),
                eq(animeExternalId.provider, 'anilist'),
                eq(animeExternalId.mediaType, 'anime')
            )
        );
}

export async function getWatchlistEntries(userId: string) {
    return db
        .select({
            internalAnimeId: watchlist.animeId,
            anilistId: animeExternalId.externalId,
            title: anime.title,
            catalogTitle: animeCatalog.title,
            details: animeRelease.data,
            state: watchlist.state,
            addedAt: watchlist.createdAt,
            updatedAt: watchlist.updatedAt,
        })
        .from(watchlist)
        .innerJoin(anime, eq(anime.id, watchlist.animeId))
        .innerJoin(animeExternalIdLink, eq(animeExternalIdLink.animeId, watchlist.animeId))
        .innerJoin(animeExternalId, eq(animeExternalId.id, animeExternalIdLink.externalIdId))
        .leftJoin(animeCatalog, eq(animeCatalog.anilistId, animeExternalId.externalId))
        .leftJoin(animeRelease, eq(animeRelease.anilistId, animeExternalId.externalId))
        .where(
            and(
                eq(watchlist.userId, userId),
                eq(animeExternalId.provider, 'anilist'),
                eq(animeExternalId.mediaType, 'anime')
            )
        )
        .orderBy(
            desc(watchlist.updatedAt),
            desc(watchlist.createdAt),
            desc(animeExternalId.externalId)
        );
}

export async function storeMissingWatchlistTitles(
    entries: ReadonlyArray<{ internalAnimeId: number; title: string }>
) {
    if (!entries.length) {
        return;
    }

    const values = sql.join(
        entries.map(({ internalAnimeId, title }) => sql`(${internalAnimeId}, ${title})`),
        sql.raw(', ')
    );
    await db.execute(sql`
        update ${anime}
        set title = source.title, updated_at = now()
        from (values ${values}) as source(id, title)
        where ${anime.id} = source.id::integer and ${anime.title} is null
    `);
}

export async function applyWatchlistEntries(
    userId: string,
    entries: WatchlistEntryInput[],
    mode: WatchlistImportMode
) {
    return db.transaction(async (tx) => {
        const anilistIds = [...new Set(entries.map(({ anilistId }) => anilistId))];

        for (const batch of batches(anilistIds, databaseBatchSize)) {
            await tx
                .insert(animeExternalId)
                .values(
                    batch.map((externalId) => ({
                        provider: 'anilist' as const,
                        mediaType: 'anime' as const,
                        externalId,
                    }))
                )
                .onConflictDoNothing();
        }

        const externalIds: Array<{ id: number; externalId: number }> = [];
        for (const batch of batches(anilistIds, databaseBatchSize)) {
            externalIds.push(
                ...(await tx
                    .select({ id: animeExternalId.id, externalId: animeExternalId.externalId })
                    .from(animeExternalId)
                    .where(
                        and(
                            eq(animeExternalId.provider, 'anilist'),
                            eq(animeExternalId.mediaType, 'anime'),
                            inArray(animeExternalId.externalId, batch)
                        )
                    ))
            );
        }

        const links: Array<{ animeId: number; externalIdId: number }> = [];
        for (const batch of batches(
            externalIds.map(({ id }) => id),
            databaseBatchSize
        )) {
            links.push(
                ...(await tx
                    .select({
                        animeId: animeExternalIdLink.animeId,
                        externalIdId: animeExternalIdLink.externalIdId,
                    })
                    .from(animeExternalIdLink)
                    .where(inArray(animeExternalIdLink.externalIdId, batch)))
            );
        }

        const linkedExternalIds = new Set(links.map(({ externalIdId }) => externalIdId));
        const missing = externalIds.filter(({ id }) => !linkedExternalIds.has(id));
        for (const batch of batches(missing, databaseBatchSize)) {
            const created = await tx
                .insert(anime)
                .values(
                    batch.map(({ externalId }) => ({
                        title: entries.find(({ anilistId }) => anilistId === externalId)?.title,
                    }))
                )
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
            links.map(({ animeId, externalIdId }) => [externalIdId, animeId])
        );
        const animeIdByAniListId = new Map(
            externalIds.map(({ id, externalId }) => [externalId, animeIdByExternalId.get(id)])
        );
        const rows = entries.map((entry) => {
            const animeId = animeIdByAniListId.get(entry.anilistId);
            if (!animeId) {
                throw new Error(`Failed to store anime identity ${entry.anilistId}`);
            }
            return {
                userId,
                animeId,
                state: entry.state,
                createdAt: entry.addedAt,
                updatedAt: entry.updatedAt,
            };
        });
        const current = await tx
            .select({ animeId: watchlist.animeId })
            .from(watchlist)
            .where(eq(watchlist.userId, userId));
        const currentAnimeIds = new Set(current.map(({ animeId }) => animeId));
        const dirtyAnimeIds = [
            ...new Set([...currentAnimeIds, ...rows.map(({ animeId }) => animeId)]),
        ];
        await tx
            .insert(animeInterestDirty)
            .values(dirtyAnimeIds.map((animeId) => ({ userId, animeId })))
            .onConflictDoUpdate({
                target: [animeInterestDirty.userId, animeInterestDirty.animeId],
                set: {
                    dirtyAt: new Date(),
                },
            });

        if (mode === 'replace') {
            await tx.delete(watchlist).where(eq(watchlist.userId, userId));
            for (const batch of batches(rows, databaseBatchSize)) {
                await tx.insert(watchlist).values(batch);
            }
            return { added: rows.length, skipped: 0 };
        }

        const added = rows.filter(({ animeId }) => !currentAnimeIds.has(animeId));
        for (const batch of batches(added, databaseBatchSize)) {
            await tx.insert(watchlist).values(batch).onConflictDoNothing();
        }
        return { added: added.length, skipped: rows.length - added.length };
    });
}

async function setInternalWatchlistState(userId: string, animeId: number, state: WatchlistState) {
    const [current] = await db
        .select({ state: watchlist.state })
        .from(watchlist)
        .where(and(eq(watchlist.userId, userId), eq(watchlist.animeId, animeId)))
        .limit(1);

    if (current?.state === state) {
        return state;
    }

    if (current) {
        await db
            .update(watchlist)
            .set({ state, updatedAt: new Date() })
            .where(and(eq(watchlist.userId, userId), eq(watchlist.animeId, animeId)));
        await markAnimeInterestDirty(userId, animeId);

        return state;
    }

    const [created] = await db
        .insert(watchlist)
        .values({ userId, animeId, state })
        .onConflictDoNothing()
        .returning({ state: watchlist.state });

    if (created) {
        await markAnimeInterestDirty(userId, animeId);
        return created.state;
    }

    return setInternalWatchlistState(userId, animeId, state);
}

export async function setWatchlistState(
    userId: string,
    anilistId: number,
    state: WatchlistState,
    title?: string
) {
    const animeId = await ensureInternalAnimeId(anilistId, title);

    const [current] = await db
        .select({ state: watchlist.state })
        .from(watchlist)
        .where(and(eq(watchlist.userId, userId), eq(watchlist.animeId, animeId)))
        .limit(1);

    if (current?.state !== state) {
        await db
            .insert(watchlist)
            .values({ userId, animeId, state })
            .onConflictDoUpdate({
                target: [watchlist.userId, watchlist.animeId],
                set: {
                    state,
                    updatedAt: new Date(),
                },
            });
    }
    await markAnimeInterestDirty(userId, animeId);

    return state;
}

async function markAnimeInterestDirty(userId: string, animeId: number) {
    await db
        .insert(animeInterestDirty)
        .values({ userId, animeId })
        .onConflictDoUpdate({
            target: [animeInterestDirty.userId, animeInterestDirty.animeId],
            set: {
                dirtyAt: new Date(),
            },
        });
}

export async function removeFromWatchlist(userId: string, anilistId: number) {
    const animeId = await findInternalAnimeId(anilistId);
    if (!animeId) {
        return;
    }

    await db
        .delete(watchlist)
        .where(and(eq(watchlist.userId, userId), eq(watchlist.animeId, animeId)));
    await markAnimeInterestDirty(userId, animeId);
}

export async function updateWatchlistAfterPlayback(
    userId: string,
    animeId: number,
    input: PlaybackProgressInput
) {
    const [current] = await db
        .select({ state: watchlist.state })
        .from(watchlist)
        .where(and(eq(watchlist.userId, userId), eq(watchlist.animeId, animeId)))
        .limit(1);

    if (current && (!input.completed || current.state === 'completed')) {
        return;
    }

    const [[release], episodes] = await Promise.all([
        db
            .select({
                mediaStatus: animeEpisodeSync.mediaStatus,
                expectedEpisodes: animeEpisodeSync.expectedEpisodes,
            })
            .from(animeEpisodeSync)
            .where(eq(animeEpisodeSync.anilistId, input.animeId))
            .limit(1),
        db
            .select({
                episodeId: animeEpisode.episodeId,
                number: animeEpisode.number,
            })
            .from(animeEpisode)
            .where(eq(animeEpisode.anilistId, input.animeId)),
    ]);
    const next = watchlistStateAfterPlayback(current?.state ?? null, release ?? null, episodes, {
        episodeId: input.episodeId,
        number: input.episodeNumber,
        completed: input.completed,
    });

    if (next === null || next === current?.state) {
        return;
    }

    await setInternalWatchlistState(userId, animeId, next);
}
