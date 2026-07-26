import { and, asc, eq, lte, ne, or, sql } from 'drizzle-orm';
import { Effect } from 'effect';
import { createHash } from 'node:crypto';

import { mergeAudio, type AnimeEpisode } from '$lib/anime';
import type { AnimeQuery } from '$lib/graphql/anilist/generated/graphql';
import { db } from '$lib/server/db';
import {
    animeEpisode,
    animeEpisodeSync,
} from '$lib/server/db/schema';
import { allanime, type AllAnimeEpisode } from './allanime';
import { anilist } from './anilist';
import { tmdb } from './tmdb';

type AniListAnime = NonNullable<AnimeQuery['Media']>;
type StoredEpisode = typeof animeEpisode.$inferSelect;

const syncVersion = 1;
const requests = new Map<number, Promise<AnimeEpisode[]>>();

function duration(minutes: number | null | undefined) {
    if (!minutes || minutes <= 0) return '';

    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;

    if (!hours) return `${remainder}m`;
    if (!remainder) return `${hours}h`;
    return `${hours}h, ${remainder}m`;
}

function episodeModel(
    episode: StoredEpisode,
    fallbackDuration: number | null | undefined,
): AnimeEpisode {
    const title =
        episode.metadataTitle ||
        episode.providerTitle ||
        `Episode ${episode.episodeId}`;

    return {
        id: episode.episodeId,
        number: episode.number,
        label: `E${Number.isInteger(episode.number) ? episode.number : episode.episodeId}`,
        title,
        href: `/anime/${episode.anilistId}/watch/${encodeURIComponent(episode.episodeId)}`,
        audio: episode.audio,
        imageUrl: episode.imageUrl,
        duration: duration(episode.runtimeMinutes ?? fallbackDuration),
        airDate: episode.airDate ?? '',
        overview: episode.overview ?? '',
    };
}

async function storedEpisodes(anime: AniListAnime) {
    const rows = await db
        .select()
        .from(animeEpisode)
        .where(eq(animeEpisode.anilistId, anime.id))
        .orderBy(asc(animeEpisode.number));

    return rows.map((episode) => episodeModel(episode, anime.duration));
}

function sourceRevision(episodes: AllAnimeEpisode[]) {
    return createHash('sha256')
        .update(
            JSON.stringify(
                episodes.map(({ id, number, title, audio }) => ({
                    id,
                    number,
                    title,
                    audio: audio.toSorted(),
                })),
            ),
        )
        .digest('hex');
}

function nextRefreshAt(anime: AniListAnime, stableSince: Date) {
    const now = Date.now();
    const after = (milliseconds: number) => new Date(now + milliseconds);
    const nextAiringAt = anime.nextAiringEpisode?.airingAt
        ? anime.nextAiringEpisode.airingAt * 1_000 + 15 * 60 * 1_000
        : null;

    switch (anime.status) {
        case 'RELEASING':
            return new Date(
                Math.min(nextAiringAt ?? Infinity, now + 6 * 60 * 60 * 1_000),
            );
        case 'FINISHED': {
            const stableFor = now - stableSince.getTime();
            if (stableFor >= 30 * 24 * 60 * 60 * 1_000) return null;
            if (stableFor >= 7 * 24 * 60 * 60 * 1_000) {
                return after(7 * 24 * 60 * 60 * 1_000);
            }
            return after(24 * 60 * 60 * 1_000);
        }
        case 'CANCELLED':
            return now - stableSince.getTime() >= 7 * 24 * 60 * 60 * 1_000
                ? null
                : after(7 * 24 * 60 * 60 * 1_000);
        case 'HIATUS':
            return after(7 * 24 * 60 * 60 * 1_000);
        case 'NOT_YET_RELEASED':
            return nextAiringAt
                ? new Date(Math.min(nextAiringAt, now + 24 * 60 * 60 * 1_000))
                : after(24 * 60 * 60 * 1_000);
        default:
            return after(6 * 60 * 60 * 1_000);
    }
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
    const source = await allanime.getEpisodes(anime);
    if (!source.length) {
        throw new Error(
            `AllAnime returned an empty episode inventory for AniList ${anime.id}`,
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
                    ? mergeAudio(previous?.audio, episode.audio)
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
                target: [animeEpisode.anilistId, animeEpisode.episodeId],
                set: {
                    number: sql.raw(`excluded.${animeEpisode.number.name}`),
                    providerTitle: sql.raw(
                        `excluded.${animeEpisode.providerTitle.name}`,
                    ),
                    metadataTitle: sql.raw(
                        `excluded.${animeEpisode.metadataTitle.name}`,
                    ),
                    audio: sql.raw(`excluded.${animeEpisode.audio.name}`),
                    imageUrl: sql.raw(`excluded.${animeEpisode.imageUrl.name}`),
                    runtimeMinutes: sql.raw(
                        `excluded.${animeEpisode.runtimeMinutes.name}`,
                    ),
                    airDate: sql.raw(`excluded.${animeEpisode.airDate.name}`),
                    overview: sql.raw(`excluded.${animeEpisode.overview.name}`),
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

async function refreshEpisodes(anime: AniListAnime) {
    const pending = requests.get(anime.id);
    if (pending) return pending;

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

async function getEpisodes(anime: AniListAnime): Promise<AnimeEpisode[]> {
    const [stored, sync] = await Promise.all([
        storedEpisodes(anime),
        db
            .select({
                version: animeEpisodeSync.version,
                nextRefreshAt: animeEpisodeSync.nextRefreshAt,
                lastError: animeEpisodeSync.lastError,
            })
            .from(animeEpisodeSync)
            .where(eq(animeEpisodeSync.anilistId, anime.id))
            .limit(1)
            .then((rows) => rows[0] ?? null),
    ]);

    if (!stored.length) {
        if (
            sync?.lastError &&
            sync.nextRefreshAt &&
            sync.nextRefreshAt.getTime() > Date.now()
        ) {
            throw new Error(sync.lastError);
        }

        return refreshEpisodes(anime);
    }

    const refreshDue =
        !sync ||
        sync.version !== syncVersion ||
        (sync.nextRefreshAt !== null &&
            sync.nextRefreshAt.getTime() <= Date.now());

    if (refreshDue) {
        void refreshEpisodes(anime).catch((cause) =>
            console.error(
                `Episode refresh failed for AniList ${anime.id}`,
                cause,
            ),
        );
    }

    return stored;
}

async function refreshDue(limit = 20) {
    const due = await db
        .select({ anilistId: animeEpisodeSync.anilistId })
        .from(animeEpisodeSync)
        .where(
            or(
                ne(animeEpisodeSync.version, syncVersion),
                and(
                    eq(animeEpisodeSync.version, syncVersion),
                    lte(animeEpisodeSync.nextRefreshAt, new Date()),
                ),
            ),
        )
        .limit(Math.max(1, Math.min(limit, 100)));
    const results = [];

    for (const { anilistId } of due) {
        try {
            const animeData = await Effect.runPromise(
                anilist.getAnime(anilistId),
            );
            const episodes = await refreshEpisodes(animeData);
            results.push({ anilistId, episodes: episodes.length, ok: true });
        } catch (cause) {
            results.push({
                anilistId,
                error:
                    cause instanceof Error ? cause.message : 'Refresh failed',
                ok: false,
            });
        }
    }

    return results;
}

export const episodes = { getEpisodes, refreshDue, refreshEpisodes };
