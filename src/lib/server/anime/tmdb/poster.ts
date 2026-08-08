import { and, eq, inArray, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '$lib/server/db';
import { animeExternalId, animeExternalIdLink, animeReleasePoster } from '$lib/server/db/schema';
import { isRecord } from '$lib/utils';
import type { AniListAnime } from '../anilist/types';
import { create, imageUrl } from './client';
import { selectPoster, selectReleaseSeason, type PosterCandidate } from './poster-selection';
import type { ArtworkImage, StoredMapping } from './types';

const completeFreshFor = 30 * 24 * 60 * 60 * 1_000;
const sparseFreshFor = 6 * 60 * 60 * 1_000;
const requests = new Map<string, Promise<ArtworkImage | null>>();

function posterCandidate(image: {
  aspect_ratio?: number;
  file_path?: string;
  height?: number;
  iso_639_1?: unknown;
  vote_average?: number;
  vote_count?: number;
  width?: number;
}): PosterCandidate | null {
  if (!image.file_path) {
    return null;
  }

  return {
    aspectRatio: image.aspect_ratio ?? 0,
    filePath: image.file_path,
    height: image.height ?? 0,
    language: typeof image.iso_639_1 === 'string' ? image.iso_639_1 : null,
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
  const lifetime = row.filePath ? completeFreshFor : sparseFreshFor;
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
  return new Set(
    (
      await db
        .select({ filePath: animeReleasePoster.filePath })
        .from(animeReleasePoster)
        .where(
          and(
            eq(animeReleasePoster.externalIdId, match.externalIdId),
            ne(animeReleasePoster.animeId, match.animeId)
          )
        )
    ).flatMap(({ filePath }) => (filePath ? [filePath] : []))
  );
}

function posterConflict(cause: unknown) {
  return (
    isRecord(cause) &&
    cause.code === '23505' &&
    cause.constraint === 'anime_release_poster_external_file_unique'
  );
}

async function saveAvailablePoster(
  match: StoredMapping,
  candidates: PosterCandidate[],
  seasonNumber: number | null
) {
  const unavailable = await usedPosterPaths(match);

  while (true) {
    const poster = selectPoster(candidates, unavailable);
    if (!poster) {
      return savePoster(match, null, seasonNumber);
    }

    try {
      return await savePoster(match, poster, seasonNumber);
    } catch (cause) {
      if (!posterConflict(cause)) {
        throw cause;
      }
      unavailable.add(poster.filePath);
    }
  }
}

function posterCandidates(
  posters:
    | Array<{
        aspect_ratio?: number;
        file_path?: string;
        height?: number;
        iso_639_1?: unknown;
        vote_average?: number;
        vote_count?: number;
        width?: number;
      }>
    | null
    | undefined
) {
  return (posters ?? [])
    .map(posterCandidate)
    .filter((candidate): candidate is PosterCandidate => candidate !== null);
}

async function fetchPoster(anime: AniListAnime, match: StoredMapping) {
  const client = create();

  if (match.mediaType === 'movie') {
    const { data, error } = await client.GET('/3/movie/{movie_id}/images', {
      params: { path: { movie_id: match.id } },
    });
    if (!data) {
      throw new Error('TMDB movie poster request failed', {
        cause: error,
      });
    }

    return saveAvailablePoster(match, posterCandidates(data.posters), null);
  }

  const { data: series, error } = await client.GET('/3/tv/{series_id}', {
    params: {
      path: { series_id: match.id },
      query: { language: 'en-US' },
    },
  });
  if (!series) {
    throw new Error('TMDB series poster request failed', {
      cause: error,
    });
  }

  const selection = selectReleaseSeason(anime, series.seasons ?? []);
  if (!selection) {
    return savePoster(match, null, null);
  }

  if (selection.aggregate) {
    const { data, error: imagesError } = await client.GET('/3/tv/{series_id}/images', {
      params: {
        path: { series_id: match.id },
      },
    });
    if (!data) {
      throw new Error('TMDB series images request failed', {
        cause: imagesError,
      });
    }

    return saveAvailablePoster(match, posterCandidates(data.posters), null);
  }

  const { data, error: imagesError } = await client.GET(
    '/3/tv/{series_id}/season/{season_number}/images',
    {
      params: {
        path: {
          series_id: match.id,
          season_number: selection.season.season_number,
        },
      },
    }
  );
  if (!data) {
    throw new Error('TMDB season poster request failed', {
      cause: imagesError,
    });
  }

  return saveAvailablePoster(match, posterCandidates(data.posters), selection.season.season_number);
}

export async function readPoster(match: StoredMapping) {
  const row = await cacheRow(match);
  return row ? storedPoster(row) : null;
}

export async function getPoster(anime: AniListAnime, match: StoredMapping) {
  const key = `${anime.id}:${match.externalIdId}`;
  const active = requests.get(key);
  if (active) {
    return active;
  }

  const request = (async () => {
    const cached = await cacheRow(match);
    if (cached && isFresh(cached)) {
      return storedPoster(cached);
    }

    try {
      return await fetchPoster(anime, match);
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
  requests.set(key, request);

  const cleanup = () => {
    if (requests.get(key) === request) {
      requests.delete(key);
    }
  };
  request.then(cleanup, cleanup);

  return request;
}

async function posterRows(anilistIds: number[]) {
  if (!anilistIds.length) {
    return [];
  }

  const source = alias(animeExternalId, 'poster_anilist_id');
  return db
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
        inArray(source.externalId, anilistIds)
      )
    );
}

export async function getStoredPosters(anilistIds: number[]) {
  const rows = await posterRows(anilistIds);
  return new Map(
    rows.flatMap(({ anilistId, poster }) =>
      poster.filePath ? [[anilistId, imageUrl(poster.filePath, 'w780')] as const] : []
    )
  );
}
