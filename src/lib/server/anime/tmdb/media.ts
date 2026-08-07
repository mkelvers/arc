import { db } from '$lib/server/db';
import { animeArtworkPreference } from '$lib/server/db/schema';
import { fetchArtwork, readArtwork } from './artwork';
import { findMapping } from './mapping-store';
import { readPoster } from './poster';

export async function getStoredMedia(anilistId: number) {
  const match = await findMapping(anilistId);

  if (!match) {
    return null;
  }

  const [artwork, selectedPoster] = await Promise.all([readArtwork(match), readPoster(match)]);

  if (!match.title || !artwork) {
    return null;
  }

  return {
    anime: { id: anilistId, title: match.title },
    artwork: { ...artwork, selectedPoster },
  };
}

export async function refreshArtwork(anilistId: number) {
  const match = await findMapping(anilistId);

  if (!match) {
    throw new Error(`No stored TMDB mapping for AniList ${anilistId}`);
  }

  return fetchArtwork(match);
}

export async function selectArtwork(
  anilistId: number,
  type: 'backdrop' | 'logo',
  filePath: string | null
) {
  const match = await findMapping(anilistId);

  if (!match) {
    throw new Error(`No stored TMDB mapping for AniList ${anilistId}`);
  }

  const artwork = await readArtwork(match);
  if (!artwork) {
    throw new Error('Artwork has not been cached yet');
  }

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
      .values({
        externalIdId: match.externalIdId,
        backdropFilePath: filePath,
      })
      .onConflictDoUpdate({
        target: animeArtworkPreference.externalIdId,
        set: { backdropFilePath: filePath, updatedAt },
      });
    return;
  }

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

export async function setLogoSize(anilistId: number, logoSize: number) {
  if (!Number.isInteger(logoSize) || logoSize < 50 || logoSize > 300) {
    throw new Error('Logo size must be between 50 and 300');
  }

  const match = await findMapping(anilistId);
  if (!match) {
    throw new Error(`No stored TMDB mapping for AniList ${anilistId}`);
  }

  await db
    .insert(animeArtworkPreference)
    .values({ externalIdId: match.externalIdId, logoSize })
    .onConflictDoUpdate({
      target: animeArtworkPreference.externalIdId,
      set: { logoSize, updatedAt: new Date() },
    });
}
