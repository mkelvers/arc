import { eq } from 'drizzle-orm';

import { AnimeDocument } from '$lib/graphql/anilist/generated/graphql';
import { db } from '$lib/server/db';
import { animeDetailsCache } from '$lib/server/db/schema';
import { GraphQLRequestError } from '$lib/server/graphql';
import { request } from './client';
import type { AniListAnime } from './types';

const version = 2;
const lifetime = 6 * 60 * 60 * 1_000;
const transientRetryDelay = 5 * 60 * 1_000;
const permanentRetryDelay = 6 * 60 * 60 * 1_000;
const requests = new Map<number, Promise<AniListAnime>>();
const backgroundRefreshes = new Set<number>();
const retryAt = new Map<number, number>();

function failureMessage(cause: unknown) {
    return cause instanceof Error ? cause.message : String(cause);
}

function refreshRetryDelay(cause: unknown) {
    return cause instanceof GraphQLRequestError && cause.status === 404
        ? permanentRetryDelay
        : transientRetryDelay;
}

async function requestAnime(id: number) {
    const { Media } = await request(AnimeDocument, { id });
    if (!Media) {
        throw new GraphQLRequestError({
            message: 'AniList returned no anime',
        });
    }

    return Media;
}

async function refresh(id: number) {
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
        if (
            Date.now() - stored.fetchedAt.getTime() > lifetime &&
            (retryAt.get(id) ?? 0) <= Date.now() &&
            !backgroundRefreshes.has(id)
        ) {
            backgroundRefreshes.add(id);
            void refresh(id)
                .then(
                    () => retryAt.delete(id),
                    (cause) => {
                        retryAt.set(id, Date.now() + refreshRetryDelay(cause));
                        console.warn(
                            `AniList cached details refresh deferred for ${id}: ${failureMessage(cause)}`
                        );
                    }
                )
                .finally(() => backgroundRefreshes.delete(id));
        }

        return stored.data;
    }

    try {
        return await refresh(id);
    } catch (cause) {
        if (stored) {
            console.error(`AniList refresh failed for ${id}; using stale cache`, cause);
            return stored.data;
        }

        throw cause;
    }
}
