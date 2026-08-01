import { and, eq, notInArray, sql } from 'drizzle-orm';

import { mergeAudioModes } from '$lib/anime/audio';
import type { AnimeEpisode } from '$lib/anime/types';
import { db } from '$lib/server/db';
import {
    animeEpisode,
    animeEpisodeSync,
} from '$lib/server/db/schema';
import { playback } from '../providers';
import { tmdb } from '../tmdb';
import { resolveStored } from '../tmdb/mapping';
import type { StoredMapping } from '../tmdb/types';
import { sourceRevision, storedEpisodes } from './model';
import { nextRefreshAt } from './policy';
import { episodesForRelease } from './release';
import type { AniListAnime } from './types';

const requests = new Map<number, Promise<AnimeEpisode[]>>();

function metadataNeedsRefresh(
    source: Awaited<ReturnType<typeof playback.getEpisodes>>,
    metadata: Awaited<ReturnType<typeof tmdb.getEpisodeMetadata>> | null,
) {
    if (!metadata || metadata.size < source.length) {
        return true;
    }

    return source.some((episode) => {
        const media = metadata.get(episode.id);

        return (
            !media ||
            /^(?:episode|movie)(?:\s+\d+)?$/i.test(media.title) ||
            !media.overview ||
            media.titleSource !== 'tmdb' ||
            media.overviewSource !== 'tmdb' ||
            !media.imageUrl ||
            !media.runtime ||
            !media.airDate
        );
    });
}

