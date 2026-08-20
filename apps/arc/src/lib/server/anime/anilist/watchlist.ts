import type { AnimeCard } from '$lib/types';
import { WatchlistAnimeDocument } from '$lib/graphql/anilist/generated/graphql';
import { inArray, sql } from 'drizzle-orm';
import { batches } from '$lib/utils';
import { db } from '@arc/db';
import { animeCardCache } from '@arc/db/schema';
import { RequestCache } from '$lib/server/request-cache';
import { request } from './client';
import { animeCard } from './models';
import { present } from './text';

const cache = new RequestCache<string, Map<number, AnimeCard>>(5 * 60 * 1_000);

async function requestAnime(ids: number[], stored: Map<number, AnimeCard>) {
    const result = new Map(stored);
    const fetched: AnimeCard[] = [];

    for (const idsBatch of batches(ids, 50)) {
        const response = await request(WatchlistAnimeDocument, { ids: idsBatch });
        for (const entry of present(response.Page?.media)) {
            const card = animeCard(entry);
            if (card) {
                result.set(card.id, card);
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

    return result;
}

export function getWatchlistAnime(ids: number[]) {
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
                const stored = new Map(rows.map(({ id, data }) => [id, data]));
                const staleIds = rows
                    .filter(
                        ({ data, fetchedAt }) =>
                            data.format == null ||
                            data.status == null ||
                            now - fetchedAt.getTime() >= 24 * 60 * 60 * 1_000
                    )
                    .map(({ id }) => id);
                const missingIds = uniqueIds.filter((id) => !stored.has(id));

                try {
                    return await requestAnime([...missingIds, ...staleIds], stored);
                } catch (cause) {
                    if (stored.size) {
                        console.warn(
                            'Watchlist metadata refresh failed; using cached values',
                            cause
                        );
                        return stored;
                    }
                    throw cause;
                }
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
