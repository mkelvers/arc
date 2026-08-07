import { and, eq, inArray, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '$lib/server/db';
import { anime as animeTable, animeExternalId, animeExternalIdLink } from '$lib/server/db/schema';
import { titlesFor } from './title';
import { type AniListAnime, type Mapping, type StoredMapping } from './types';

export async function findMapping(anilistId: number): Promise<StoredMapping | null> {
  const targetId = alias(animeExternalId, 'target_external_id');
  const targetLink = alias(animeExternalIdLink, 'target_external_id_link');
  const mapped = await db
    .select({
      animeId: animeExternalIdLink.animeId,
      externalIdId: targetId.id,
      id: targetId.externalId,
      mediaType: targetId.mediaType,
      title: animeTable.title,
      verifiedAt: targetLink.verifiedAt,
    })
    .from(animeExternalId)
    .innerJoin(animeExternalIdLink, eq(animeExternalIdLink.externalIdId, animeExternalId.id))
    .innerJoin(
      targetLink,
      and(
        eq(targetLink.animeId, animeExternalIdLink.animeId),
        ne(targetLink.externalIdId, animeExternalId.id)
      )
    )
    .innerJoin(targetId, eq(targetId.id, targetLink.externalIdId))
    .innerJoin(animeTable, eq(animeTable.id, animeExternalIdLink.animeId))
    .where(
      and(
        eq(animeExternalId.provider, 'anilist'),
        eq(animeExternalId.mediaType, 'anime'),
        eq(animeExternalId.externalId, anilistId),
        eq(targetId.provider, 'tmdb')
      )
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
        title: match.title,
        verifiedAt: match.verifiedAt,
      };
    }
  }

  if (mapped.length > 1) {
    throw new Error(`Ambiguous TMDB mapping for AniList ${anilistId}`);
  }

  return null;
}

export async function saveVerifiedMapping(
  anime: AniListAnime,
  mapping: Mapping
): Promise<StoredMapping> {
  return db.transaction(async (tx) => {
    const title = titlesFor(anime)[0] ?? null;
    const verifiedAt = new Date();

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
          eq(animeExternalId.externalId, anime.id)
        )
      )
      .limit(1);

    if (!anilistId) {
      throw new Error('Failed to store AniList identity');
    }

    let [link] = await tx
      .select({ animeId: animeExternalIdLink.animeId })
      .from(animeExternalIdLink)
      .where(eq(animeExternalIdLink.externalIdId, anilistId.id))
      .limit(1);

    if (!link) {
      const [created] = await tx
        .insert(animeTable)
        .values({ title })
        .returning({ animeId: animeTable.id });

      if (!created) {
        throw new Error('Failed to store anime');
      }

      link = created;
      await tx.insert(animeExternalIdLink).values({
        animeId: link.animeId,
        externalIdId: anilistId.id,
      });
    }

    await tx.update(animeTable).set({ title }).where(eq(animeTable.id, link.animeId));

    const oldTmdbIds = await tx
      .select({ id: animeExternalIdLink.externalIdId })
      .from(animeExternalIdLink)
      .innerJoin(animeExternalId, eq(animeExternalId.id, animeExternalIdLink.externalIdId))
      .where(
        and(eq(animeExternalIdLink.animeId, link.animeId), eq(animeExternalId.provider, 'tmdb'))
      );

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
          eq(animeExternalId.externalId, mapping.id)
        )
      )
      .limit(1);

    if (!tmdbId) {
      throw new Error('Failed to store TMDB identity');
    }

    const replacedIds = oldTmdbIds.map(({ id }) => id).filter((id) => id !== tmdbId.id);
    if (replacedIds.length) {
      await tx
        .delete(animeExternalIdLink)
        .where(
          and(
            eq(animeExternalIdLink.animeId, link.animeId),
            inArray(animeExternalIdLink.externalIdId, replacedIds)
          )
        );
    }

    await tx
      .insert(animeExternalIdLink)
      .values({
        animeId: link.animeId,
        externalIdId: tmdbId.id,
        verifiedAt,
      })
      .onConflictDoUpdate({
        target: [animeExternalIdLink.animeId, animeExternalIdLink.externalIdId],
        set: { verifiedAt },
      });

    return {
      ...mapping,
      animeId: link.animeId,
      externalIdId: tmdbId.id,
      title,
      verifiedAt,
    };
  });
}
