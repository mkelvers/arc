import createClient from 'openapi-fetch';
import { and, eq, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { AnimeQuery } from '$lib/graphql/anilist/generated/graphql';
import { db } from '$lib/server/db';
import {
    anime as animeTable,
    animeArtwork,
    animeArtworkCache,
    animeArtworkSelection,
    animeExternalId,
    animeExternalIdLink,
} from '$lib/server/db/schema';
import type { paths } from './generated';
import { env } from '$env/dynamic/private';

const baseUrl = 'https://api.themoviedb.org';
const imageBaseUrl = 'https://image.tmdb.org/t/p/original';

function create() {
    if (!env.TMDB_READ_ACCESS_TOKEN) {
        throw new TypeError('TMDB_READ_ACCESS_TOKEN is required');
    }

    return createClient<paths>({
        baseUrl,
        headers: {
            Authorization: `Bearer ${env.TMDB_READ_ACCESS_TOKEN}`,
        },
    });
}

type AniListAnime = NonNullable<AnimeQuery['Media']>;

export interface TmdbMapping {
    id: number;
    mediaType: 'movie' | 'tv';
}

interface Candidate extends TmdbMapping {
    date: string | null;
    name: string;
    originalName: string;
    popularity: number;
}

interface StoredTmdbMapping extends TmdbMapping {
    animeId: number;
    externalIdId: number;
}

export interface TmdbArtworkImage {
    aspectRatio: number;
    filePath: string;
    height: number;
    language: string | null;
    url: string;
    voteAverage: number;
    width: number;
}

export interface TmdbArtwork extends TmdbMapping {
    backdrops: TmdbArtworkImage[];
    logos: TmdbArtworkImage[];
}

function normalizeTitle(title: string) {
    return title
        .normalize('NFKD')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .toLocaleLowerCase('en');
}

function titlesFor(anime: AniListAnime) {
    return [
        anime.title?.english,
        anime.title?.romaji,
        anime.title?.native,
        ...(anime.synonyms ?? []),
    ].filter(
        (title, index, titles): title is string =>
            Boolean(title?.trim()) && titles.indexOf(title) === index,
    );
}

function candidateScore(candidate: Candidate, anime: AniListAnime) {
    const titles = titlesFor(anime).map(normalizeTitle);
    const names = [candidate.name, candidate.originalName].map(normalizeTitle);
    const exactTitle = names.some((name) => titles.includes(name));
    const partialTitle = names.some((name) =>
        titles.some((title) => name.includes(title) || title.includes(name)),
    );
    const animeYear = anime.startDate?.year ?? anime.seasonYear;
    const candidateYear = Number(candidate.date?.slice(0, 4)) || null;
    const yearDistance =
        animeYear && candidateYear ? Math.abs(animeYear - candidateYear) : 0;

    return (
        (exactTitle ? 100 : partialTitle ? 55 : 0) -
        Math.min(yearDistance * 8, 40) +
        Math.log10(candidate.popularity + 1)
    );
}

async function searchTv(query: string): Promise<Candidate[]> {
    const { data, error } = await create().GET('/3/search/tv', {
        params: { query: { query, include_adult: false } },
    });

    if (!data) throw new Error('TMDB TV search failed', { cause: error });

    return (data.results ?? []).flatMap((result) =>
        result.id
            ? [
                  {
                      id: result.id,
                      mediaType: 'tv' as const,
                      name: result.name ?? '',
                      originalName: result.original_name ?? '',
                      date: result.first_air_date ?? null,
                      popularity: result.popularity ?? 0,
                  },
              ]
            : [],
    );
}

async function searchMovies(query: string): Promise<Candidate[]> {
    const { data, error } = await create().GET('/3/search/movie', {
        params: { query: { query, include_adult: false } },
    });

    if (!data) throw new Error('TMDB movie search failed', { cause: error });

    return (data.results ?? []).flatMap((result) =>
        result.id
            ? [
                  {
                      id: result.id,
                      mediaType: 'movie' as const,
                      name: result.title ?? '',
                      originalName: result.original_title ?? '',
                      date: result.release_date ?? null,
                      popularity: result.popularity ?? 0,
                  },
              ]
            : [],
    );
}

async function findStoredMapping(
    anime: AniListAnime,
): Promise<StoredTmdbMapping | null> {
    const targetExternalId = alias(animeExternalId, 'target_external_id');
    const targetLink = alias(animeExternalIdLink, 'target_external_id_link');
    const mapped = await db
        .select({
            animeId: animeExternalIdLink.animeId,
            externalIdId: targetExternalId.id,
            id: targetExternalId.externalId,
            mediaType: targetExternalId.mediaType,
        })
        .from(animeExternalId)
        .innerJoin(
            animeExternalIdLink,
            eq(animeExternalIdLink.externalIdId, animeExternalId.id),
        )
        .innerJoin(
            targetLink,
            and(
                eq(targetLink.animeId, animeExternalIdLink.animeId),
                ne(targetLink.externalIdId, animeExternalId.id),
            ),
        )
        .innerJoin(
            targetExternalId,
            eq(targetExternalId.id, targetLink.externalIdId),
        )
        .where(
            and(
                eq(animeExternalId.provider, 'anilist'),
                eq(animeExternalId.mediaType, 'anime'),
                eq(animeExternalId.externalId, anime.id),
                eq(targetExternalId.provider, 'tmdb'),
            ),
        )
        .limit(2);

    if (mapped.length === 1) {
        const [match] = mapped;

        if (match.mediaType === 'movie' || match.mediaType === 'tv') {
            return {
                animeId: match.animeId,
                externalIdId: match.externalIdId,
                id: match.id,
                mediaType: match.mediaType,
            };
        }
    }

    if (mapped.length > 1) {
        throw new Error(`Ambiguous TMDB mapping for AniList ${anime.id}`);
    }

    return null;
}

async function persistMapping(
    anime: AniListAnime,
    mapping: TmdbMapping,
): Promise<StoredTmdbMapping> {
    return db.transaction(async (tx) => {
        await tx
            .insert(animeExternalId)
            .values({
                provider: 'anilist',
                mediaType: 'anime',
                externalId: anime.id,
            })
            .onConflictDoNothing();
        const [anilistId] = await tx
            .select({ id: animeExternalId.id })
            .from(animeExternalId)
            .where(
                and(
                    eq(animeExternalId.provider, 'anilist'),
                    eq(animeExternalId.mediaType, 'anime'),
                    eq(animeExternalId.externalId, anime.id),
                ),
            )
            .limit(1);

        if (!anilistId) throw new Error('Failed to store AniList identity');

        let [link] = await tx
            .select({ animeId: animeExternalIdLink.animeId })
            .from(animeExternalIdLink)
            .where(eq(animeExternalIdLink.externalIdId, anilistId.id))
            .limit(1);

        if (!link) {
            const [created] = await tx
                .insert(animeTable)
                .values({})
                .returning({ animeId: animeTable.id });

            if (!created) throw new Error('Failed to store anime');
            link = created;
            await tx.insert(animeExternalIdLink).values({
                animeId: link.animeId,
                externalIdId: anilistId.id,
            });
        }

        await tx
            .insert(animeExternalId)
            .values({
                provider: 'tmdb',
                mediaType: mapping.mediaType,
                externalId: mapping.id,
            })
            .onConflictDoNothing();
        const [tmdbId] = await tx
            .select({ id: animeExternalId.id })
            .from(animeExternalId)
            .where(
                and(
                    eq(animeExternalId.provider, 'tmdb'),
                    eq(animeExternalId.mediaType, mapping.mediaType),
                    eq(animeExternalId.externalId, mapping.id),
                ),
            )
            .limit(1);

        if (!tmdbId) throw new Error('Failed to store TMDB identity');

        await tx
            .insert(animeExternalIdLink)
            .values({ animeId: link.animeId, externalIdId: tmdbId.id })
            .onConflictDoNothing();

        return {
            ...mapping,
            animeId: link.animeId,
            externalIdId: tmdbId.id,
        };
    });
}

async function resolveStored(anime: AniListAnime): Promise<StoredTmdbMapping> {
    const stored = await findStoredMapping(anime);

    if (stored) return stored;

    const titles = titlesFor(anime).slice(0, 3);

    if (!titles.length) throw new Error('AniList returned no searchable title');

    const search = anime.format === 'MOVIE' ? searchMovies : searchTv;
    const candidates = (
        await Promise.all(titles.map((title) => search(title)))
    ).flat();
    const unique = [
        ...new Map(
            candidates.map((candidate) => [
                `${candidate.mediaType}:${candidate.id}`,
                candidate,
            ]),
        ).values(),
    ];
    const match = unique.sort(
        (left, right) =>
            candidateScore(right, anime) - candidateScore(left, anime),
    )[0];

    if (!match || candidateScore(match, anime) < 85) {
        throw new Error(`No confident TMDB match for AniList ${anime.id}`);
    }

    return persistMapping(anime, {
        id: match.id,
        mediaType: match.mediaType,
    });
}

async function resolve(anime: AniListAnime): Promise<TmdbMapping> {
    const { id, mediaType } = await resolveStored(anime);

    return { id, mediaType };
}

function toArtworkImage(image: {
    aspect_ratio?: number;
    file_path?: string;
    height?: number;
    iso_639_1?: unknown;
    vote_average?: number;
    width?: number;
}): TmdbArtworkImage | null {
    if (!image.file_path) return null;

    return {
        aspectRatio: image.aspect_ratio ?? 0,
        filePath: image.file_path,
        height: image.height ?? 0,
        language:
            typeof image.iso_639_1 === 'string' ? image.iso_639_1 : null,
        url: `${imageBaseUrl}${image.file_path}`,
        voteAverage: image.vote_average ?? 0,
        width: image.width ?? 0,
    };
}

async function getArtwork(anime: AniListAnime, mapping?: TmdbMapping) {
    const match = mapping ?? (await resolve(anime));
    const client = create();
    const response =
        match.mediaType === 'movie'
            ? await client.GET('/3/movie/{movie_id}/images', {
                  params: {
                      path: { movie_id: match.id },
                      query: { include_image_language: 'en,null' },
                  },
              })
            : await client.GET('/3/tv/{series_id}/images', {
                  params: {
                      path: { series_id: match.id },
                      query: { include_image_language: 'en,null' },
                  },
              });

    if (!response.data) {
        throw new Error('TMDB artwork request failed', {
            cause: response.error,
        });
    }

    const images = response.data;
    const backdrops = (images.backdrops ?? [])
        .map(toArtworkImage)
        .filter((image): image is TmdbArtworkImage => image !== null)
        .sort((left, right) => right.voteAverage - left.voteAverage);
    const logos = (images.logos ?? [])
        .map(toArtworkImage)
        .filter((image): image is TmdbArtworkImage => image !== null)
        .sort((left, right) => right.voteAverage - left.voteAverage);

    return { ...match, backdrops, logos } satisfies TmdbArtwork;
}

export const tmdb = {
    create,
    getArtwork,
    resolve,
};
