import { and, eq, inArray, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '@arc/db';
import {
    animeArtwork,
    animeArtworkPreference,
    animeArtworkSource,
    animeEpisode,
    animeExternalId,
    animeExternalIdLink,
    animeRelease,
} from '@arc/db/schema';
import { fetchArtwork, readArtwork } from './artwork';
import { imageUrl } from './client';
import { findArtworkMappings, findMapping } from './mapping-store';
import { readPoster } from './poster';

export async function getStoredMedia(anilistId: number) {
    const match = await findMapping(anilistId);
    const artworkMappings = await findArtworkMappings(anilistId, match);

    if (!match || !artworkMappings) {
        return null;
    }

    const [artwork, selectedPoster] = await Promise.all([
        readArtwork(artworkMappings),
        readPoster(match),
    ]);

    if (!match.title || !artwork) {
        return null;
    }

    return {
        anime: { id: anilistId, title: match.title },
        artwork: { ...artwork, selectedPoster },
    };
}

export async function getStoredBackdropCandidates(anilistIds: number[]) {
    const ids = [...new Set(anilistIds)];
    if (!ids.length) {
        return [];
    }

    const artworkSources = await db
        .select({
            anilistId: animeArtworkSource.anilistId,
            sourceAnilistId: animeArtworkSource.sourceAnilistId,
        })
        .from(animeArtworkSource)
        .where(
            or(
                inArray(animeArtworkSource.anilistId, ids),
                inArray(animeArtworkSource.sourceAnilistId, ids)
            )
        );
    const sourceByAnilistId = new Map<number, { anilistId: number; sourceAnilistId: number }>();
    for (const source of artworkSources) {
        sourceByAnilistId.set(source.anilistId, source);
        sourceByAnilistId.set(source.sourceAnilistId, source);
    }
    const lookupIds = [
        ...new Set([
            ...ids,
            ...artworkSources.flatMap(({ anilistId, sourceAnilistId }) => [
                anilistId,
                sourceAnilistId,
            ]),
        ]),
    ];

    const source = alias(animeExternalId, 'backdrop_anilist_id');
    const sourceLink = alias(animeExternalIdLink, 'backdrop_anilist_link');
    const targetLink = alias(animeExternalIdLink, 'backdrop_tmdb_link');
    const target = alias(animeExternalId, 'backdrop_tmdb_id');
    const rows = await db
        .select({
            anilistId: source.externalId,
            externalIdId: target.id,
            targetId: target.externalId,
            mediaType: target.mediaType,
        })
        .from(source)
        .innerJoin(sourceLink, eq(sourceLink.externalIdId, source.id))
        .innerJoin(targetLink, eq(targetLink.animeId, sourceLink.animeId))
        .innerJoin(
            target,
            and(
                eq(target.id, targetLink.externalIdId),
                eq(target.provider, 'tmdb'),
                inArray(target.mediaType, ['movie', 'tv'])
            )
        )
        .where(
            and(
                eq(source.provider, 'anilist'),
                eq(source.mediaType, 'anime'),
                inArray(source.externalId, lookupIds)
            )
        );

    const rowsByAnilistId = new Map<number, typeof rows>();
    for (const row of rows) {
        rowsByAnilistId.set(row.anilistId, [...(rowsByAnilistId.get(row.anilistId) ?? []), row]);
    }

    const mappingByAnilistId = new Map(
        [...rowsByAnilistId].flatMap(([anilistId, candidates]) =>
            candidates.length === 1 ? [[anilistId, candidates[0]] as const] : []
        )
    );
    const preferenceExternalIdIds = [
        ...new Set(
            ids.flatMap((anilistId) => {
                const ownerAnilistId = sourceByAnilistId.get(anilistId)?.anilistId ?? anilistId;
                const mapping = mappingByAnilistId.get(ownerAnilistId);
                return mapping ? [mapping.externalIdId] : [];
            })
        ),
    ];
    if (!preferenceExternalIdIds.length) {
        return [];
    }

    const preferences = await db
        .select({
            externalIdId: animeArtworkPreference.externalIdId,
            filePath: animeArtworkPreference.backdropFilePath,
        })
        .from(animeArtworkPreference)
        .where(inArray(animeArtworkPreference.externalIdId, preferenceExternalIdIds));
    const preferenceByExternalIdId = new Map(
        preferences.map(({ externalIdId, filePath }) => [externalIdId, filePath])
    );
    const selectedFilePaths = [
        ...new Set(preferences.flatMap(({ filePath }) => (filePath ? [filePath] : []))),
    ];
    if (!selectedFilePaths.length) {
        return [];
    }

    const selectedImages = await db
        .select({
            externalIdId: animeArtwork.externalIdId,
            filePath: animeArtwork.filePath,
        })
        .from(animeArtwork)
        .where(
            and(
                eq(animeArtwork.type, 'backdrop'),
                inArray(animeArtwork.externalIdId, [
                    ...new Set(rows.map(({ externalIdId }) => externalIdId)),
                ]),
                inArray(animeArtwork.filePath, selectedFilePaths)
            )
        );
    const selectedImageKeys = new Set(
        selectedImages.map(({ externalIdId, filePath }) => `${externalIdId}:${filePath}`)
    );

    return ids.flatMap((anilistId) => {
        const source = sourceByAnilistId.get(anilistId);
        const ownerAnilistId = source?.anilistId ?? anilistId;
        const ownerMapping = mappingByAnilistId.get(ownerAnilistId);
        if (!ownerMapping) {
            return [];
        }

        const filePath = preferenceByExternalIdId.get(ownerMapping.externalIdId);
        if (!filePath) {
            return [];
        }

        const memberIds = source ? [source.anilistId, source.sourceAnilistId] : [anilistId];
        const belongsToGroup = memberIds.some((memberId) => {
            const memberMapping = mappingByAnilistId.get(memberId);
            return (
                memberMapping && selectedImageKeys.has(`${memberMapping.externalIdId}:${filePath}`)
            );
        });

        return belongsToGroup
            ? [
                  {
                      anilistId,
                      targetId: ownerMapping.targetId,
                      mediaType: ownerMapping.mediaType,
                      filePath,
                  },
              ]
            : [];
    });
}

export async function getStoredBackdrops(anilistIds: number[]) {
    const rows = await getStoredBackdropCandidates(anilistIds);

    const candidates = new Map<number, { group: string; filePath: string }[]>();
    for (const row of rows) {
        if (!row.filePath) {
            continue;
        }

        const values = candidates.get(row.anilistId) ?? [];
        values.push({
            group: `tmdb:${row.mediaType}:${row.filePath}`,
            filePath: row.filePath,
        });
        candidates.set(row.anilistId, values);
    }

    return new Map(
        [...candidates].flatMap(([anilistId, values]) => {
            const groups = new Set(values.map(({ group }) => group));
            return groups.size === 1
                ? [[anilistId, imageUrl(values[0].filePath, 'w780')] as const]
                : [];
        })
    );
}

export async function refreshArtwork(anilistId: number) {
    const mapping = await findArtworkMappings(anilistId);

    if (!mapping) {
        throw new Error(`No stored TMDB mapping for AniList ${anilistId}`);
    }

    return fetchArtwork(mapping);
}

export async function selectArtwork(
    anilistId: number,
    type: 'backdrop' | 'logo',
    filePath: string | null
) {
    const mapping = await findArtworkMappings(anilistId);

    if (!mapping) {
        throw new Error(`No stored TMDB mapping for AniList ${anilistId}`);
    }

    const artwork = await readArtwork(mapping);
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
        const [release] = await db
            .select({ format: animeRelease.format })
            .from(animeRelease)
            .where(eq(animeRelease.anilistId, anilistId))
            .limit(1);

        await db.transaction(async (tx) => {
            await tx
                .insert(animeArtworkPreference)
                .values({
                    externalIdId: mapping.preferenceExternalIdId,
                    backdropFilePath: filePath,
                })
                .onConflictDoUpdate({
                    target: animeArtworkPreference.externalIdId,
                    set: { backdropFilePath: filePath, updatedAt },
                });

            if (release?.format === 'MOVIE' && filePath) {
                await tx
                    .update(animeEpisode)
                    .set({ imageUrl: imageUrl(filePath) })
                    .where(eq(animeEpisode.anilistId, anilistId));
            }
        });
        return;
    }

    await db
        .insert(animeArtworkPreference)
        .values({
            externalIdId: mapping.preferenceExternalIdId,
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

    const mapping = await findArtworkMappings(anilistId);
    if (!mapping) {
        throw new Error(`No stored TMDB mapping for AniList ${anilistId}`);
    }

    await db
        .insert(animeArtworkPreference)
        .values({ externalIdId: mapping.preferenceExternalIdId, logoSize })
        .onConflictDoUpdate({
            target: animeArtworkPreference.externalIdId,
            set: { logoSize, updatedAt: new Date() },
        });
}
