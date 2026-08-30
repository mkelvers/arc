import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { db, excluded } from '@arc/db';
import { animeArtwork, animeArtworkCache, animeArtworkPreference } from '@arc/db/schema';
import { logger } from '@arc/backend/internal/logger';
import type { AniListAnime } from '../anilist/types';
import { create, imageUrl } from './client';
import { NoConfidentTmdbMappingError, resolveStored } from './mapping';
import { findArtworkMappings, type ArtworkMappings } from './mapping-store';
import { getPoster, readPoster } from './poster';
import type { Artwork, ArtworkImage, StoredMapping } from './types';

const artworkImageSchema = z.object({
    aspect_ratio: z.number().optional(),
    file_path: z.string().optional(),
    height: z.number().optional(),
    iso_639_1: z.string().nullable().optional(),
    vote_average: z.number().optional(),
    width: z.number().optional(),
});
type ArtworkImagePayload = z.infer<typeof artworkImageSchema>;
const tmdbLanguagesSchema = z.array(
    z.object({
        iso_639_1: z
            .string()
            .regex(/^[a-z]{2}$/)
            .optional(),
    })
);

let imageLanguageCodes: Promise<string[]> | undefined;

function allImageLanguages(client: ReturnType<typeof create>) {
    if (!imageLanguageCodes) {
        imageLanguageCodes = client
            .GET('/3/configuration/languages')
            .then(({ data, error }) => {
                if (!data) {
                    throw new Error('TMDB language configuration request failed', { cause: error });
                }

                const parsed = tmdbLanguagesSchema.safeParse(data);
                if (!parsed.success) {
                    throw new Error('TMDB returned invalid language configuration', {
                        cause: parsed.error,
                    });
                }

                return [
                    ...new Set([
                        'en-US',
                        ...parsed.data.flatMap(({ iso_639_1 }) => iso_639_1 ?? []),
                        'null',
                    ]),
                ];
            })
            .catch((cause) => {
                imageLanguageCodes = undefined;
                throw cause;
            });
    }

    return imageLanguageCodes;
}

function artworkImage(image: ArtworkImagePayload): ArtworkImage | null {
    if (!image.file_path) {
        return null;
    }

    return {
        aspectRatio: image.aspect_ratio ?? 0,
        filePath: image.file_path,
        height: image.height ?? 0,
        language: image.iso_639_1 ?? null,
        url: imageUrl(image.file_path),
        voteAverage: image.vote_average ?? 0,
        width: image.width ?? 0,
    };
}

function storedImage(image: typeof animeArtwork.$inferSelect): ArtworkImage {
    return {
        aspectRatio: image.aspectRatio,
        filePath: image.filePath,
        height: image.height,
        language: image.language,
        url: imageUrl(image.filePath),
        voteAverage: image.voteAverage,
        width: image.width,
    };
}

async function withSelections(
    mapping: ArtworkMappings,
    artwork: Pick<Artwork, 'backdrops' | 'logos'>
): Promise<Artwork> {
    const [match] = mapping.matches;
    if (!match) {
        throw new Error('Artwork mapping has no TMDB sources');
    }

    const [preference] = await db
        .select({
            backdropFilePath: animeArtworkPreference.backdropFilePath,
            logoFilePath: animeArtworkPreference.logoFilePath,
            logoHidden: animeArtworkPreference.logoHidden,
            logoSize: animeArtworkPreference.logoSize,
        })
        .from(animeArtworkPreference)
        .where(eq(animeArtworkPreference.externalIdId, mapping.preferenceExternalIdId))
        .limit(1);
    const logoHidden = preference?.logoHidden ?? false;
    const selectDefault = (images: ArtworkImage[]) =>
        [...images].sort(
            (left, right) =>
                right.width * right.height - left.width * left.height ||
                right.voteAverage - left.voteAverage ||
                left.filePath.localeCompare(right.filePath)
        )[0] ?? null;

    return {
        id: match.id,
        mediaType: match.mediaType,
        ...artwork,
        selectedBackdrop:
            artwork.backdrops.find(({ filePath }) => filePath === preference?.backdropFilePath) ??
            selectDefault(artwork.backdrops),
        selectedLogo: logoHidden
            ? null
            : (artwork.logos.find(({ filePath }) => filePath === preference?.logoFilePath) ??
              selectDefault(artwork.logos)),
        selectedPoster: null,
        logoHidden,
        logoSize: preference?.logoSize ?? 100,
    };
}

function mergeArtwork(
    artwork: Pick<Artwork, 'backdrops' | 'logos'>[]
): Pick<Artwork, 'backdrops' | 'logos'> {
    const merge = (type: 'backdrops' | 'logos') =>
        [
            ...new Map(
                artwork.flatMap((images) => images[type]).map((image) => [image.filePath, image])
            ).values(),
        ].sort((left, right) => right.voteAverage - left.voteAverage);

    return { backdrops: merge('backdrops'), logos: merge('logos') };
}

