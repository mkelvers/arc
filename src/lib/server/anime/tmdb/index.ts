import createClient from 'openapi-fetch';
import { and, eq, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { AnimeQuery } from '$lib/graphql/anilist/generated/graphql';
import { db } from '$lib/server/db';
import {
    anime as animeTable,
    animeArtwork,
    animeArtworkCache,
    animeArtworkPreference,
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
    selectedBackdrop: TmdbArtworkImage | null;
    selectedLogo: TmdbArtworkImage | null;
    logoHidden: boolean;
    logoSize: number;
}

function normalizeTitle(title: string) {
    return title
        .normalize('NFKD')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .toLocaleLowerCase('en');
}

function seriesTitle(title: string) {
    let value = normalizeTitle(title);
    let previous = '';

    while (value !== previous) {
        previous = value;
        value = value
            .replace(
                /\s+(?:(?:season|part|cour)\s+\d+|\d+(?:st|nd|rd|th)\s+season)$/,
                '',
            )
            .replace(/\s+final\s+season$/, '')
            .replace(/\s+(?:19|20)\d{2}$/, '')
            .replace(/\s+第\s*\d+\s*期$/u, '')
            .trim();
    }

    return value;
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

function mappingTitlesFor(anime: AniListAnime) {
    return [
        ...titlesFor(anime).slice(0, 3),
        ...(anime.relations?.edges ?? []).flatMap((edge) =>
            edge?.relationType === 'ADAPTATION'
                ? [
                      edge.node?.title?.english,
                      edge.node?.title?.romaji,
                      edge.node?.title?.native,
                  ]
                : [],
        ),
    ].filter(
        (title, index, titles): title is string =>
            Boolean(title?.trim()) && titles.indexOf(title) === index,
    );
}

function candidateScore(candidate: Candidate, anime: AniListAnime) {
    const mappingTitles = mappingTitlesFor(anime);
    const titles = mappingTitles.map(normalizeTitle);
    const names = [candidate.name, candidate.originalName].map(normalizeTitle);
    const exactTitle = names.some((name) => titles.includes(name));
    const seriesTitles = mappingTitles.map(seriesTitle);
    const exactSeriesTitle = names.some((name) => seriesTitles.includes(name));
    const yearQualifiedSeriesTitle = names.some((name) =>
        mappingTitles.some((title) => {
            const normalized = normalizeTitle(title);

            return (
                /\s(?:19|20)\d{2}$/.test(normalized) &&
                seriesTitle(title) === name
            );
        }),
    );
    const partialTitle = names.some((name) =>
        titles.some((title) => name.includes(title) || title.includes(name)),
    );
    const animeYear = anime.startDate?.year ?? anime.seasonYear;
    const candidateYear = Number(candidate.date?.slice(0, 4)) || null;
    const yearDistance =
        animeYear && candidateYear ? Math.abs(animeYear - candidateYear) : 0;

    const titleScore = exactTitle ? 100 : exactSeriesTitle ? 95 : partialTitle ? 55 : 0;
    const yearPenalty = exactSeriesTitle && !yearQualifiedSeriesTitle
        ? 0
        : Math.min(yearDistance * 8, 40);

    return titleScore - yearPenalty + Math.log10(candidate.popularity + 1);
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

async function findStoredMappingByAniListId(
    anilistId: number,
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
                eq(animeExternalId.externalId, anilistId),
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
        throw new Error(`Ambiguous TMDB mapping for AniList ${anilistId}`);
    }

    return null;
}

function findStoredMapping(anime: AniListAnime) {
    return findStoredMappingByAniListId(anime.id);
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
                .values({ title: titlesFor(anime)[0] ?? null })
                .returning({ animeId: animeTable.id });

            if (!created) throw new Error('Failed to store anime');
            link = created;
            await tx.insert(animeExternalIdLink).values({
                animeId: link.animeId,
                externalIdId: anilistId.id,
            });
        }

        await tx
            .update(animeTable)
            .set({ title: titlesFor(anime)[0] ?? null, updatedAt: new Date() })
            .where(eq(animeTable.id, link.animeId));

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

    if (stored) {
        await db
            .update(animeTable)
            .set({ title: titlesFor(anime)[0] ?? null, updatedAt: new Date() })
            .where(eq(animeTable.id, stored.animeId));
        return stored;
    }

    const relatedMappings = (
        await Promise.all(
            (anime.relations?.edges ?? []).flatMap((edge) =>
                edge?.node?.type === 'ANIME' &&
                (edge.relationType === 'PREQUEL' ||
                    edge.relationType === 'SEQUEL')
                    ? [findStoredMappingByAniListId(edge.node.id)]
                    : [],
            ),
        )
    ).filter((mapping): mapping is StoredTmdbMapping => mapping !== null);
    const related = [
        ...new Map(
            relatedMappings.map((mapping) => [
                `${mapping.mediaType}:${mapping.id}`,
                mapping,
            ]),
        ).values(),
    ];

    if (related.length === 1) {
        return persistMapping(anime, {
            id: related[0].id,
            mediaType: related[0].mediaType,
        });
    }

    const titles = mappingTitlesFor(anime);

    if (!titles.length) throw new Error('AniList returned no searchable title');

    const search = anime.format === 'MOVIE' ? searchMovies : searchTv;
    const queries = [
        ...new Set(
            titles.flatMap((title) => [title, seriesTitle(title)]),
        ),
    ];
    const candidates = (
        await Promise.all(queries.map((title) => search(title)))
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

function storedArtworkImage(
    image: typeof animeArtwork.$inferSelect,
): TmdbArtworkImage {
    return {
        aspectRatio: image.aspectRatio,
        filePath: image.filePath,
        height: image.height,
        language: image.language,
        url: `${imageBaseUrl}${image.filePath}`,
        voteAverage: image.voteAverage,
        width: image.width,
    };
}

async function withSelections(
    match: StoredTmdbMapping,
    artwork: Pick<TmdbArtwork, 'backdrops' | 'logos'>,
): Promise<TmdbArtwork> {
    const [preference] = await db
        .select({
            backdropFilePath: animeArtworkPreference.backdropFilePath,
            logoFilePath: animeArtworkPreference.logoFilePath,
            logoHidden: animeArtworkPreference.logoHidden,
            logoSize: animeArtworkPreference.logoSize,
        })
        .from(animeArtworkPreference)
        .where(eq(animeArtworkPreference.externalIdId, match.externalIdId))
        .limit(1);
    const logoHidden = preference?.logoHidden ?? false;

    return {
        id: match.id,
        mediaType: match.mediaType,
        ...artwork,
        selectedBackdrop:
            artwork.backdrops.find(
                (image) => image.filePath === preference?.backdropFilePath,
            ) ??
            artwork.backdrops[0] ??
            null,
        selectedLogo: logoHidden
            ? null
            : (artwork.logos.find(
                  (image) => image.filePath === preference?.logoFilePath,
              ) ??
              artwork.logos[0] ??
              null),
        logoHidden,
        logoSize: preference?.logoSize ?? 100,
    };
}

async function readArtwork(match: StoredTmdbMapping): Promise<TmdbArtwork | null> {
    const [cached] = await db
        .select({ externalIdId: animeArtworkCache.externalIdId })
        .from(animeArtworkCache)
        .where(eq(animeArtworkCache.externalIdId, match.externalIdId))
        .limit(1);

    if (!cached) return null;

    const images = await db
        .select()
        .from(animeArtwork)
        .where(eq(animeArtwork.externalIdId, match.externalIdId));
    const forType = (type: 'backdrop' | 'logo') =>
        images
            .filter((image) => image.type === type)
            .map(storedArtworkImage)
            .sort((left, right) => right.voteAverage - left.voteAverage);

    return withSelections(match, {
        backdrops: forType('backdrop'),
        logos: forType('logo'),
    });
}

async function fetchArtwork(match: StoredTmdbMapping) {
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

    await db.transaction(async (tx) => {
        const rows = [
            ...backdrops.map((image) => ({
                externalIdId: match.externalIdId,
                type: 'backdrop' as const,
                filePath: image.filePath,
                aspectRatio: image.aspectRatio,
                height: image.height,
                language: image.language,
                voteAverage: image.voteAverage,
                width: image.width,
            })),
            ...logos.map((image) => ({
                externalIdId: match.externalIdId,
                type: 'logo' as const,
                filePath: image.filePath,
                aspectRatio: image.aspectRatio,
                height: image.height,
                language: image.language,
                voteAverage: image.voteAverage,
                width: image.width,
            })),
        ];

        if (rows.length) {
            await tx
                .insert(animeArtwork)
                .values(rows)
                .onConflictDoUpdate({
                    target: [
                        animeArtwork.externalIdId,
                        animeArtwork.type,
                        animeArtwork.filePath,
                    ],
                    set: {
                        aspectRatio: sql.raw(
                            `excluded.${animeArtwork.aspectRatio.name}`,
                        ),
                        height: sql.raw(`excluded.${animeArtwork.height.name}`),
                        language: sql.raw(
                            `excluded.${animeArtwork.language.name}`,
                        ),
                        voteAverage: sql.raw(
                            `excluded.${animeArtwork.voteAverage.name}`,
                        ),
                        width: sql.raw(`excluded.${animeArtwork.width.name}`),
                    },
                });
        }
        await tx
            .insert(animeArtworkCache)
            .values({ externalIdId: match.externalIdId })
            .onConflictDoUpdate({
                target: animeArtworkCache.externalIdId,
                set: { fetchedAt: new Date() },
            });
    });

    return withSelections(match, {
        backdrops,
        logos,
    });
}

async function getArtwork(anime: AniListAnime) {
    const match = await resolveStored(anime);

    return (await readArtwork(match)) ?? fetchArtwork(match);
}

async function getStoredMedia(anilistId: number) {
    const match = await findStoredMappingByAniListId(anilistId);

    if (!match) return null;

    const [[stored], artwork] = await Promise.all([
        db
            .select({ title: animeTable.title })
            .from(animeTable)
            .where(eq(animeTable.id, match.animeId))
            .limit(1),
        readArtwork(match),
    ]);

    if (!stored?.title || !artwork) return null;

    return {
        anime: { id: anilistId, title: stored.title },
        artwork,
    };
}

async function refreshArtwork(anilistId: number) {
    const match = await findStoredMappingByAniListId(anilistId);

    if (!match) throw new Error(`No stored TMDB mapping for AniList ${anilistId}`);

    return fetchArtwork(match);
}

async function selectArtwork(
    anilistId: number,
    type: 'backdrop' | 'logo',
    filePath: string | null,
) {
    const match = await findStoredMappingByAniListId(anilistId);

    if (!match) throw new Error(`No stored TMDB mapping for AniList ${anilistId}`);

    const artwork = await readArtwork(match);

    if (!artwork) throw new Error('Artwork has not been cached yet');

    const images = type === 'backdrop' ? artwork.backdrops : artwork.logos;

    if (filePath === null && type !== 'logo') {
        throw new Error('Only a logo can be hidden');
    }
    if (filePath !== null && !images.some((image) => image.filePath === filePath)) {
        throw new Error('Artwork does not belong to this anime');
    }

    const updatedAt = new Date();

    if (type === 'backdrop') {
        await db
            .insert(animeArtworkPreference)
            .values({ externalIdId: match.externalIdId, backdropFilePath: filePath })
            .onConflictDoUpdate({
                target: animeArtworkPreference.externalIdId,
                set: { backdropFilePath: filePath, updatedAt },
            });
    } else {
        await db
            .insert(animeArtworkPreference)
            .values({
                externalIdId: match.externalIdId,
                logoFilePath: filePath,
                logoHidden: filePath === null,
            })
            .onConflictDoUpdate({
                target: animeArtworkPreference.externalIdId,
                set: {
                    logoFilePath: filePath,
                    logoHidden: filePath === null,
                    updatedAt,
                },
            });
    }
}

async function setLogoSize(anilistId: number, logoSize: number) {
    if (!Number.isInteger(logoSize) || logoSize < 50 || logoSize > 300) {
        throw new Error('Logo size must be between 50 and 300');
    }

    const match = await findStoredMappingByAniListId(anilistId);

    if (!match) throw new Error(`No stored TMDB mapping for AniList ${anilistId}`);

    await db
        .insert(animeArtworkPreference)
        .values({ externalIdId: match.externalIdId, logoSize })
        .onConflictDoUpdate({
            target: animeArtworkPreference.externalIdId,
            set: { logoSize, updatedAt: new Date() },
        });
}

export const tmdb = {
    create,
    getArtwork,
    getStoredMedia,
    refreshArtwork,
    resolve,
    selectArtwork,
    setLogoSize,
};
