import { and, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '@arc/db';
import {
    animeExternalId,
    animeExternalIdLink,
    animeMappingOverride,
    animeProviderMapping,
} from '@arc/db/schema';
import { animeTitles } from '../anilist/text';
import { storedAnimeRelease } from '../anilist/releases';
import { create as createTmdbClient } from '../tmdb/client';
import { findMapping, saveVerifiedMapping } from '../tmdb/mapping-store';
import { resolveStored } from '../tmdb/mapping';
import { normalizedProviderTitle } from '../providers/match';
import { playback, playbackProviders } from '../providers';
import type { MappingPlaybackProvider } from './mapping-policy';

function providerByKey(provider: MappingPlaybackProvider) {
    return playbackProviders.find((candidate) => candidate.name.toLowerCase() === provider) ?? null;
}

async function requireRelease(anilistId: number) {
    const release = await storedAnimeRelease(anilistId);
    if (!release) {
        throw new Error(`Permanent release ${anilistId} is unavailable`);
    }
    return release;
}

async function activeOverride(anilistId: number, kind: 'playback' | 'metadata', provider: string) {
    return db
        .select()
        .from(animeMappingOverride)
        .where(
            and(
                eq(animeMappingOverride.anilistId, anilistId),
                eq(animeMappingOverride.kind, kind),
                eq(animeMappingOverride.provider, provider),
                isNull(animeMappingOverride.clearedAt)
            )
        )
        .limit(1)
        .then((rows) => rows[0] ?? null);
}

export async function setPlaybackMappingOverride(
    anilistId: number,
    provider: MappingPlaybackProvider,
    mediaId: string
) {
    const release = await requireRelease(anilistId);
    const adapter = providerByKey(provider);
    if (!adapter) {
        throw new Error(`Playback provider ${provider} cannot validate an explicit mapping`);
    }
    const [previous, previousOverride] = await Promise.all([
        db
            .select({ providerMediaId: animeProviderMapping.providerMediaId })
            .from(animeProviderMapping)
            .where(
                and(
                    eq(animeProviderMapping.anilistId, anilistId),
                    eq(animeProviderMapping.provider, provider)
                )
            )
            .limit(1)
            .then((rows) => rows[0] ?? null),
        activeOverride(anilistId, 'playback', provider),
    ]);
    const previousMapping = previousOverride
        ? {
              source: 'operator',
              externalId: previousOverride.externalId,
              validationStatus: previousOverride.validationStatus,
          }
        : previous
          ? { source: 'automatic', externalId: previous.providerMediaId }
          : null;

    await db
        .insert(animeMappingOverride)
        .values({
            anilistId,
            kind: 'playback',
            provider,
            externalId: mediaId,
            previousMapping,
            validationStatus: 'pending',
            maintenanceActor: 'maintenance-token',
        })
        .onConflictDoUpdate({
            target: [
                animeMappingOverride.anilistId,
                animeMappingOverride.kind,
                animeMappingOverride.provider,
            ],
            set: {
                externalId: mediaId,
                mediaType: null,
                previousMapping,
                validationStatus: 'pending',
                validationEvidence: null,
                maintenanceActor: 'maintenance-token',
                createdAt: new Date(),
                clearedAt: null,
            },
        });

    try {
        const episodes = await adapter.getEpisodes(release);
        if (!episodes.length) {
            throw new Error(`${adapter.name} returned no playable episode inventory`);
        }
        const evidence = {
            checkedAt: new Date().toISOString(),
            episodeCount: episodes.length,
            firstEpisode: episodes[0]?.number ?? null,
            lastEpisode: episodes.at(-1)?.number ?? null,
        };
        await db.transaction(async (tx) => {
            await tx
                .insert(animeProviderMapping)
                .values({ anilistId, provider, providerMediaId: mediaId })
                .onConflictDoUpdate({
                    target: [animeProviderMapping.anilistId, animeProviderMapping.provider],
                    set: { providerMediaId: mediaId, verifiedAt: new Date() },
                });
            await tx
                .update(animeMappingOverride)
                .set({ validationStatus: 'valid', validationEvidence: evidence })
                .where(
                    and(
                        eq(animeMappingOverride.anilistId, anilistId),
                        eq(animeMappingOverride.kind, 'playback'),
                        eq(animeMappingOverride.provider, provider),
                        eq(animeMappingOverride.externalId, mediaId),
                        isNull(animeMappingOverride.clearedAt)
                    )
                );
        });
        return evidence;
    } catch (cause) {
        await db
            .update(animeMappingOverride)
            .set({
                validationStatus: 'invalid',
                validationEvidence: {
                    checkedAt: new Date().toISOString(),
                    error:
                        cause instanceof Error ? cause.message.slice(0, 500) : 'Validation failed',
                },
            })
            .where(
                and(
                    eq(animeMappingOverride.anilistId, anilistId),
                    eq(animeMappingOverride.kind, 'playback'),
                    eq(animeMappingOverride.provider, provider),
                    eq(animeMappingOverride.externalId, mediaId)
                )
            );
        throw cause;
    }
}

async function validateTmdbIdentity(
    anilistId: number,
    externalId: number,
    mediaType: 'movie' | 'tv'
) {
    const release = await requireRelease(anilistId);
    const client = createTmdbClient();
    const response =
        mediaType === 'movie'
            ? await client.GET('/3/movie/{movie_id}', {
                  params: { path: { movie_id: externalId }, query: { language: 'en-US' } },
              })
            : await client.GET('/3/tv/{series_id}', {
                  params: { path: { series_id: externalId }, query: { language: 'en-US' } },
              });
    if (!response.data) {
        throw new Error(`TMDB ${mediaType} ${externalId} could not be loaded`, {
            cause: response.error,
        });
    }
    const data = response.data as {
        name?: string;
        original_name?: string;
        title?: string;
        original_title?: string;
        first_air_date?: string;
        release_date?: string;
    };
    const expectedTitles = new Set(animeTitles(release).map(normalizedProviderTitle));
    const suppliedTitles = [data.name, data.original_name, data.title, data.original_title]
        .filter((value): value is string => Boolean(value))
        .map(normalizedProviderTitle);
    if (!suppliedTitles.some((title) => expectedTitles.has(title))) {
        throw new Error(`TMDB ${mediaType} ${externalId} does not match AniList ${anilistId}`);
    }
    const date = data.first_air_date ?? data.release_date ?? null;
    const year = date ? Number(date.slice(0, 4)) : null;
    if (release.startDate?.year && year && release.startDate.year !== year) {
        throw new Error(`TMDB ${mediaType} ${externalId} has a different release year`);
    }
    return { release, title: suppliedTitles[0] ?? null, year };
}

export async function setMetadataMappingOverride(
    anilistId: number,
    externalId: number,
    mediaType: 'movie' | 'tv'
) {
    const [previous, previousOverride] = await Promise.all([
        findMapping(anilistId),
        activeOverride(anilistId, 'metadata', 'tmdb'),
    ]);
    const previousMapping = previousOverride
        ? {
              source: 'operator',
              externalId: previousOverride.externalId,
              mediaType: previousOverride.mediaType,
              validationStatus: previousOverride.validationStatus,
          }
        : previous
          ? { source: 'automatic', externalId: previous.id, mediaType: previous.mediaType }
          : null;

    await db
        .insert(animeMappingOverride)
        .values({
            anilistId,
            kind: 'metadata',
            provider: 'tmdb',
            externalId: String(externalId),
            mediaType,
            previousMapping,
            validationStatus: 'pending',
            maintenanceActor: 'maintenance-token',
        })
        .onConflictDoUpdate({
            target: [
                animeMappingOverride.anilistId,
                animeMappingOverride.kind,
                animeMappingOverride.provider,
            ],
            set: {
                externalId: String(externalId),
                mediaType,
                previousMapping,
                validationStatus: 'pending',
                validationEvidence: null,
                maintenanceActor: 'maintenance-token',
                createdAt: new Date(),
                clearedAt: null,
            },
        });

    try {
        const validation = await validateTmdbIdentity(anilistId, externalId, mediaType);
        await saveVerifiedMapping(validation.release, { id: externalId, mediaType });
        const evidence = {
            checkedAt: new Date().toISOString(),
            normalizedTitle: validation.title,
            releaseYear: validation.year,
        };
        await db
            .update(animeMappingOverride)
            .set({ validationStatus: 'valid', validationEvidence: evidence })
            .where(
                and(
                    eq(animeMappingOverride.anilistId, anilistId),
                    eq(animeMappingOverride.kind, 'metadata'),
                    eq(animeMappingOverride.provider, 'tmdb'),
                    eq(animeMappingOverride.externalId, String(externalId)),
                    isNull(animeMappingOverride.clearedAt)
                )
            );
        return evidence;
    } catch (cause) {
        await db
            .update(animeMappingOverride)
            .set({
                validationStatus: 'invalid',
                validationEvidence: {
                    checkedAt: new Date().toISOString(),
                    error:
                        cause instanceof Error ? cause.message.slice(0, 500) : 'Validation failed',
                },
            })
            .where(
                and(
                    eq(animeMappingOverride.anilistId, anilistId),
                    eq(animeMappingOverride.kind, 'metadata'),
                    eq(animeMappingOverride.provider, 'tmdb'),
                    eq(animeMappingOverride.externalId, String(externalId))
                )
            );
        throw cause;
    }
}

async function removeStoredTmdbMapping(anilistId: number) {
    const [owner] = await db
        .select({ animeId: animeExternalIdLink.animeId })
        .from(animeExternalId)
        .innerJoin(animeExternalIdLink, eq(animeExternalIdLink.externalIdId, animeExternalId.id))
        .where(
            and(
                eq(animeExternalId.provider, 'anilist'),
                eq(animeExternalId.mediaType, 'anime'),
                eq(animeExternalId.externalId, anilistId)
            )
        )
        .limit(1);
    if (!owner) {
        return;
    }
    const ids = await db
        .select({ id: animeExternalId.id })
        .from(animeExternalId)
        .innerJoin(animeExternalIdLink, eq(animeExternalIdLink.externalIdId, animeExternalId.id))
        .where(
            and(
                eq(animeExternalIdLink.animeId, owner.animeId),
                eq(animeExternalId.provider, 'tmdb')
            )
        );
    if (ids.length) {
        await db.delete(animeExternalIdLink).where(
            and(
                eq(animeExternalIdLink.animeId, owner.animeId),
                inArray(
                    animeExternalIdLink.externalIdId,
                    ids.map(({ id }) => id)
                )
            )
        );
    }
}

export async function rediscoverMapping(
    anilistId: number,
    mappingKind: 'playback' | 'metadata',
    provider?: MappingPlaybackProvider
) {
    const release = await requireRelease(anilistId);
    if (mappingKind === 'metadata') {
        await db
            .update(animeMappingOverride)
            .set({ clearedAt: new Date() })
            .where(
                and(
                    eq(animeMappingOverride.anilistId, anilistId),
                    eq(animeMappingOverride.kind, 'metadata'),
                    isNull(animeMappingOverride.clearedAt)
                )
            );
        await removeStoredTmdbMapping(anilistId);
        const mapping = await resolveStored(release);
        return { provider: 'tmdb', externalId: mapping.id, mediaType: mapping.mediaType };
    }

    await db.transaction(async (tx) => {
        await tx
            .update(animeMappingOverride)
            .set({ clearedAt: new Date() })
            .where(
                and(
                    eq(animeMappingOverride.anilistId, anilistId),
                    eq(animeMappingOverride.kind, 'playback'),
                    ...(provider ? [eq(animeMappingOverride.provider, provider)] : []),
                    isNull(animeMappingOverride.clearedAt)
                )
            );
        await tx
            .delete(animeProviderMapping)
            .where(
                and(
                    eq(animeProviderMapping.anilistId, anilistId),
                    ...(provider ? [eq(animeProviderMapping.provider, provider)] : [])
                )
            );
    });
    const adapter = provider ? providerByKey(provider) : playback;
    if (!adapter) {
        throw new Error(`Playback provider ${provider} cannot be rediscovered`);
    }
    const episodes = await adapter.getEpisodes(release);
    return { provider: provider ?? 'automatic-fallback', episodeCount: episodes.length };
}
