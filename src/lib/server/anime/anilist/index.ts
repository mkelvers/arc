import { Effect, Either } from 'effect';
import { eq } from 'drizzle-orm';

import {
    AnimeDocument,
    HomeAnimeDocument,
    SearchAnimePageDocument,
} from '$lib/graphql/anilist/generated/graphql';
import type {
    AnimeQuery,
    HomeAnimeQuery,
    MediaSeason,
    SearchAnimePageQuery,
} from '$lib/graphql/anilist/generated/graphql';
import type { AnimeCard } from '$lib/anime/types';
import { db } from '$lib/server/db';
import { animeDetailsCache } from '$lib/server/db/schema';
import { graphql, GraphQLRequestError } from '$lib/server/graphql';

const endpoint = 'https://graphql.anilist.co';
const cacheVersion = 2;
const cacheLifetime = 6 * 60 * 60 * 1_000;
const requests = new Map<number, Promise<AniListAnime>>();
const searchCacheLifetime = 5 * 60 * 1_000;
const searchCache = new Map<
    string,
    { data: AnimeCard[]; fetchedAt: number }
>();
const searchRequests = new Map<string, Promise<AnimeCard[]>>();
const homepageCacheLifetime = 30 * 60 * 1_000;
const homepageCache = new Map<
    string,
    { data: HomepageAnime; fetchedAt: number }
>();
const homepageRequests = new Map<string, Promise<HomepageAnime>>();
type AniListAnime = NonNullable<AnimeQuery['Media']>;
type SearchMedia = NonNullable<
    NonNullable<NonNullable<SearchAnimePageQuery['Page']>['media']>[number]
>;
type HomeHighlight = NonNullable<
    NonNullable<NonNullable<HomeAnimeQuery['highlights']>['media']>[number]
>;

export interface HomepageHighlight {
    id: number;
    title: string;
    image: string;
    description: string;
    genres: string[];
    format: string;
    score: number;
}

export interface HomepageAnime {
    highlights: HomepageHighlight[];
    season: AnimeCard[];
}

function present<T>(values: ReadonlyArray<T | null> | null | undefined): T[] {
    return values?.filter((value): value is T => value !== null) ?? [];
}

function formatEnum(value: string | null | undefined) {
    if (!value) return 'Anime';
    if (['TV', 'OVA', 'ONA'].includes(value)) return `Anime ${value}`;

    return `Anime ${value
        .toLowerCase()
        .replaceAll('_', ' ')
        .replace(/^./, (character) => character.toUpperCase())}`;
}

function formatHomepageEnum(value: string | null | undefined) {
    return formatEnum(value).replace(/^Anime\s+/, '');
}

function synopsis(value: string | null | undefined) {
    return value
        ? value
              .replace(/<br\s*\/?>/gi, ' ')
              .replace(/<[^>]+>/g, '')
              .replace(/\s+/g, ' ')
              .trim()
        : '';
}

function title(media: {
    id: number;
    title?: {
        english?: string | null;
        romaji?: string | null;
        native?: string | null;
    } | null;
}) {
    return (
        media.title?.english ??
        media.title?.romaji ??
        media.title?.native ??
        `Anime ${media.id}`
    );
}

function toAnimeCard(media: SearchMedia): AnimeCard | null {
    const image =
        media.coverImage?.extraLarge ?? media.coverImage?.large ?? null;
    if (!image) return null;

    return {
        id: media.id,
        href: `/anime/${media.id}`,
        watchHref: `/anime/${media.id}`,
        title: title(media),
        image,
        caption: formatEnum(media.format),
        score: media.averageScore ?? 0,
        genres: present(media.genres),
        synopsis: synopsis(media.description),
    };
}

