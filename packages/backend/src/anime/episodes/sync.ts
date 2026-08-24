import { and, eq, sql } from 'drizzle-orm';

import { mergeAudioModes } from '@arc/shared/audio';
import { db, excluded } from '@arc/db';
import { animeEpisode, animeEpisodeSync, animeEpisodeTarget } from '@arc/db/schema';
import type { AniListAnime } from '../anilist/types';
import { playback } from '../providers';
import { getEpisodeMetadata } from '../tmdb/episodes';
import { NoConfidentTmdbMappingError, resolveStored } from '../tmdb/mapping';
import { getFillerClassifications, mergeFillerClassifications } from '../filler';
import { sourceRevision, storedEpisodes } from './model';
import {
    canPreserveEpisodeMetadata,
    classificationRefreshDue,
    episodeMetadataRevision,
    nextRefreshAt,
} from './policy';
import { episodesForRelease, providerConfirmsEpisode } from './release';

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

async function fetchAndStore(
    anime: AniListAnime,
    confirmation: { targetEpisode: number; leaseOwner: string }
) {
    const providerEpisodes = await playback.getEpisodes(anime);
    if (!providerEpisodes.length) {
        throw new Error(`No playback provider returned episodes for AniList ${anime.id}`);
    }
    if (!providerConfirmsEpisode(providerEpisodes, confirmation.targetEpisode)) {
        throw new TargetEpisodeUnavailableError(anime.id, confirmation.targetEpisode);
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

    const resolvedMetadataSource = await resolveStored(anime).catch((cause) => {
        if (cause instanceof NoConfidentTmdbMappingError) {
            return null;
        }
        console.error(`TMDB episode enrichment failed for AniList ${anime.id}`, cause);
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

        const persisted = await tx
            .select({
                id: animeEpisode.episodeId,
                number: animeEpisode.number,
                title: sql<string>`coalesce(${animeEpisode.providerTitle}, '')`,
                audio: animeEpisode.audio,
                type: animeEpisode.classification,
            })
            .from(animeEpisode)
            .where(eq(animeEpisode.anilistId, anime.id))
            .orderBy(animeEpisode.number);
        const revision = sourceRevision(persisted);

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

    return storedEpisodes(anime);
}

export async function confirmScheduledEpisode(
    anime: AniListAnime,
    targetEpisode: number,
    leaseOwner: string
) {
    return fetchAndStore(anime, { targetEpisode, leaseOwner });
}
