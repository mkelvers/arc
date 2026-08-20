import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { AnimeDocument } from '$lib/graphql/anilist/generated/graphql';
import { db } from '@arc/db';
import { animeDetailsCache } from '@arc/db/schema';
import { GraphQLRequestError } from '$lib/server/graphql';
import { request } from './client';
import type { AniListAnime } from './types';

const version = 2;
const requests = new Map<number, Promise<AniListAnime>>();
const backgroundRefreshes = new Set<number>();
const retryAt = new Map<number, number>();
const retryAttempts = new Map<number, number>();

function refreshRetryDelay(cause: unknown, attempt = 1) {
    if (cause instanceof GraphQLRequestError && cause.status === 404) {
        return 6 * 60 * 60 * 1_000;
    }
    const base = 60_000;
    const max = 30 * 60 * 1_000;
    const delay = Math.min(base * 2 ** (attempt - 1), max);
    return Math.floor(delay / 2 + (Math.random() * delay) / 2);
}

async function requestAnime(id: number) {
    const { Media } = await request(AnimeDocument, { id }, { forceRefresh: true });
    if (!Media) {
        throw new GraphQLRequestError({
            message: 'AniList returned no anime',
        });
    }

    return Media;
}

export async function refreshAnime(id: number) {
    const pending = requests.get(id);
    if (pending) {
        return pending;
    }

    const request = requestAnime(id).then(async (data) => {
        try {
            await db
                .insert(animeDetailsCache)
                .values({
                    anilistId: id,
                    data,
                    version,
                    fetchedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: animeDetailsCache.anilistId,
                    set: {
                        data,
                        version,
                        fetchedAt: new Date(),
                    },
                });
        } catch (cause) {
            console.error(`AniList cache write failed for ${id}`, cause);
        }

        return data;
    });
    requests.set(id, request);

    try {
        return await request;
    } finally {
        requests.delete(id);
    }
}

export async function getAnime(id: number) {
    let stored:
        | {
              data: AniListAnime;
              version: number;
              fetchedAt: Date;
          }
        | undefined;

    try {
        [stored] = await db
            .select({
                data: animeDetailsCache.data,
                version: animeDetailsCache.version,
                fetchedAt: animeDetailsCache.fetchedAt,
            })
            .from(animeDetailsCache)
            .where(eq(animeDetailsCache.anilistId, id))
            .limit(1);
    } catch (cause) {
        console.error(`AniList cache read failed for ${id}`, cause);
    }

    if (stored?.version === version) {
        const airingAt = stored.data.nextAiringEpisode?.airingAt;
        const parsedAiringAt = z.number().safeParse(airingAt);
        const airingPassed =
            stored.data.status === 'RELEASING' &&
            parsedAiringAt.success &&
            parsedAiringAt.data * 1_000 <= Date.now();
        if (airingPassed && (retryAt.get(id) ?? 0) <= Date.now()) {
            try {
                const anime = await refreshAnime(id);
                retryAt.delete(id);
                retryAttempts.delete(id);
                return anime;
            } catch (cause) {
                const attempt = (retryAttempts.get(id) ?? 0) + 1;
                retryAttempts.set(id, attempt);
                retryAt.set(id, Date.now() + refreshRetryDelay(cause, attempt));
                console.warn(
                    `AniList airing refresh deferred for ${id}: ${cause instanceof Error ? cause.message : String(cause)}`
                );
                return stored.data;
            }
        }

        if (
            Date.now() - stored.fetchedAt.getTime() > 24 * 60 * 60 * 1_000 &&
            (retryAt.get(id) ?? 0) <= Date.now() &&
            !backgroundRefreshes.has(id)
        ) {
            backgroundRefreshes.add(id);
            const jitter = Math.floor(Math.random() * 5 * 60 * 1_000);
            setTimeout(() => {
                void refreshAnime(id)
                    .then(
                        () => {
                            retryAt.delete(id);
                            retryAttempts.delete(id);
                        },
                        (cause) => {
                            const attempt = (retryAttempts.get(id) ?? 0) + 1;
                            retryAttempts.set(id, attempt);
                            retryAt.set(id, Date.now() + refreshRetryDelay(cause, attempt));
                            console.warn(
                                `AniList cached details refresh deferred for ${id}: ${cause instanceof Error ? cause.message : String(cause)}`
                            );
                        }
                    )
                    .finally(() => backgroundRefreshes.delete(id));
            }, jitter);
        }

        return stored.data;
    }

    try {
        return await refreshAnime(id);
    } catch (cause) {
        if (stored) {
            console.error(`AniList refresh failed for ${id}; using stale cache`, cause);
            return stored.data;
        }

        throw cause;
    }
}
