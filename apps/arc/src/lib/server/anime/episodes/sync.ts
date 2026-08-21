import { and, eq, notInArray, sql } from 'drizzle-orm';

import { mergeAudioModes } from '$lib/audio';
import type { AnimeEpisode } from '$lib/types';
import { db, excluded } from '@arc/db';
import { animeEpisode, animeEpisodeSync } from '@arc/db/schema';
import type { AniListAnime } from '../anilist/types';
import { playback } from '../providers';
import { getEpisodeMetadata } from '../tmdb/episodes';
import { NoConfidentTmdbMappingError, resolveStored } from '../tmdb/mapping';
import type { StoredMapping } from '../tmdb/types';
import { getFillerClassifications, mergeFillerClassifications } from '../filler';
import { sourceRevision, storedEpisodes } from './model';
import {
    canPreserveEpisodeMetadata,
    classificationRefreshDue,
    episodeMetadataRevision,
    episodeInventoryIsExpected,
    nextRefreshAt,
} from './policy';
import { episodesForRelease } from './release';

const requests = new Map<number, Promise<AnimeEpisode[]>>();

async function recordFailure(anilistId: number, cause: unknown) {
    const message = cause instanceof Error ? cause.message : 'Episode refresh failed';
    const retryAt = new Date(Date.now() + 60 * 60 * 1_000);

    await db
        .insert(animeEpisodeSync)
        .values({
            anilistId,
            failureCount: 1,
            lastError: message,
            nextRefreshAt: retryAt,
        })
        .onConflictDoUpdate({
            target: animeEpisodeSync.anilistId,
            set: {
                failureCount: sql`${animeEpisodeSync.failureCount} + 1`,
                lastError: message,
                nextRefreshAt: retryAt,
            },
        });
}

async function recordExpectedEmptyInventory(anime: AniListAnime) {
    const now = new Date();
    const revision = sourceRevision([]);
    const sync = await db
        .select({
            metadataExternalIdId: animeEpisodeSync.metadataExternalIdId,
            sourceRevision: animeEpisodeSync.sourceRevision,
            stableSince: animeEpisodeSync.stableSince,
        })
        .from(animeEpisodeSync)
        .where(eq(animeEpisodeSync.anilistId, anime.id))
        .limit(1)
        .then((rows) => rows[0] ?? null);
    const stableSince =
        sync?.sourceRevision === revision && sync.stableSince ? sync.stableSince : now;
    const values = {
        mediaStatus: anime.status,
        expectedEpisodes: anime.episodes,
        sourceRevision: revision,
        metadataExternalIdId: sync?.metadataExternalIdId ?? null,
        stableSince,
        lastSuccessAt: now,
        classificationsRefreshedAt: now,
        nextRefreshAt: nextRefreshAt(anime, stableSince),
        failureCount: 0,
        lastError: null,
    };

    await db
        .insert(animeEpisodeSync)
        .values({ anilistId: anime.id, ...values })
        .onConflictDoUpdate({
            target: animeEpisodeSync.anilistId,
            set: values,
        });

    return storedEpisodes(anime);
}

