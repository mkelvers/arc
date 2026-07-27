import { eq, sql } from 'drizzle-orm';

import { mergeAudioModes } from '$lib/anime/audio';
import type { AnimeEpisode } from '$lib/anime/types';
import { db } from '$lib/server/db';
import {
    animeEpisode,
    animeEpisodeSync,
} from '$lib/server/db/schema';
import { playback } from '../providers';
import { tmdb } from '../tmdb';
import { sourceRevision, storedEpisodes } from './model';
import { nextRefreshAt, syncVersion } from './policy';
import type { AniListAnime } from './types';

const requests = new Map<number, Promise<AnimeEpisode[]>>();

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
            version: syncVersion,
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

async function fetchAndStore(anime: AniListAnime) {
    const source = await playback.getEpisodes(anime);
    if (!source.length) {
        throw new Error(
            `No playback provider returned episodes for AniList ${anime.id}`,
        );
    }

    const metadata = await tmdb
        .getEpisodeMetadata(anime, source)
        .catch((cause) => {
            console.error(
                `TMDB episode enrichment failed for AniList ${anime.id}`,
                cause,
            );
            return null;
        });
    const now = new Date();
    const revision = sourceRevision(source);

    await db.transaction(async (tx) => {
        const [sync, existing] = await Promise.all([
            tx
                .select({
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

            return {
                anilistId: anime.id,
                episodeId: episode.id,
                number: episode.number,
                providerTitle:
                    episode.title || previous?.providerTitle || null,
                metadataTitle:
                    media?.title || previous?.metadataTitle || null,
                audio: sync?.sourceRevision
                    ? mergeAudioModes(previous?.audio, episode.audio)
                    : episode.audio,
                imageUrl: media?.imageUrl ?? previous?.imageUrl ?? null,
                runtimeMinutes:
                    media?.runtime ?? previous?.runtimeMinutes ?? null,
                airDate: media?.airDate || previous?.airDate || null,
                overview: media?.overview || previous?.overview || null,
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
                    lastSeenAt: now,
                    lastVerifiedAt: now,
                },
            });

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
                stableSince,
                lastSuccessAt: now,
                nextRefreshAt: nextRefreshAt(anime, stableSince),
                failureCount: 0,
                lastError: null,
                version: syncVersion,
            })
            .onConflictDoUpdate({
                target: animeEpisodeSync.anilistId,
                set: {
                    mediaStatus: anime.status,
                    expectedEpisodes: anime.episodes,
                    sourceRevision: revision,
                    stableSince,
                    lastSuccessAt: now,
                    nextRefreshAt: nextRefreshAt(anime, stableSince),
                    failureCount: 0,
                    lastError: null,
                    version: syncVersion,
                },
            });
    });

    return storedEpisodes(anime);
}

export async function refreshEpisodes(anime: AniListAnime) {
    const pending = requests.get(anime.id);
    if (pending) {
        return pending;
    }

    const request = fetchAndStore(anime).catch(async (cause) => {
        await recordFailure(anime.id, cause).catch((failure) =>
            console.error(
                `Could not record episode refresh failure for AniList ${anime.id}`,
                failure,
            ),
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
