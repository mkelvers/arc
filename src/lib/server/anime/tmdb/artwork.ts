import { and, eq, sql } from 'drizzle-orm';

import { db } from '$lib/server/db';
import { animeArtwork, animeArtworkCache, animeArtworkPreference } from '$lib/server/db/schema';
import type { AniListAnime } from '../anilist/types';
import { create, imageUrl } from './client';
import { NoConfidentTmdbMappingError, resolveStored } from './mapping';
import { getPoster } from './poster';
import type { Artwork, ArtworkImage, StoredMapping } from './types';

const completeFreshFor = 30 * 24 * 60 * 60 * 1_000;
const sparseFreshFor = 6 * 60 * 60 * 1_000;

function artworkImage(image: {
  aspect_ratio?: number;
  file_path?: string;
  height?: number;
  iso_639_1?: unknown;
  vote_average?: number;
  width?: number;
}): ArtworkImage | null {
  if (!image.file_path) {
    return null;
  }

  return {
    aspectRatio: image.aspect_ratio ?? 0,
    filePath: image.file_path,
    height: image.height ?? 0,
    language: typeof image.iso_639_1 === 'string' ? image.iso_639_1 : null,
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
  match: StoredMapping,
  artwork: Pick<Artwork, 'backdrops' | 'logos'>
): Promise<Artwork> {
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
      artwork.backdrops.find(({ filePath }) => filePath === preference?.backdropFilePath) ??
      artwork.backdrops[0] ??
      null,
    selectedLogo: logoHidden
      ? null
      : (artwork.logos.find(({ filePath }) => filePath === preference?.logoFilePath) ??
        artwork.logos[0] ??
        null),
    selectedPoster: null,
    logoHidden,
    logoSize: preference?.logoSize ?? 100,
  };
}

export async function readArtwork(match: StoredMapping): Promise<Artwork | null> {
  const [cached] = await db
    .select({
      externalIdId: animeArtworkCache.externalIdId,
      fetchedAt: animeArtworkCache.fetchedAt,
    })
    .from(animeArtworkCache)
    .where(
      and(
        eq(animeArtworkCache.externalIdId, match.externalIdId),
        eq(animeArtworkCache.allLanguages, true)
      )
    )
    .limit(1);

  if (!cached) {
    return null;
  }

  const images = await db
    .select()
    .from(animeArtwork)
    .where(eq(animeArtwork.externalIdId, match.externalIdId));
  const forType = (type: 'backdrop' | 'logo') =>
    images
      .filter((image) => image.type === type)
      .map(storedImage)
      .sort((left, right) => right.voteAverage - left.voteAverage);
  const backdrops = forType('backdrop');
  const logos = forType('logo');
  const freshFor = backdrops.length && logos.length ? completeFreshFor : sparseFreshFor;

  if (Date.now() - cached.fetchedAt.getTime() >= freshFor) {
    return null;
  }

  return withSelections(match, {
    backdrops,
    logos,
  });
}

export async function fetchArtwork(match: StoredMapping) {
  const client = create();
  const response =
    match.mediaType === 'movie'
      ? await client.GET('/3/movie/{movie_id}/images', {
          params: { path: { movie_id: match.id } },
        })
      : await client.GET('/3/tv/{series_id}/images', {
          params: { path: { series_id: match.id } },
        });

  if (!response.data) {
    throw new Error('TMDB artwork request failed', {
      cause: response.error,
    });
  }

  const backdrops = (response.data.backdrops ?? [])
    .map(artworkImage)
    .filter((image): image is ArtworkImage => image !== null)
    .sort((left, right) => right.voteAverage - left.voteAverage);
  const logos = (response.data.logos ?? [])
    .map(artworkImage)
    .filter((image): image is ArtworkImage => image !== null)
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
            aspectRatio: sql.raw(`excluded.${animeArtwork.aspectRatio.name}`),
            height: sql.raw(`excluded.${animeArtwork.height.name}`),
            language: sql.raw(`excluded.${animeArtwork.language.name}`),
            voteAverage: sql.raw(`excluded.${animeArtwork.voteAverage.name}`),
            width: sql.raw(`excluded.${animeArtwork.width.name}`),
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

  return withSelections(match, { backdrops, logos });
}

export async function getArtwork(anime: AniListAnime) {
  let match: StoredMapping;
  try {
    match = await resolveStored(anime);
  } catch (cause) {
    if (cause instanceof NoConfidentTmdbMappingError) {
      return null;
    }
    throw cause;
  }

  const [artwork, selectedPoster] = await Promise.all([
    readArtwork(match).then((stored) => stored ?? fetchArtwork(match)),
    getPoster(anime, match).catch((cause) => {
      console.warn(`TMDB poster enrichment failed for AniList ${anime.id}`, cause);
      return null;
    }),
  ]);

  return { ...artwork, selectedPoster };
}