async function fetchAndStore(anime: AniListAnime, metadataSource: StoredMapping | undefined) {
    if (!episodeInventoryIsExpected(anime.status)) {
        return recordExpectedEmptyInventory(anime);
    }

    const providerEpisodes = await playback.getEpisodes(anime);
    if (!providerEpisodes.length) {
        throw new Error(`No playback provider returned episodes for AniList ${anime.id}`);
    }

    const [storedText, previousSync] = await Promise.all([
        db
            .select({
                episodeId: animeEpisode.episodeId,
                title: animeEpisode.metadataTitle,
                titleSource: animeEpisode.metadataTitleSource,
                overview: animeEpisode.overview,
                overviewSource: animeEpisode.overviewSource,
                classification: animeEpisode.classification,
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
                classificationRevision: animeEpisodeSync.classificationRevision,
                classificationsRefreshedAt: animeEpisodeSync.classificationsRefreshedAt,
            })
            .from(animeEpisodeSync)
            .where(eq(animeEpisodeSync.anilistId, anime.id))
            .limit(1)
            .then((rows) => rows[0] ?? null),
    ]);

    const fillerClassifications = classificationRefreshDue(
        previousSync?.classificationsRefreshedAt,
        anime.status,
        previousSync?.classificationRevision
    )
        ? await getFillerClassifications(anime, providerEpisodes).catch((cause) => {
              console.error(`AnimeFillerList refresh failed for MAL ${anime.idMal}`, cause);
              return null;
          })
        : undefined;

    const resolvedMetadataSource =
        metadataSource ??
        (await resolveStored(anime).catch((cause) => {
            if (cause instanceof NoConfidentTmdbMappingError) {
                return null;
            }
            console.error(`TMDB episode enrichment failed for AniList ${anime.id}`, cause);
            return null;
        }));
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
              console.error(`TMDB episode enrichment failed for AniList ${anime.id}`, cause);
              return null;
          })
        : null;
    const source = episodesForRelease(
        anime,
        fillerClassifications
            ? mergeFillerClassifications(providerEpisodes, fillerClassifications)
            : providerEpisodes,
        metadata
    );
    const now = new Date();
    const revision = sourceRevision(source);
    await db.transaction(async (tx) => {
        const [sync, existing] = await Promise.all([
            tx
                .select({
                    metadataExternalIdId: animeEpisodeSync.metadataExternalIdId,
                    metadataRevision: animeEpisodeSync.metadataRevision,
                    sourceRevision: animeEpisodeSync.sourceRevision,
                    stableSince: animeEpisodeSync.stableSince,
                    lastSuccessAt: animeEpisodeSync.lastSuccessAt,
                    classificationRevision: animeEpisodeSync.classificationRevision,
                    classificationsRefreshedAt: animeEpisodeSync.classificationsRefreshedAt,
                })
                .from(animeEpisodeSync)
                .where(eq(animeEpisodeSync.anilistId, anime.id))
                .limit(1)
                .then((rows) => rows[0] ?? null),
            tx.select().from(animeEpisode).where(eq(animeEpisode.anilistId, anime.id)),
        ]);
        const stored = new Map(existing.map((episode) => [episode.episodeId, episode]));
        const values = source.map((episode): typeof animeEpisode.$inferInsert => {
            const previous = stored.get(episode.id);
            const media = metadata?.get(episode.id);
            const previousMetadata =
                canPreserveEpisodeMetadata(
                    sync?.metadataExternalIdId ?? null,
                    resolvedMetadataSource?.externalIdId ?? null
                ) &&
                (metadata === null || sync?.metadataRevision === episodeMetadataRevision)
                    ? previous
                    : null;

            return {
                anilistId: anime.id,
                episodeId: episode.id,
                number: episode.number,
                providerTitle: episode.title || previous?.providerTitle || null,
                metadataTitle: media?.title || previousMetadata?.metadataTitle || null,
                metadataTitleSource:
                    media?.titleSource ?? previousMetadata?.metadataTitleSource ?? null,
                audio: mergeAudioModes(previous?.audio, episode.audio),
                classification:
                    fillerClassifications instanceof Map
                        ? (episode.type ?? 'unknown')
                        : episode.type === 'filler' || previous?.classification === 'filler'
                          ? 'filler'
                          : episode.type === 'recap'
                            ? 'recap'
                            : (previous?.classification ?? episode.type ?? 'unknown'),
                imageUrl: media?.imageUrl ?? previousMetadata?.imageUrl ?? null,
                runtimeMinutes: media?.runtime ?? previousMetadata?.runtimeMinutes ?? null,
                airDate: media?.airDate || previousMetadata?.airDate || null,
                overview: media?.overview || previousMetadata?.overview || null,
                overviewSource: media?.overviewSource ?? previousMetadata?.overviewSource ?? null,
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
                    number: excluded(animeEpisode.number),
                    providerTitle: excluded(animeEpisode.providerTitle),
                    metadataTitle: excluded(animeEpisode.metadataTitle),
                    metadataTitleSource: excluded(animeEpisode.metadataTitleSource),
                    audio: excluded(animeEpisode.audio),
                    classification: excluded(animeEpisode.classification),
                    imageUrl: excluded(animeEpisode.imageUrl),
                    runtimeMinutes: excluded(animeEpisode.runtimeMinutes),
                    airDate: excluded(animeEpisode.airDate),
                    overview: excluded(animeEpisode.overview),
                    overviewSource: excluded(animeEpisode.overviewSource),
                    lastSeenAt: now,
                    lastVerifiedAt: now,
                },
            });

        await tx.delete(animeEpisode).where(
            and(
                eq(animeEpisode.anilistId, anime.id),
                notInArray(
                    animeEpisode.episodeId,
                    source.map(({ id }) => id)
                )
            )
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
                metadataRevision: metadata
                    ? episodeMetadataRevision
                    : (sync?.metadataRevision ?? null),
                stableSince,
                lastSuccessAt: now,
                classificationsRefreshedAt: !(fillerClassifications instanceof Map)
                    ? (sync?.classificationsRefreshedAt ?? null)
                    : now,
                classificationRevision:
                    fillerClassifications instanceof Map
                        ? 'animefillerlist-v1'
                        : (sync?.classificationRevision ?? null),
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
                    metadataRevision: metadata
                        ? episodeMetadataRevision
                        : (sync?.metadataRevision ?? null),
                    stableSince,
                    lastSuccessAt: now,
                    classificationsRefreshedAt: !(fillerClassifications instanceof Map)
                        ? (sync?.classificationsRefreshedAt ?? null)
                        : now,
                    classificationRevision:
                        fillerClassifications instanceof Map
                            ? 'animefillerlist-v1'
                            : (sync?.classificationRevision ?? null),
                    nextRefreshAt: nextRefreshAt(anime, stableSince),
                    failureCount: 0,
                    lastError: null,
                },
            });
    });

    return storedEpisodes(anime);
}

export async function refreshEpisodes(anime: AniListAnime, metadataSource?: StoredMapping) {
    const pending = requests.get(anime.id);
    if (pending) {
        return pending;
    }

    const request = fetchAndStore(anime, metadataSource).catch(async (cause) => {
        await recordFailure(anime.id, cause).catch((failure) =>
            console.error(
                `Could not record episode refresh failure for AniList ${anime.id}`,
                failure
            )
        );
        throw cause;
    });
    requests.set(anime.id, request);

    try {
        return await request;
    } finally {
        requests.delete(anime.id);
    }
}
