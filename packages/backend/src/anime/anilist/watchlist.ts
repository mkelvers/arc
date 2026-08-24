import { AnimeCardSchema, type AnimeCard } from '@arc/shared/types';
import { WatchlistAnimeDocument } from '@arc/shared/anilist/generated/graphql';
import { inArray, sql } from 'drizzle-orm';
import { batches } from '../../utils';
import { db } from '@arc/db';
import { animeCardCache } from '@arc/db/schema';
import { RequestCache } from '../../request-cache';
import { request } from './client';
import { animeCard } from './models';
import { present } from './text';
import { watchlistCardFreshForMs } from './watchlist-refresh';

const cache = new RequestCache<string, Map<number, AnimeCard>>(5 * 60 * 1_000);

async function requestAnime(ids: number[]) {
    const fetched: AnimeCard[] = [];

    for (const idsBatch of batches(ids, 50)) {
        const response = await request(
            WatchlistAnimeDocument,
            { ids: idsBatch },
            { forceRefresh: true }
        );
        for (const entry of present(response.Page?.media)) {
            const card = animeCard(entry);
            if (card) {
                fetched.push(card);
            }
        }
    }

    if (fetched.length) {
        try {
            await db
                .insert(animeCardCache)
                .values(
                    fetched.map((data) => ({
                        anilistId: data.id,
                        data,
                        fetchedAt: new Date(),
                    }))
                )
                .onConflictDoUpdate({
                    target: animeCardCache.anilistId,
                    set: { data: sql`excluded.data`, fetchedAt: new Date() },
                });
        } catch (cause) {
            console.warn('Watchlist metadata cache write failed', cause);
        }
    }
}

export async function getWatchlistAnime(ids: number[]) {
    if (!ids.length) {
        return Promise.resolve([]);
    }

    const uniqueIds = [...new Set(ids)];
    const key = [...uniqueIds].sort((left, right) => left - right).join(',');

    return cache
        .get(
            key,
            async () => {
                const now = Date.now();
                const rows = await db
                    .select({
                        id: animeCardCache.anilistId,
                        data: animeCardCache.data,
                        fetchedAt: animeCardCache.fetchedAt,
                    })
                    .from(animeCardCache)
                    .where(inArray(animeCardCache.anilistId, uniqueIds));
                const stored = new Map(
                    rows.flatMap(({ id, data }) => {
                        const parsed = AnimeCardSchema.safeParse(data);
                        return parsed.success ? ([[id, parsed.data]] as const) : [];
                    })
                );
                const invalidIds = rows.flatMap(({ id }) => (stored.has(id) ? [] : [id]));
                if (invalidIds.length) {
                    try {
                        await db
                            .delete(animeCardCache)
                            .where(inArray(animeCardCache.anilistId, invalidIds));
                    } catch (cause) {
                        console.warn('Invalid watchlist metadata cleanup failed', cause);
                    }
                }
                const staleIds = rows.flatMap(({ id, fetchedAt }) => {
                    const data = stored.get(id);
                    return !data || now - fetchedAt.getTime() >= watchlistCardFreshForMs(data)
                        ? [id]
                        : [];
                });
                const missingIds = uniqueIds.filter((id) => !stored.has(id));
                const refreshIds = [...new Set([...missingIds, ...staleIds])];

                if (refreshIds.length) {
                    void requestAnime(refreshIds).catch((cause) => {
                        console.warn('Watchlist metadata refresh failed', cause);
                    });
                }

                return stored;
            },
            {
                staleIfError: true,
                staleWhileRevalidate: true,
            }
        )
        .then((cards) =>
            uniqueIds.flatMap((id) => {
                const card = cards.get(id);
                return card ? [card] : [];
            })
        );
}