async function recordFailure(anilistId: number, cause: unknown) {
    const message =
        cause instanceof Error ? cause.message : 'Episode refresh failed';
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

async function fetchAndStore(
    anime: AniListAnime,
    metadataSource: StoredMapping | undefined,
) {
    const providerEpisodes = await playback.getEpisodes(anime);
    if (!providerEpisodes.length) {
        throw new Error(
            `No playback provider returned episodes for AniList ${anime.id}`,
        );
    }

    const storedText = new Map(
        await db
            .select({
                episodeId: animeEpisode.episodeId,
                title: animeEpisode.metadataTitle,
                titleSource: animeEpisode.metadataTitleSource,
                overview: animeEpisode.overview,
                overviewSource: animeEpisode.overviewSource,
            })
            .from(animeEpisode)
            .where(eq(animeEpisode.anilistId, anime.id))
            .then((rows) =>
                rows.map(({ episodeId, ...text }) => [episodeId, text]),
            ),
    );

    const resolvedMetadataSource =
        metadataSource ??
        (await resolveStored(anime).catch((cause) => {
            console.error(
                `TMDB episode enrichment failed for AniList ${anime.id}`,
                cause,
            );
            return null;
        }));
    const metadata = resolvedMetadataSource
        ? await tmdb
              .getEpisodeMetadata(
                  anime,
                  providerEpisodes,
                  resolvedMetadataSource,
                  storedText,
              )
              .catch((cause) => {
                  console.error(
                      `TMDB episode enrichment failed for AniList ${anime.id}`,
                      cause,
                  );
                  return null;
              })
        : null;
    const source = episodesForRelease(
        anime,
        providerEpisodes,
        metadata,
    );
    const now = new Date();
    const revision = sourceRevision(source);
    const refreshMetadataSoon = metadataNeedsRefresh(source, metadata);

    await db.transaction(async (tx) => {
        const [sync, existing] = await Promise.all([
            tx
                .select({
                    metadataExternalIdId:
                        animeEpisodeSync.metadataExternalIdId,
                    sourceRevision: animeEpisodeSync.sourceRevision,
                    stableSince: animeEpisodeSync.stableSince,
                })
                .from(animeEpisodeSync)
                .where(eq(animeEpisodeSync.anilistId, anime.id))
                .limit(1)
                .then((rows) => rows[0] ?? null),
            tx
                .select()
                .from(animeEpisode)
                .where(eq(animeEpisode.anilistId, anime.id)),
        ]);
        const stored = new Map(
            existing.map((episode) => [episode.episodeId, episode]),
        );
        const values = source.map((episode) => {
            const previous = stored.get(episode.id);
            const media = metadata?.get(episode.id);
            const previousMetadata =
                metadata === null &&
                (!resolvedMetadataSource ||
                    sync?.metadataExternalIdId ===
                        resolvedMetadataSource.externalIdId)
                    ? previous
                    : null;

            return {
                anilistId: anime.id,
                episodeId: episode.id,
                number: episode.number,
                providerTitle:
                    episode.title || previous?.providerTitle || null,
                metadataTitle:
                    media?.title ||
                    previousMetadata?.metadataTitle ||
                    null,
                metadataTitleSource:
                    media?.titleSource ??
                    previousMetadata?.metadataTitleSource ??
                    null,
                audio: mergeAudioModes(previous?.audio, episode.audio),
                imageUrl:
                    media?.imageUrl ??
                    previousMetadata?.imageUrl ??
                    null,
                runtimeMinutes:
                    media?.runtime ??
                    previousMetadata?.runtimeMinutes ??
                    null,
                airDate:
                    media?.airDate ||
                    previousMetadata?.airDate ||
                    null,
                overview:
                    media?.overview ||
                    previousMetadata?.overview ||
                    null,
                overviewSource:
                    media?.overviewSource ??
                    previousMetadata?.overviewSource ??
                    null,
                firstSeenAt: previous?.firstSeenAt ?? now,
                lastSeenAt: now,
                lastVerifiedAt: now,
            };
        });

        await tx
            .insert(animeEpisode)
            .values(values)
            .onConflictDoUpdate({
                target: [
                    animeEpisode.anilistId,
                    animeEpisode.episodeId,
                ],
                set: {
                    number: sql.raw(
                        `excluded.${animeEpisode.number.name}`,
                    ),
                    providerTitle: sql.raw(
                        `excluded.${animeEpisode.providerTitle.name}`,
                    ),
                    metadataTitle: sql.raw(
                        `excluded.${animeEpisode.metadataTitle.name}`,
                    ),
                    metadataTitleSource: sql.raw(
                        `excluded.${animeEpisode.metadataTitleSource.name}`,
                    ),
                    audio: sql.raw(
                        `excluded.${animeEpisode.audio.name}`,
                    ),
                    imageUrl: sql.raw(
                        `excluded.${animeEpisode.imageUrl.name}`,
                    ),
                    runtimeMinutes: sql.raw(
                        `excluded.${animeEpisode.runtimeMinutes.name}`,
                    ),
                    airDate: sql.raw(
                        `excluded.${animeEpisode.airDate.name}`,
                    ),
                    overview: sql.raw(
                        `excluded.${animeEpisode.overview.name}`,
                    ),
                    overviewSource: sql.raw(
                        `excluded.${animeEpisode.overviewSource.name}`,
                    ),
                    lastSeenAt: now,
                    lastVerifiedAt: now,
                },
            });

        await tx
            .delete(animeEpisode)
            .where(
                and(
                    eq(animeEpisode.anilistId, anime.id),
                    notInArray(
                        animeEpisode.episodeId,
                        source.map(({ id }) => id),
                    ),
                ),
            );

        const stableSince =
            sync?.sourceRevision === revision && sync.stableSince
                ? sync.stableSince
                : now;

        await tx
            .insert(animeEpisodeSync)
            .values({
                anilistId: anime.id,
                mediaStatus: anime.status,
                expectedEpisodes: anime.episodes,
                sourceRevision: revision,
                metadataExternalIdId:
                    resolvedMetadataSource?.externalIdId ??
                    sync?.metadataExternalIdId ??
                    null,
                stableSince,
                lastSuccessAt: now,
                nextRefreshAt: nextRefreshAt(
                    anime,
                    stableSince,
                    refreshMetadataSoon,
                ),
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
                        resolvedMetadataSource?.externalIdId ??
                        sync?.metadataExternalIdId ??
                        null,
                    stableSince,
                    lastSuccessAt: now,
                    nextRefreshAt: nextRefreshAt(
                        anime,
                        stableSince,
                        refreshMetadataSoon,
                    ),
                    failureCount: 0,
                    lastError: null,
                },
            });
    });

    return storedEpisodes(anime);
}

export async function refreshEpisodes(
    anime: AniListAnime,
    metadataSource?: StoredMapping,
) {
    const pending = requests.get(anime.id);
    if (pending) {
        return pending;
    }

    const request = fetchAndStore(anime, metadataSource).catch(
        async (cause) => {
            await recordFailure(anime.id, cause).catch((failure) =>
                console.error(
                    `Could not record episode refresh failure for AniList ${anime.id}`,
                    failure,
                ),
            );
            throw cause;
        },
    );
    requests.set(anime.id, request);

    try {
        return await request;
    } finally {
        requests.delete(anime.id);
    }
}
