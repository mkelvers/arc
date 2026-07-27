import { eq } from 'drizzle-orm';
import { Effect, Either } from 'effect';

import { AnimeDocument } from '$lib/graphql/anilist/generated/graphql';
import { db } from '$lib/server/db';
import { animeDetailsCache } from '$lib/server/db/schema';
import { GraphQLRequestError } from '$lib/server/graphql';
import { request } from './client';
import type { AniListAnime } from './types';

const version = 2;
const lifetime = 6 * 60 * 60 * 1_000;
const requests = new Map<number, Promise<AniListAnime>>();

function requestAnime(id: number) {
    return request(AnimeDocument, { id }).pipe(
        Effect.flatMap(({ Media }) =>
            Media
                ? Effect.succeed(Media)
                : Effect.fail(
                      new GraphQLRequestError({
                          message: 'AniList returned no anime',
                      }),
                  ),
        ),
    );
}

async function refresh(id: number) {
    const pending = requests.get(id);
    if (pending) {
        return pending;
    }

    const request = Effect.runPromise(
        requestAnime(id).pipe(Effect.either),
    ).then(async (result) => {
        if (Either.isLeft(result)) {
            throw result.left;
        }

        const data = result.right;

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

async function cached(id: number) {
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
        if (Date.now() - stored.fetchedAt.getTime() > lifetime) {
            void refresh(id).catch((cause) =>
                console.error(`AniList refresh failed for ${id}`, cause),
            );
        }

        return stored.data;
    }

    try {
        return await refresh(id);
    } catch (cause) {
        if (stored) {
            console.error(
                `AniList refresh failed for ${id}; using stale cache`,
                cause,
            );
            return stored.data;
        }

        throw cause;
    }
}

export function getAnime(id: number) {
    return Effect.tryPromise({
        try: () => cached(id),
        catch: (cause) =>
            cause instanceof GraphQLRequestError
                ? cause
                : new GraphQLRequestError({
                      message: 'Anime details could not be loaded',
                      cause,
                  }),
    });
}
