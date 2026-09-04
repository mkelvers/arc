import { and, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';

import { db } from '@arc/shared/db';
import {
    animeEpisode,
    animeEpisodeSync,
    animeEpisodeTarget,
    maintenanceTask,
    playbackProgress,
} from '@arc/shared/db/schema';
import { logger } from '@arc/backend/internal/logger';
import { GraphQLRequestError } from '@arc/shared/graphql/error';
import type { AniListAnime } from '@arc/core';
import { refreshAnimeRelease } from '@arc/core/server';
import { animeTitles } from '@arc/core';
import { ensureInternalAnimeId } from '@arc/core/server';
import {
    anikotoProvider,
    isAniKotoNoMatchError,
    isAniKotoTransientError,
    recordAniKotoInventoryVerification,
} from '../providers/anikoto';
import { scheduleReleaseTargets } from '../scheduler/targets';
import { createInventoryNotifications } from '../../notifications';
import { getEpisodeMetadata, NoConfidentTmdbMappingError, resolveStored } from '@arc/core/tmdb';
import { sourceRevision, storedEpisodes } from '@arc/core/server';
import {
    reconcileEpisodeMetadata,
    type EpisodeMetadata as CatalogEpisodeMetadata,
} from '@arc/core';
import {
    availableEpisodeCount,
    canPreserveEpisodeMetadata,
    episodeMetadataRevision,
    episodeMetadataRevisionAfterSync,
    nextRefreshAt,
    providerEpisodeCount,
} from '@arc/core';
import { episodesForRelease, preferredEpisodeAirDate, providerConfirmsEpisode } from '@arc/core';

export class TargetEpisodeUnavailableError extends Error {
    constructor(
        readonly anilistId: number,
        readonly targetEpisode: number
    ) {
        super(
            `Playback providers do not yet expose episode ${targetEpisode} for AniList ${anilistId}`
        );
    }
}

export class EpisodeInventoryUnresolvedError extends Error {
    constructor(
        readonly anilistId: number,
        readonly expectedEpisodes: number,
        readonly receivedEpisodes: number
    ) {
        super(`Episode metadata could not resolve the provider inventory for AniList ${anilistId}`);
    }
}

export function isEpisodeInventoryUnresolvedError(
    cause: unknown
): cause is EpisodeInventoryUnresolvedError {
    return cause instanceof EpisodeInventoryUnresolvedError;
}

const inventoryRequests = new Map<number, ReturnType<typeof storedEpisodes>>();

export function episodeInventoryBackfillKey(anilistId: number) {
    return `episode:backfill:${anilistId}`;
}

export async function ensureEpisodeInventoryBackfill(anilistId: number) {
    await db
        .insert(maintenanceTask)
        .values({
            kind: 'episode_backfill',
            dedupeKey: episodeInventoryBackfillKey(anilistId),
            payload: {
                kind: 'episode_backfill',
                anilistId,
            },
            priority: 0,
        })
        .onConflictDoUpdate({
            target: maintenanceTask.dedupeKey,
            setWhere: or(
                eq(maintenanceTask.state, 'completed'),
                eq(maintenanceTask.state, 'failed')
            ),
            set: {
                state: 'pending',
                attempts: 0,
                nextAttemptAt: new Date(),
                leaseOwner: null,
                leaseUntil: null,
                lastError: null,
                result: null,
                completedAt: null,
                updatedAt: new Date(),
            },
        });
}

export async function enqueueEpisodeInventoryBackfill(anilistId: number) {
    await db
        .insert(maintenanceTask)
        .values({
            kind: 'episode_backfill',
            dedupeKey: episodeInventoryBackfillKey(anilistId),
            payload: {
                kind: 'episode_backfill',
                anilistId,
            },
            priority: 80,
        })
        .onConflictDoUpdate({
            target: maintenanceTask.dedupeKey,
            setWhere: ne(maintenanceTask.state, 'running'),
            set: {
                priority: 80,
                state: 'pending',
                attempts: 0,
                nextAttemptAt: new Date(),
                leaseOwner: null,
                leaseUntil: null,
                lastError: null,
                result: null,
                completedAt: null,
                updatedAt: new Date(),
            },
        });
}

async function fetchAndStore(
    anime: AniListAnime,
    confirmation?: { targetEpisode: number; airingAt: Date; leaseOwner: string }
) {
    const expected =
        anime.status === 'RELEASING'
            ? availableEpisodeCount(anime)
            : anime.status === 'FINISHED'
              ? providerEpisodeCount(anime)
              : null;
    let providerEpisodes;
    try {
        providerEpisodes = await anikotoProvider.getEpisodes(anime);
    } catch (cause) {
        if (!isAniKotoNoMatchError(cause)) {
            throw cause;
        }

        providerEpisodes = await anikotoProvider.getEpisodes(
            await refreshAnimeRelease(anime.id, { force: true })
        );
    }
    if (!providerEpisodes.length) {
        throw new Error(`No playback provider returned episodes for AniList ${anime.id}`);
    }
    if (confirmation && !providerConfirmsEpisode(providerEpisodes, confirmation.targetEpisode)) {
        throw new TargetEpisodeUnavailableError(anime.id, confirmation.targetEpisode);
    }
    const internalAnimeId = await ensureInternalAnimeId(anime.id, animeTitles(anime)[0]);

    const [storedText, previousSync, confirmedAirDates] = await Promise.all([
        db
            .select({
                episodeId: animeEpisode.episodeId,
                number: animeEpisode.number,
                audio: animeEpisode.audio,
                title: animeEpisode.metadataTitle,
                titleSource: animeEpisode.metadataTitleSource,
                overview: animeEpisode.overview,
                overviewSource: animeEpisode.overviewSource,
            })
            .from(animeEpisode)
            .where(eq(animeEpisode.anilistId, anime.id))
            .then(
                (rows) => new Map(rows.map(({ episodeId, ...text }) => [episodeId, text] as const))
            ),
        db
            .select({
                metadataExternalIdId: animeEpisodeSync.metadataExternalIdId,
                metadataRevision: animeEpisodeSync.metadataRevision,
                lastSuccessAt: animeEpisodeSync.lastSuccessAt,
            })
            .from(animeEpisodeSync)
            .where(eq(animeEpisodeSync.anilistId, anime.id))
            .limit(1)
            .then((rows) => rows[0] ?? null),
        db
            .select({
                episode: animeEpisodeTarget.targetEpisode,
                airingAt: animeEpisodeTarget.airingAt,
            })
            .from(animeEpisodeTarget)
            .where(
                and(
                    eq(animeEpisodeTarget.anilistId, anime.id),
                    eq(animeEpisodeTarget.state, 'confirmed')
                )
            )
            .then(
                (rows) => new Map(rows.map(({ episode, airingAt }) => [episode, airingAt] as const))
            ),
    ]);

    const resolvedMetadataSource = await resolveStored(anime, { refresh: true }).catch((cause) => {
        if (cause instanceof NoConfidentTmdbMappingError) {
            return null;
        }
        logger.debug(`TMDB episode enrichment failed for AniList ${anime.id}`, cause);
        return null;
    });
    const metadata = resolvedMetadataSource
        ? await getEpisodeMetadata(
              anime,
              providerEpisodes,
              resolvedMetadataSource,
              canPreserveEpisodeMetadata(
                  previousSync?.metadataExternalIdId ?? null,
                  resolvedMetadataSource.externalIdId
              ) && previousSync?.metadataRevision === episodeMetadataRevision
                  ? storedText
                  : new Map()
          ).catch((cause) => {
              logger.debug(`TMDB episode enrichment failed for AniList ${anime.id}`, cause);
              return null;
          })
        : null;
    const catalogMetadata = metadata
        ? new Map<string, CatalogEpisodeMetadata>(
              [...metadata].map(([episodeId, value]) => [
                  episodeId,
                  {
                      title: value.title || null,
                      titleSource: value.titleSource ?? null,
                      imageUrl: value.imageUrl,
                      runtime: value.runtime,
                      airDate: value.airDate || null,
                      overview: value.overview || null,
                      overviewSource: value.overviewSource ?? null,
                  },
              ])
          )
        : null;
    const source = episodesForRelease(anime, providerEpisodes, metadata);
    const regularEpisodeNumbers = new Set(
        source.flatMap(({ number }) => (Number.isInteger(number) && number > 0 ? [number] : []))
    );
    if (
        anime.status === 'FINISHED' &&
        expected !== null &&
        regularEpisodeNumbers.size !== expected
    ) {
        await recordAniKotoInventoryVerification(
            anime,
            providerEpisodes,
            source,
            expected,
            'unresolved',
            `Provider returned ${regularEpisodeNumbers.size} regular episodes; AniList expects ${expected}`
        );
        throw new EpisodeInventoryUnresolvedError(anime.id, expected, regularEpisodeNumbers.size);
    }
    const now = new Date();
    await db.transaction(async (tx) => {
        const [sync, existing] = await Promise.all([
            tx
                .select({
                    metadataExternalIdId: animeEpisodeSync.metadataExternalIdId,
                    metadataRevision: animeEpisodeSync.metadataRevision,
                    sourceRevision: animeEpisodeSync.sourceRevision,
                    stableSince: animeEpisodeSync.stableSince,
                    lastSuccessAt: animeEpisodeSync.lastSuccessAt,
                })
                .from(animeEpisodeSync)
                .where(eq(animeEpisodeSync.anilistId, anime.id))
                .limit(1)
                .then((rows) => rows[0] ?? null),
            tx.select().from(animeEpisode).where(eq(animeEpisode.anilistId, anime.id)),
        ]);
        const stored = new Map(existing.map((episode) => [episode.episodeId, episode]));
        const existingByNumber = new Map<number, (typeof existing)[number][]>();
        existing.forEach((episode) => {
            const rows = existingByNumber.get(episode.number) ?? [];
            rows.push(episode);
            existingByNumber.set(episode.number, rows);
        });
        const sourceIds = new Set(source.map(({ id }) => id));
        const sourceIdsByNumber = new Map<number, string[]>();
        source.forEach((episode) => {
            if (!Number.isInteger(episode.number) || episode.number <= 0) {
                return;
            }

            const ids = sourceIdsByNumber.get(episode.number) ?? [];
            ids.push(episode.id);
            sourceIdsByNumber.set(episode.number, ids);
        });
        const episodeIdReplacements = new Map<string, string>();
        existing.forEach((episode) => {
            const currentIds = sourceIdsByNumber.get(episode.number);
            if (sourceIds.has(episode.episodeId) || currentIds?.length !== 1) {
                return;
            }

            episodeIdReplacements.set(episode.episodeId, currentIds[0]);
        });
        const staleEpisodeIds = existing.flatMap(({ episodeId }) =>
            sourceIds.has(episodeId) ? [] : [episodeId]
        );
        const values = source.map((episode): typeof animeEpisode.$inferInsert => {
            const previous =
                stored.get(episode.id) ??
                (existingByNumber.get(episode.number)?.length === 1
                    ? existingByNumber.get(episode.number)?.[0]
                    : undefined);
            const metadataValues = reconcileEpisodeMetadata(
                [
                    {
                        episodeId: episode.id,
                        number: episode.number,
                        metadataTitle: previous?.metadataTitle ?? null,
                        metadataTitleSource: previous?.metadataTitleSource ?? null,
                        imageUrl: previous?.imageUrl ?? null,
                        runtimeMinutes: previous?.runtimeMinutes ?? null,
                        airDate: previous?.airDate ?? null,
                        overview: previous?.overview ?? null,
                        overviewSource: previous?.overviewSource ?? null,
                    },
                ],
                catalogMetadata,
                {
                    previousSourceId: sync?.metadataExternalIdId ?? null,
                    currentSourceId: resolvedMetadataSource?.externalIdId ?? null,
                    previousRevision: sync?.metadataRevision ?? null,
                    confirmedAirDates,
                }
            )[0];
            const confirmedAiringAt =
                confirmation?.targetEpisode === episode.number
                    ? confirmation.airingAt
                    : confirmedAirDates.get(episode.number);

            return {
                anilistId: anime.id,
                episodeId: episode.id,
                number: episode.number,
                providerTitle: episode.title || previous?.providerTitle || null,
                metadataTitle: metadataValues.metadataTitle,
                metadataTitleSource: metadataValues.metadataTitleSource,
                // The sole playback provider is authoritative per episode. Do not
                // retain a mode that a later inventory refresh no longer reports.
                audio: episode.audio,
                imageUrl: metadataValues.imageUrl,
                runtimeMinutes: metadataValues.runtimeMinutes,
                // AniList's confirmed airing timestamp is the release truth;
                // TMDB's calendar date can represent the source timezone instead.
                airDate: preferredEpisodeAirDate(
                    episode.number,
                    metadataValues.airDate,
                    confirmedAiringAt
                ),
                overview: metadataValues.overview,
                overviewSource: metadataValues.overviewSource,
                firstSeenAt: previous?.firstSeenAt ?? now,
                lastSeenAt: now,
                lastVerifiedAt: now,
            };
        });
        await tx
            .insert(animeEpisode)
            .values(values)
            .onConflictDoUpdate({
                target: [animeEpisode.anilistId, animeEpisode.episodeId],
                set: {
                    number: sql.raw(`excluded."${animeEpisode.number.name}"`),
                    providerTitle: sql.raw(`excluded."${animeEpisode.providerTitle.name}"`),
                    metadataTitle: sql.raw(`excluded."${animeEpisode.metadataTitle.name}"`),
                    metadataTitleSource: sql.raw(
                        `excluded."${animeEpisode.metadataTitleSource.name}"`
                    ),
                    audio: sql.raw(`excluded."${animeEpisode.audio.name}"`),
                    imageUrl: sql.raw(`excluded."${animeEpisode.imageUrl.name}"`),
                    runtimeMinutes: sql.raw(`excluded."${animeEpisode.runtimeMinutes.name}"`),
                    airDate: sql.raw(`excluded."${animeEpisode.airDate.name}"`),
                    overview: sql.raw(`excluded."${animeEpisode.overview.name}"`),
                    overviewSource: sql.raw(`excluded."${animeEpisode.overviewSource.name}"`),
                    lastSeenAt: now,
                    lastVerifiedAt: now,
                },
            });

        const previousByNumber = new Map(
            [...storedText.values()].map(({ number, audio }) => [number, audio] as const)
        );
        const events: Array<{
            type: 'episode_available' | 'dub_available';
            episodeId: string;
            episodeNumber: number;
        }> = [];
        for (const episode of source) {
            if (!Number.isInteger(episode.number) || episode.number <= 0) {
                continue;
            }

            const previousAudio = previousByNumber.get(episode.number);
            if (confirmation?.targetEpisode === episode.number) {
                events.push({
                    type: 'episode_available' as const,
                    episodeId: episode.id,
                    episodeNumber: episode.number,
                });
                continue;
            }
            if (!previousAudio && previousSync?.lastSuccessAt) {
                events.push({
                    type: 'episode_available' as const,
                    episodeId: episode.id,
                    episodeNumber: episode.number,
                });
                continue;
            }
            if (previousAudio && !previousAudio.includes('dub') && episode.audio.includes('dub')) {
                events.push({
                    type: 'dub_available' as const,
                    episodeId: episode.id,
                    episodeNumber: episode.number,
                });
            }
        }
        await createInventoryNotifications(tx, {
            animeId: internalAnimeId,
            title: animeTitles(anime)[0] ?? `Anime ${anime.id}`,
            imageUrl: anime.coverImage?.extraLarge ?? anime.coverImage?.large ?? null,
            events,
        });
        for (const [oldEpisodeId, newEpisodeId] of episodeIdReplacements) {
            await tx
                .update(playbackProgress)
                .set({ episodeId: newEpisodeId })
                .where(
                    and(
                        eq(playbackProgress.animeId, internalAnimeId),
                        eq(playbackProgress.episodeId, oldEpisodeId)
                    )
                );
        }
        if (staleEpisodeIds.length) {
            await tx
                .delete(animeEpisode)
                .where(
                    and(
                        eq(animeEpisode.anilistId, anime.id),
                        inArray(animeEpisode.episodeId, staleEpisodeIds)
                    )
                );
        }

        const persisted = await tx
            .select({
                id: animeEpisode.episodeId,
                number: animeEpisode.number,
                title: sql<string>`coalesce(${animeEpisode.providerTitle}, '')`,
                audio: animeEpisode.audio,
            })
            .from(animeEpisode)
            .where(eq(animeEpisode.anilistId, anime.id))
            .orderBy(animeEpisode.number);
        const revision = sourceRevision(persisted);
        const metadataRevision = episodeMetadataRevisionAfterSync(
            values.map(({ imageUrl, metadataTitle, overview }) => ({
                image: imageUrl ?? null,
                title: metadataTitle ?? '',
                overview: overview ?? '',
            })),
            metadata !== null,
            resolvedMetadataSource !== null || sync?.metadataExternalIdId !== null
        );

        const stableSince =
            sync?.sourceRevision === revision && sync.stableSince ? sync.stableSince : now;

        await tx
            .insert(animeEpisodeSync)
            .values({
                anilistId: anime.id,
                mediaStatus: anime.status,
                expectedEpisodes: anime.episodes,
                sourceRevision: revision,
                metadataExternalIdId:
                    resolvedMetadataSource?.externalIdId ?? sync?.metadataExternalIdId ?? null,
                metadataRevision,
                stableSince,
                lastSuccessAt: now,
                nextRefreshAt: nextRefreshAt(anime, stableSince),
                failureCount: 0,
                lastError: null,
            })
            .onConflictDoUpdate({
                target: animeEpisodeSync.anilistId,
                set: {
                    mediaStatus: anime.status,
                    expectedEpisodes: anime.episodes,
                    sourceRevision: revision,
                    metadataExternalIdId:
                        resolvedMetadataSource?.externalIdId ?? sync?.metadataExternalIdId ?? null,
                    metadataRevision,
                    stableSince,
                    lastSuccessAt: now,
                    nextRefreshAt: nextRefreshAt(anime, stableSince),
                    failureCount: 0,
                    lastError: null,
                },
            });

        if (!confirmation) {
            const confirmedNumbers = source.flatMap(({ number }) =>
                Number.isInteger(number) && number > 0 ? [number] : []
            );
            if (confirmedNumbers.length) {
                await tx
                    .update(animeEpisodeTarget)
                    .set({
                        state: 'confirmed',
                        inventoryRevision: revision,
                        confirmedAt: now,
                        leaseOwner: null,
                        leaseUntil: null,
                        lastError: null,
                        updatedAt: now,
                    })
                    .where(
                        and(
                            eq(animeEpisodeTarget.anilistId, anime.id),
                            eq(animeEpisodeTarget.state, 'pending'),
                            isNull(animeEpisodeTarget.leaseOwner),
                            inArray(animeEpisodeTarget.targetEpisode, confirmedNumbers)
                        )
                    );
            }
            return;
        }

        const [confirmed] = await tx
            .update(animeEpisodeTarget)
            .set({
                state: 'confirmed',
                inventoryRevision: revision,
                confirmedAt: now,
                leaseOwner: null,
                leaseUntil: null,
                lastError: null,
                updatedAt: now,
            })
            .where(
                and(
                    eq(animeEpisodeTarget.anilistId, anime.id),
                    eq(animeEpisodeTarget.targetEpisode, confirmation.targetEpisode),
                    eq(animeEpisodeTarget.state, 'pending'),
                    eq(animeEpisodeTarget.leaseOwner, confirmation.leaseOwner)
                )
            )
            .returning({ anilistId: animeEpisodeTarget.anilistId });
        if (!confirmed) {
            throw new Error(
                `Episode target lease was lost for AniList ${anime.id} episode ${confirmation.targetEpisode}`
            );
        }
    });

    await recordAniKotoInventoryVerification(anime, providerEpisodes, source, expected, 'verified');

    return storedEpisodes(anime);
}

export function discoverEpisodeInventory(anime: AniListAnime) {
    const pending = inventoryRequests.get(anime.id);
    if (pending) {
        return pending;
    }

    const request = fetchAndStore(anime)
        .then(async (episodes) => {
            const now = new Date();
            await db
                .update(maintenanceTask)
                .set({
                    state: 'completed',
                    result: {
                        anilistId: anime.id,
                        episodes: episodes.length,
                    },
                    completedAt: now,
                    updatedAt: now,
                })
                .where(
                    and(
                        eq(maintenanceTask.dedupeKey, episodeInventoryBackfillKey(anime.id)),
                        eq(maintenanceTask.state, 'pending')
                    )
                );
            return episodes;
        })
        .catch(async (cause) => {
            if (cause instanceof TargetEpisodeUnavailableError) {
                await scheduleReleaseTargets([anime.id]).catch((failure) =>
                    logger.debug(
                        `Could not schedule episode target for AniList ${anime.id}`,
                        failure
                    )
                );
            }
            await ensureEpisodeInventoryBackfill(anime.id).catch((failure) =>
                logger.debug(`Could not enqueue episode backfill for AniList ${anime.id}`, failure)
            );
            if (
                !isAniKotoTransientError(cause) &&
                !isAniKotoNoMatchError(cause) &&
                !isEpisodeInventoryUnresolvedError(cause) &&
                !(
                    cause instanceof GraphQLRequestError &&
                    (cause.status === undefined || cause.status === 429 || cause.status >= 500)
                )
            ) {
                logger.debug(`Episode inventory repair failed for AniList ${anime.id}`, cause);
            }
            throw cause;
        });
    inventoryRequests.set(anime.id, request);
    const cleanup = () => {
        if (inventoryRequests.get(anime.id) === request) {
            inventoryRequests.delete(anime.id);
        }
    };
    void request.then(cleanup, cleanup);
    return request;
}

export async function confirmScheduledEpisode(
    anime: AniListAnime,
    targetEpisode: number,
    leaseOwner: string,
    airingAt: Date
) {
    return fetchAndStore(anime, { targetEpisode, airingAt, leaseOwner });
}
