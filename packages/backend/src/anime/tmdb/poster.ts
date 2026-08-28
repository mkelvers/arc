import { and, eq, inArray, ne, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { createHash } from 'node:crypto';
import { z } from 'zod';

import { db } from '@arc/db';
import {
    animeArtworkSource,
    animeExternalId,
    animeExternalIdLink,
    animeReleasePoster,
} from '@arc/db/schema';
import type { AniListAnime } from '../anilist/types';
import { create, imageUrl } from './client';
import { findMapping } from './mapping-store';
import {
    selectPoster as choosePoster,
    selectReleaseSeason,
    type PosterCandidate,
} from './poster-selection';
import type { StoredMapping } from './types';

const posterImageSchema = z.object({
    aspect_ratio: z.number().optional(),
    file_path: z.string().optional(),
    height: z.number().optional(),
    iso_639_1: z.string().nullable().optional(),
    vote_average: z.number().optional(),
    vote_count: z.number().optional(),
    width: z.number().optional(),
});
const posterConflictSchema = z.object({
    code: z.literal('23505'),
    constraint: z.literal('anime_release_poster_external_file_unique'),
});
type PosterImage = z.infer<typeof posterImageSchema>;

function posterCandidate(image: PosterImage): PosterCandidate | null {
    if (!image.file_path) {
        return null;
    }

    return {
        aspectRatio: image.aspect_ratio ?? 0,
        filePath: image.file_path,
        height: image.height ?? 0,
        language: image.iso_639_1 ?? null,
        voteAverage: image.vote_average ?? 0,
        voteCount: image.vote_count ?? 0,
        width: image.width ?? 0,
    };
}

function storedPoster(row: typeof animeReleasePoster.$inferSelect) {
    return row.filePath &&
        row.aspectRatio != null &&
        row.height != null &&
        row.voteAverage != null &&
        row.width != null
        ? {
              aspectRatio: row.aspectRatio,
              filePath: row.filePath,
              height: row.height,
              language: row.language,
              url: imageUrl(row.filePath),
              voteAverage: row.voteAverage,
              width: row.width,
          }
        : null;
}

async function cacheRow(match: StoredMapping) {
    return db
        .select()
        .from(animeReleasePoster)
        .where(
            and(
                eq(animeReleasePoster.animeId, match.animeId),
                eq(animeReleasePoster.externalIdId, match.externalIdId)
            )
        )
        .limit(1)
        .then((rows) => rows[0] ?? null);
}

function isFresh(row: typeof animeReleasePoster.$inferSelect) {
    const lifetime = row.filePath ? 30 * 24 * 60 * 60 * 1_000 : 6 * 60 * 60 * 1_000;
    return Date.now() - row.fetchedAt.getTime() < lifetime;
}

async function savePoster(
    match: StoredMapping,
    poster: PosterCandidate | null,
    seasonNumber: number | null
) {
    const values = {
        animeId: match.animeId,
        externalIdId: match.externalIdId,
        filePath: poster?.filePath ?? null,
        seasonNumber,
        aspectRatio: poster?.aspectRatio ?? null,
        height: poster?.height ?? null,
        language: poster?.language ?? null,
        voteAverage: poster?.voteAverage ?? null,
        width: poster?.width ?? null,
        fetchedAt: new Date(),
    };

    await db.insert(animeReleasePoster).values(values).onConflictDoUpdate({
        target: animeReleasePoster.animeId,
        set: values,
    });

    return poster
        ? {
              aspectRatio: poster.aspectRatio,
              filePath: poster.filePath,
              height: poster.height,
              language: poster.language,
              url: imageUrl(poster.filePath),
              voteAverage: poster.voteAverage,
              width: poster.width,
          }
        : null;
}

async function usedPosterPaths(match: StoredMapping) {
    const linkedAnilistIds = await db
        .select({ anilistId: animeExternalId.externalId })
        .from(animeExternalIdLink)
        .innerJoin(animeExternalId, eq(animeExternalId.id, animeExternalIdLink.externalIdId))
        .where(
            and(
                eq(animeExternalIdLink.animeId, match.animeId),
                eq(animeExternalId.provider, 'anilist'),
                eq(animeExternalId.mediaType, 'anime')
            )
        );
    const anilistIds = linkedAnilistIds.map(({ anilistId }) => anilistId);
    const connected = anilistIds.length
        ? await db
              .select({
                  anilistId: animeArtworkSource.anilistId,
                  sourceAnilistId: animeArtworkSource.sourceAnilistId,
              })
              .from(animeArtworkSource)
              .where(
                  or(
                      inArray(animeArtworkSource.anilistId, anilistIds),
                      inArray(animeArtworkSource.sourceAnilistId, anilistIds)
                  )
              )
        : [];
    const connectedIds = [
        ...new Set([
            ...anilistIds,
            ...connected.flatMap(({ anilistId, sourceAnilistId }) => [anilistId, sourceAnilistId]),
        ]),
    ];
    const connectedAnimeIds = connectedIds.length
        ? await db
              .select({ animeId: animeExternalIdLink.animeId })
              .from(animeExternalIdLink)
              .innerJoin(animeExternalId, eq(animeExternalId.id, animeExternalIdLink.externalIdId))
              .where(
                  and(
                      eq(animeExternalId.provider, 'anilist'),
                      eq(animeExternalId.mediaType, 'anime'),
                      inArray(animeExternalId.externalId, connectedIds)
                  )
              )
        : [];
    const unavailableAnimeIds = [...new Set(connectedAnimeIds.map(({ animeId }) => animeId))];

    return new Set(
        (
            await db
                .select({ filePath: animeReleasePoster.filePath })
                .from(animeReleasePoster)
                .where(
                    and(
                        ne(animeReleasePoster.animeId, match.animeId),
                        or(
                            inArray(animeReleasePoster.animeId, unavailableAnimeIds),
                            eq(animeReleasePoster.externalIdId, match.externalIdId)
                        )
                    )
                )
        ).flatMap(({ filePath }) => (filePath ? [filePath] : []))
    );
}

async function posterFingerprint(filePath: string) {
    const response = await fetch(imageUrl(filePath, 'w185'), {
        signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
        throw new Error(`TMDB poster image request failed with ${response.status}`);
    }

    const image = new Bun.Image(await response.arrayBuffer(), { maxPixels: 4_000_000 });
    const normalized = await image.resize(32, 48, { fit: 'fill' }).png().bytes();
    return createHash('sha256').update(normalized).digest('hex');
}

async function hasVisuallyMatchingPoster(filePath: string, usedPaths: Set<string>) {
    try {
        const fingerprint = await posterFingerprint(filePath);
        for (const usedPath of usedPaths) {
            if ((await posterFingerprint(usedPath)) === fingerprint) {
                return true;
            }
        }
    } catch (cause) {
        console.warn(`TMDB poster comparison failed for ${filePath}; using path uniqueness`, cause);
    }

    return false;
}

async function saveAvailablePoster(
    match: StoredMapping,
    candidates: PosterCandidate[],
    seasonNumber: number | null
) {
    const unavailable = await usedPosterPaths(match);

    while (true) {
        const poster = choosePoster(candidates, unavailable);
        if (!poster) {
            return savePoster(match, null, seasonNumber);
        }

        if (await hasVisuallyMatchingPoster(poster.filePath, unavailable)) {
            unavailable.add(poster.filePath);
            continue;
        }

        try {
            return await savePoster(match, poster, seasonNumber);
        } catch (cause) {
            if (!posterConflictSchema.safeParse(cause).success) {
                throw cause;
            }
            unavailable.add(poster.filePath);
        }
    }
}

function posterCandidates(posters: PosterImage[] | null | undefined) {
    return (posters ?? [])
        .flatMap((poster) => {
            const parsed = posterImageSchema.safeParse(poster);
            return parsed.success ? [posterCandidate(parsed.data)] : [];
        })
        .filter((candidate): candidate is PosterCandidate => candidate !== null);
}

async function fetchPosterCandidates(anime: AniListAnime, match: StoredMapping) {
    const client = create();

    if (match.mediaType === 'movie') {
        const { data, error } = await client.GET('/3/movie/{movie_id}/images', {
            params: { path: { movie_id: match.id } },
        });
        if (!data) {
            throw new Error('TMDB movie poster request failed', { cause: error });
        }

        return { candidates: posterCandidates(data.posters), seasonNumber: null };
    }

    const { data: series, error } = await client.GET('/3/tv/{series_id}', {
        params: { path: { series_id: match.id }, query: { language: 'en-US' } },
    });
    if (!series) {
        throw new Error('TMDB series poster request failed', { cause: error });
    }

    const selection = selectReleaseSeason(anime, series.seasons ?? []);
    if (!selection) {
        return { candidates: [], seasonNumber: null };
    }

    if (selection.aggregate) {
        const { data, error: imagesError } = await client.GET('/3/tv/{series_id}/images', {
            params: { path: { series_id: match.id } },
        });
        if (!data) {
            throw new Error('TMDB series images request failed', { cause: imagesError });
        }

        return { candidates: posterCandidates(data.posters), seasonNumber: null };
    }

    const { data, error: imagesError } = await client.GET(
        '/3/tv/{series_id}/season/{season_number}/images',
        { params: { path: { series_id: match.id, season_number: selection.season.season_number } } }
    );
    if (!data) {
        throw new Error('TMDB season poster request failed', { cause: imagesError });
    }

    return {
        candidates: posterCandidates(data.posters),
        seasonNumber: selection.season.season_number,
    };
}

async function fetchSeriesPosterCandidates(match: StoredMapping) {
    const client = create();
    const { data, error } = await client.GET('/3/tv/{series_id}/images', {
        params: { path: { series_id: match.id } },
    });
    if (!data) {
        throw new Error('TMDB series images request failed', { cause: error });
    }

    return posterCandidates(data.posters);
}

async function posterOptions(anime: AniListAnime, match: StoredMapping) {
    const { candidates } = await fetchPosterCandidates(anime, match);
    if (match.mediaType === 'movie') {
        return candidates;
    }

    const series = await fetchSeriesPosterCandidates(match);
    return [
        ...new Map([...candidates, ...series].map((poster) => [poster.filePath, poster])).values(),
    ];
}

export async function readPoster(match: StoredMapping) {
    const row = await cacheRow(match);
    return row ? storedPoster(row) : null;
}

export async function getPoster(anime: AniListAnime, match: StoredMapping) {
    return (async () => {
        const cached = await cacheRow(match);
        if (cached && (anime.status === 'FINISHED' || isFresh(cached))) {
            return storedPoster(cached);
        }

        try {
            const { candidates, seasonNumber } = await fetchPosterCandidates(anime, match);
            return await saveAvailablePoster(match, candidates, seasonNumber);
        } catch (cause) {
            const stale = cached ? storedPoster(cached) : null;
            if (stale) {
                console.warn(
                    `TMDB poster refresh failed for AniList ${anime.id}; using cached poster`,
                    cause
                );
                return stale;
            }
            throw cause;
        }
    })();
}

export async function getPosterOptions(anime: AniListAnime) {
    const match = await findMapping(anime.id);
    if (!match) {
        return [];
    }

    return (await posterOptions(anime, match)).map((poster) => ({
        ...poster,
        url: imageUrl(poster.filePath),
    }));
}

export async function selectPosterImage(anime: AniListAnime, filePath: string) {
    const match = await findMapping(anime.id);
    if (!match) {
        throw new Error('No stored TMDB mapping for this anime');
    }

    const selected = await fetchPosterCandidates(anime, match);
    const candidates =
        match.mediaType === 'movie'
            ? selected.candidates
            : [...selected.candidates, ...(await fetchSeriesPosterCandidates(match))].filter(
                  (candidate, index, all) =>
                      all.findIndex(({ filePath }) => filePath === candidate.filePath) === index
              );
    const poster = candidates.find((candidate) => candidate.filePath === filePath);
    if (!poster) {
        throw new Error('Poster does not belong to this anime');
    }

    if (await hasVisuallyMatchingPoster(poster.filePath, await usedPosterPaths(match))) {
        throw new Error('Poster is already assigned to a connected anime');
    }

    return savePoster(match, poster, selected.seasonNumber);
}

export async function getStoredPosters(anilistIds: number[]) {
    const ids = [...new Set(anilistIds)];
    if (!ids.length) {
        return new Map<number, string>();
    }

    const source = alias(animeExternalId, 'poster_anilist_id');
    const rows = await db
        .select({
            anilistId: source.externalId,
            poster: animeReleasePoster,
        })
        .from(source)
        .innerJoin(animeExternalIdLink, eq(animeExternalIdLink.externalIdId, source.id))
        .innerJoin(animeReleasePoster, eq(animeReleasePoster.animeId, animeExternalIdLink.animeId))
        .where(
            and(
                eq(source.provider, 'anilist'),
                eq(source.mediaType, 'anime'),
                inArray(source.externalId, ids)
            )
        );

    return new Map(
        rows.flatMap(({ anilistId, poster }) =>
            poster.filePath ? [[anilistId, imageUrl(poster.filePath, 'w780')] as const] : []
        )
    );
}
