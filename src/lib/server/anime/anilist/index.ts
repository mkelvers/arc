import { Effect } from 'effect';
import { eq } from 'drizzle-orm';

import { AnimeDocument } from '$lib/graphql/anilist/generated/graphql';
import type { AnimeQuery } from '$lib/graphql/anilist/generated/graphql';
import { db } from '$lib/server/db';
import { animeDetailsCache } from '$lib/server/db/schema';
import { graphql, GraphQLRequestError } from '$lib/server/graphql';

const endpoint = 'https://graphql.anilist.co';
const cacheVersion = 1;
const cacheLifetime = 6 * 60 * 60 * 1_000;
const requests = new Map<number, Promise<AniListAnime>>();
type AniListAnime = NonNullable<AnimeQuery['Media']>;

function requestAnime(id: number) {
    return graphql(endpoint, AnimeDocument, { id }).pipe(
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

async function refreshAnime(id: number) {
    const pending = requests.get(id);
    if (pending) return pending;

    const request = Effect.runPromise(requestAnime(id)).then(async (data) => {
        await db
            .insert(animeDetailsCache)
            .values({
                anilistId: id,
                data,
                version: cacheVersion,
                fetchedAt: new Date(),
            })
            .onConflictDoUpdate({
                target: animeDetailsCache.anilistId,
                set: {
                    data,
                    version: cacheVersion,
                    fetchedAt: new Date(),
                },
            });

        return data;
    });
    requests.set(id, request);

    try {
        return await request;
    } finally {
        requests.delete(id);
    }
}

async function cachedAnime(id: number) {
    const [cached] = await db
        .select({
            data: animeDetailsCache.data,
            version: animeDetailsCache.version,
            fetchedAt: animeDetailsCache.fetchedAt,
        })
        .from(animeDetailsCache)
        .where(eq(animeDetailsCache.anilistId, id))
        .limit(1);

    if (cached?.version === cacheVersion) {
        if (Date.now() - cached.fetchedAt.getTime() > cacheLifetime) {
            void refreshAnime(id).catch((cause) =>
                console.error(`AniList refresh failed for ${id}`, cause),
            );
        }

        return cached.data;
    }

    return refreshAnime(id);
}

function getAnime(id: number) {
    return Effect.tryPromise({
        try: () => cachedAnime(id),
        catch: (cause) =>
            cause instanceof GraphQLRequestError
                ? cause
                : new GraphQLRequestError({
                      message: 'Anime details could not be loaded',
                      cause,
                  }),
    });
}

export const anilist = {
    getAnime,
};