function toHomepageHighlight(
    media: HomeHighlight,
): HomepageHighlight | null {
    const fallbackImage =
        media.coverImage?.extraLarge ?? media.coverImage?.large ?? null;
    const image = media.bannerImage ?? fallbackImage;
    if (!image || !fallbackImage) return null;

    return {
        id: media.id,
        title: title(media),
        image,
        description: synopsis(media.description),
        genres: present(media.genres),
        format: formatHomepageEnum(media.format),
        score: media.averageScore ?? 0,
    };
}

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

    const request = Effect.runPromise(
        requestAnime(id).pipe(Effect.either),
    ).then(async (result) => {
        if (Either.isLeft(result)) throw result.left;

        const data = result.right;

        try {
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

async function cachedAnime(id: number) {
    let cached:
        | {
              data: AniListAnime;
              version: number;
              fetchedAt: Date;
          }
        | undefined;

    try {
        [cached] = await db
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

    if (cached?.version === cacheVersion) {
        if (Date.now() - cached.fetchedAt.getTime() > cacheLifetime) {
            void refreshAnime(id).catch((cause) =>
                console.error(`AniList refresh failed for ${id}`, cause),
            );
        }

        return cached.data;
    }

    try {
        return await refreshAnime(id);
    } catch (cause) {
        if (cached) {
            console.error(
                `AniList refresh failed for ${id}; using stale cache`,
                cause,
            );
            return cached.data;
        }

        throw cause;
    }
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

async function requestSearch(search: string) {
    const results: AnimeCard[] = [];
    let page = 1;
    let hasNextPage = true;

    while (hasNextPage) {
        const response = await Effect.runPromise(
            graphql(endpoint, SearchAnimePageDocument, {
                search,
                page,
                perPage: 50,
            }),
        );
        const media = present(response.Page?.media);

        results.push(
            ...media.flatMap((entry) => {
                const card = toAnimeCard(entry);
                return card ? [card] : [];
            }),
        );

        hasNextPage = response.Page?.pageInfo?.hasNextPage === true;
        page += 1;
    }

    return results;
}

async function cachedSearch(search: string) {
    const key = search.trim().toLocaleLowerCase('en');
    if (!key) return [];

    const cached = searchCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < searchCacheLifetime) {
        return cached.data;
    }

    const pending = searchRequests.get(key);
    if (pending) return pending;

    const request = requestSearch(search.trim()).then((data) => {
        searchCache.set(key, { data, fetchedAt: Date.now() });
        return data;
    });
    searchRequests.set(key, request);

    try {
        return await request;
    } finally {
        searchRequests.delete(key);
    }
}

function searchAnime(search: string) {
    return Effect.tryPromise({
        try: () => cachedSearch(search),
        catch: (cause) =>
            cause instanceof GraphQLRequestError
                ? cause
                : new GraphQLRequestError({
                      message: 'Anime search could not be loaded',
                      cause,
                  }),
    });
}

async function requestHomepage(season: MediaSeason, seasonYear: number) {
    const response = await Effect.runPromise(
        graphql(endpoint, HomeAnimeDocument, { season, seasonYear }),
    );

    return {
        highlights: present(response.highlights?.media)
            .flatMap((entry) => {
                const highlight = toHomepageHighlight(entry);
                return highlight ? [highlight] : [];
            })
            .slice(0, 5),
        season: present(response.season?.media).flatMap((entry) => {
            const card = toAnimeCard(entry);
            return card ? [card] : [];
        }),
    };
}

async function cachedHomepage(season: MediaSeason, seasonYear: number) {
    const key = `${season}:${seasonYear}`;
    const cached = homepageCache.get(key);

    if (
        cached &&
        Date.now() - cached.fetchedAt < homepageCacheLifetime
    ) {
        return cached.data;
    }

    const pending = homepageRequests.get(key);
    if (pending) return pending;

    const request = requestHomepage(season, seasonYear).then((data) => {
        homepageCache.set(key, { data, fetchedAt: Date.now() });
        return data;
    });
    homepageRequests.set(key, request);

    try {
        return await request;
    } finally {
        homepageRequests.delete(key);
    }
}

function getHomepage(season: MediaSeason, seasonYear: number) {
    return Effect.tryPromise({
        try: () => cachedHomepage(season, seasonYear),
        catch: (cause) =>
            cause instanceof GraphQLRequestError
                ? cause
                : new GraphQLRequestError({
                      message: 'The home page could not be loaded',
                      cause,
                  }),
    });
}

export const anilist = {
    getAnime,
    getHomepage,
    searchAnime,
};