export async function readArtwork(mapping: ArtworkMappings): Promise<Artwork | null> {
    const externalIdIds = mapping.matches.map(({ externalIdId }) => externalIdId);
    const cached = await db
        .select({
            externalIdId: animeArtworkCache.externalIdId,
        })
        .from(animeArtworkCache)
        .where(
            and(
                inArray(animeArtworkCache.externalIdId, externalIdIds),
                eq(animeArtworkCache.allLanguages, true)
            )
        );

    if (cached.length !== externalIdIds.length) {
        return null;
    }

    const images = await db
        .select()
        .from(animeArtwork)
        .where(inArray(animeArtwork.externalIdId, externalIdIds));
    const artwork = mapping.matches.map((match) => {
        const forType = (type: 'backdrop' | 'logo') =>
            images
                .filter((image) => image.externalIdId === match.externalIdId && image.type === type)
                .map(storedImage);
        const backdrops = forType('backdrop');
        const logos = forType('logo');
        return { backdrops, logos };
    });

    if (artwork.some((source) => source === null)) {
        return null;
    }

    return withSelections(
        mapping,
        mergeArtwork(
            artwork.filter(
                (source): source is Pick<Artwork, 'backdrops' | 'logos'> => source !== null
            )
        )
    );
}

async function fetchArtworkSource(match: StoredMapping) {
    const client = create();

    const unfilteredResponse =
        match.mediaType === 'movie'
            ? await client.GET('/3/movie/{movie_id}/images', {
                  params: { path: { movie_id: match.id } },
              })
            : await client.GET('/3/tv/{series_id}/images', {
                  params: { path: { series_id: match.id } },
              });

    const languageCodes = await allImageLanguages(client).catch((cause) => {
        logger.debug(`TMDB language configuration failed for ${match.id}`, cause);
        return [];
    });
    const allLanguagesQuery = {
        // TMDB uses xx for images without a language, including freshly added images.
        include_image_language: [...new Set([...languageCodes, 'null', 'xx'])].join(','),
    };
    const languageResponse = await (
        match.mediaType === 'movie'
            ? client.GET('/3/movie/{movie_id}/images', {
                  params: {
                      path: { movie_id: match.id },
                      query: allLanguagesQuery,
                  },
              })
            : client.GET('/3/tv/{series_id}/images', {
                  params: {
                      path: { series_id: match.id },
                      query: allLanguagesQuery,
                  },
              })
    ).catch((cause) => {
        logger.debug(`TMDB all-language artwork request failed for ${match.id}`, cause);
        return null;
    });

    if (!unfilteredResponse.data && !languageResponse?.data) {
        throw new Error('TMDB artwork request failed', {
            cause: unfilteredResponse.error,
        });
    }

    const images = [unfilteredResponse.data, languageResponse?.data].filter(
        (data): data is NonNullable<typeof unfilteredResponse.data> => Boolean(data)
    );
    const backdrops = images
        .flatMap((data) => data.backdrops ?? [])
        .flatMap((image) => {
            const parsed = artworkImageSchema.safeParse(image);
            return parsed.success ? [artworkImage(parsed.data)] : [];
        })
        .filter((image): image is ArtworkImage => image !== null)
        .filter(
            (image, index, all) =>
                all.findIndex(({ filePath }) => filePath === image.filePath) === index
        )
        .sort((left, right) => right.voteAverage - left.voteAverage);
    const logos = images
        .flatMap((data) => data.logos ?? [])
        .flatMap((image) => {
            const parsed = artworkImageSchema.safeParse(image);
            return parsed.success ? [artworkImage(parsed.data)] : [];
        })
        .filter((image): image is ArtworkImage => image !== null)
        .filter(
            (image, index, all) =>
                all.findIndex(({ filePath }) => filePath === image.filePath) === index
        )
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

        await tx.delete(animeArtwork).where(eq(animeArtwork.externalIdId, match.externalIdId));

        if (rows.length) {
            await tx
                .insert(animeArtwork)
                .values(rows)
                .onConflictDoUpdate({
                    target: [animeArtwork.externalIdId, animeArtwork.type, animeArtwork.filePath],
                    set: {
                        aspectRatio: excluded(animeArtwork.aspectRatio),
                        height: excluded(animeArtwork.height),
                        language: excluded(animeArtwork.language),
                        voteAverage: excluded(animeArtwork.voteAverage),
                        width: excluded(animeArtwork.width),
                    },
                });
        }

        await tx
            .insert(animeArtworkCache)
            .values({
                externalIdId: match.externalIdId,
                allLanguages: true,
            })
            .onConflictDoUpdate({
                target: animeArtworkCache.externalIdId,
                set: { fetchedAt: new Date(), allLanguages: true },
            });
    });

    return { backdrops, logos };
}

export async function fetchArtwork(mapping: ArtworkMappings) {
    const artwork = await Promise.all(mapping.matches.map(fetchArtworkSource));
    return withSelections(mapping, mergeArtwork(artwork));
}

export async function getArtwork(
    anime: AniListAnime,
    options: { refresh?: boolean; fetchMissing?: boolean } = {}
) {
    let match: StoredMapping;
    try {
        match = await resolveStored(anime, { refresh: options.refresh === true });
    } catch (cause) {
        if (cause instanceof NoConfidentTmdbMappingError) {
            return null;
        }
        throw cause;
    }

    const artworkMappings = (await findArtworkMappings(anime.id, match)) ?? {
        matches: [match],
        preferenceExternalIdId: match.externalIdId,
    };

    let artwork = await readArtwork(artworkMappings);
    if (!artwork && (options.refresh || options.fetchMissing !== false)) {
        artwork = await fetchArtwork(artworkMappings).catch((cause) => {
            logger.debug(`TMDB artwork enrichment failed for AniList ${anime.id}`, cause);
            return null;
        });
    }
    if (!artwork) {
        return null;
    }
    const selectedPoster = options.refresh
        ? await getPoster(anime, match).catch((cause) => {
              logger.debug(`TMDB poster enrichment failed for AniList ${anime.id}`, cause);
              return null;
          })
        : await readPoster(match);

    return { ...artwork, selectedPoster };
}
