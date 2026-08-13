import { eq } from 'drizzle-orm';

import { AnimeDocument } from '$lib/graphql/anilist/generated/graphql';
import { db } from '$lib/server/db';
import { animeDetailsCache } from '$lib/server/db/schema';
import { GraphQLRequestError } from '$lib/server/graphql';
import { request } from './client';
import type { AniListAnime } from './types';

const version = 2;
const requests = new Map<number, Promise<AniListAnime>>();
const backgroundRefreshes = new Set<number>();
const retryAt = new Map<number, number>();

function refreshRetryDelay(cause: unknown) {
    return cause instanceof GraphQLRequestError && cause.status === 404
        ? 6 * 60 * 60 * 1_000
        : 5 * 60 * 1_000;
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
        const airingPassed =
            stored.data.status === 'RELEASING' &&
            typeof stored.data.nextAiringEpisode?.airingAt === 'number' &&
            stored.data.nextAiringEpisode.airingAt * 1_000 <= Date.now();
        if (airingPassed && (retryAt.get(id) ?? 0) <= Date.now()) {
            try {
                return await refreshAnime(id);
            } catch (cause) {
                retryAt.set(id, Date.now() + refreshRetryDelay(cause));
                console.warn(
                    `AniList airing refresh deferred for ${id}: ${cause instanceof Error ? cause.message : String(cause)}`
                );
                return stored.data;
            }
        }

        if (
            Date.now() - stored.fetchedAt.getTime() > 6 * 60 * 60 * 1_000 &&
            (retryAt.get(id) ?? 0) <= Date.now() &&
            !backgroundRefreshes.has(id)
        ) {
            backgroundRefreshes.add(id);
            void refreshAnime(id)
                .then(
                    () => retryAt.delete(id),
                    (cause) => {
                        retryAt.set(id, Date.now() + refreshRetryDelay(cause));
                        console.warn(
                            `AniList cached details refresh deferred for ${id}: ${cause instanceof Error ? cause.message : String(cause)}`
                        );
                    }
                )
                .finally(() => backgroundRefreshes.delete(id));
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
