import { randomUUID } from 'node:crypto';

import { and, eq, inArray, isNull, lte, or } from 'drizzle-orm';

import { AnimeDocument, AnimeScheduleDocument } from '@arc/shared/anilist/generated/graphql';
import type { AnimeCard } from '@arc/shared/types';
import { db } from '@arc/db';
import { animeEpisodeSync, animeRelease, animeReleaseRequest } from '@arc/db/schema';
import { graphql } from '../../graphql';
import { ensureInternalAnimeId } from '../identity';
import { animeTitles, plainText, present } from './text';
import { anilistRequestPolicy } from './request-policy';
import { AniListAnimeSchema, AniListScheduleSchema, type AniListAnime } from './types';

const releaseSchemaRevision = 1;
const requestLeaseMs = 30_000;
const requestWaitMs = 12_000;
const requests = new Map<number, Promise<AniListAnime>>();
const scheduleRequests = new Map<number, Promise<AniListAnime>>();

function releaseValues(media: AniListAnime, sourceFetchedAt = new Date()) {
    return {
        data: media,
        title: animeTitles(media)[0] ?? `Anime ${media.id}`,
        imageUrl:
            media.coverImage?.extraLarge ?? media.coverImage?.large ?? media.bannerImage ?? null,
        status: media.status,
        format: media.format,
        malId: media.idMal,
        episodeCount: media.episodes,
        durationMinutes: media.duration,
        nextAiringAt: media.nextAiringEpisode
            ? new Date(media.nextAiringEpisode.airingAt * 1_000)
            : null,
        nextAiringEpisode: media.nextAiringEpisode?.episode ?? null,
        schemaRevision: releaseSchemaRevision,
        sourceFetchedAt,
        updatedAt: sourceFetchedAt,
    };
}

export async function storeAnimeRelease(media: AniListAnime, sourceFetchedAt = new Date()) {
    await ensureInternalAnimeId(media.id, animeTitles(media)[0]);
    const values = releaseValues(media, sourceFetchedAt);

    await db
        .insert(animeRelease)
        .values({ anilistId: media.id, ...values })
        .onConflictDoUpdate({
            target: animeRelease.anilistId,
            set: values,
        });
}

async function fetchAnimeRelease(id: number) {
    const response = await anilistRequestPolicy.run(() =>
        graphql('https://graphql.anilist.co', AnimeDocument, { id }, { timeoutMs: 8_000 })
    );
    const parsed = AniListAnimeSchema.safeParse(response.Media);

    if (!parsed.success || parsed.data.id !== id) {
        throw new Error(`AniList returned invalid release metadata for ${id}`, {
            cause: parsed.success ? undefined : parsed.error,
        });
    }

    await storeAnimeRelease(parsed.data);
    return parsed.data;
}

function retryDelay(attempts: number) {
    return Math.min(6 * 60 * 60 * 1_000, 60_000 * 2 ** Math.min(attempts, 8));
}

async function requestWithLease(id: number, force: boolean) {
    const owner = randomUUID();
    const now = new Date();
    await db
        .insert(animeReleaseRequest)
        .values({ anilistId: id, nextAttemptAt: now })
        .onConflictDoNothing();

    if (force) {
        await db
            .update(animeReleaseRequest)
            .set({ nextAttemptAt: now })
            .where(
                and(
                    eq(animeReleaseRequest.anilistId, id),
                    or(
                        isNull(animeReleaseRequest.leaseUntil),
                        lte(animeReleaseRequest.leaseUntil, now)
                    )
                )
            );
    }

    const [claimed] = await db
        .update(animeReleaseRequest)
        .set({
            leaseOwner: owner,
            leaseUntil: new Date(now.getTime() + requestLeaseMs),
            lastError: null,
        })
        .where(
            and(
                eq(animeReleaseRequest.anilistId, id),
                lte(animeReleaseRequest.nextAttemptAt, now),
                or(isNull(animeReleaseRequest.leaseUntil), lte(animeReleaseRequest.leaseUntil, now))
            )
        )
        .returning({ attempts: animeReleaseRequest.attempts });

    if (!claimed) {
        const deadline = Date.now() + requestWaitMs;
        while (Date.now() < deadline) {
            const [release, pending] = await Promise.all([
                storedAnimeRelease(id),
                db
                    .select({
                        leaseUntil: animeReleaseRequest.leaseUntil,
                        nextAttemptAt: animeReleaseRequest.nextAttemptAt,
                        lastError: animeReleaseRequest.lastError,
                    })
                    .from(animeReleaseRequest)
                    .where(eq(animeReleaseRequest.anilistId, id))
                    .limit(1)
                    .then((rows) => rows[0] ?? null),
            ]);
            if (release) {
                return release;
            }
            if (
                pending?.lastError &&
                !pending.leaseUntil &&
                pending.nextAttemptAt.getTime() > Date.now()
            ) {
                throw new Error(pending.lastError);
            }

            await new Promise((resolve) => setTimeout(resolve, 100));
        }

        throw new Error(`AniList release metadata for ${id} is still being fetched`);
    }

    try {
        const media = await fetchAnimeRelease(id);
        await db
            .delete(animeReleaseRequest)
            .where(
                and(
                    eq(animeReleaseRequest.anilistId, id),
                    eq(animeReleaseRequest.leaseOwner, owner)
                )
            );
        return media;
    } catch (cause) {
        const message = cause instanceof Error ? cause.message : `AniList release ${id} failed`;
        await db
            .update(animeReleaseRequest)
            .set({
                attempts: claimed.attempts + 1,
                nextAttemptAt: new Date(Date.now() + retryDelay(claimed.attempts)),
                leaseOwner: null,
                leaseUntil: null,
                lastError: message,
            })
            .where(
                and(
                    eq(animeReleaseRequest.anilistId, id),
                    eq(animeReleaseRequest.leaseOwner, owner)
                )
            );
        throw cause;
    }
}

export function refreshAnimeRelease(id: number, options: { force?: boolean } = {}) {
    const pending = requests.get(id);
    if (pending) {
        return pending;
    }

    const request = requestWithLease(id, options.force ?? false);
    requests.set(id, request);
    const cleanup = () => {
        if (requests.get(id) === request) {
            requests.delete(id);
        }
    };
    void request.then(cleanup, cleanup);
    return request;
}

export async function storedAnimeRelease(id: number) {
    const [row] = await db
        .select({ data: animeRelease.data })
        .from(animeRelease)
        .where(eq(animeRelease.anilistId, id))
        .limit(1);
    if (!row?.data) {
        return null;
    }

    const parsed = AniListAnimeSchema.safeParse(row.data);
    if (parsed.success && parsed.data.id === id) {
        return parsed.data;
    }

    await Promise.all([
        db.update(animeRelease).set({ data: null }).where(eq(animeRelease.anilistId, id)),
        db
            .insert(animeReleaseRequest)
            .values({ anilistId: id, nextAttemptAt: new Date() })
            .onConflictDoNothing(),
    ]);
    return null;
}

export async function getAnimeRelease(id: number) {
    return (await storedAnimeRelease(id)) ?? refreshAnimeRelease(id);
}

async function fetchAnimeSchedule(id: number) {
    const stored = await storedAnimeRelease(id);
    if (!stored) {
        return refreshAnimeRelease(id, { force: true });
    }

    const response = await anilistRequestPolicy.run(() =>
        graphql('https://graphql.anilist.co', AnimeScheduleDocument, { id }, { timeoutMs: 8_000 })
    );
    const schedule = AniListScheduleSchema.safeParse(response.Media);
    if (!schedule.success || schedule.data.id !== id) {
        throw new Error(`AniList returned invalid schedule metadata for ${id}`, {
            cause: schedule.success ? undefined : schedule.error,
        });
    }

    const updated = AniListAnimeSchema.parse({
        ...stored,
        status: schedule.data.status,
        episodes: schedule.data.episodes,
        nextAiringEpisode: schedule.data.nextAiringEpisode,
    });
    await storeAnimeRelease(updated);
    await db
        .insert(animeEpisodeSync)
        .values({
            anilistId: id,
            mediaStatus: updated.status,
            expectedEpisodes: updated.episodes,
            nextAiringAt: updated.nextAiringEpisode
                ? new Date(updated.nextAiringEpisode.airingAt * 1_000)
                : null,
            nextAiringEpisode: updated.nextAiringEpisode?.episode ?? null,
        })
        .onConflictDoUpdate({
            target: animeEpisodeSync.anilistId,
            set: {
                mediaStatus: updated.status,
                expectedEpisodes: updated.episodes,
                nextAiringAt: updated.nextAiringEpisode
                    ? new Date(updated.nextAiringEpisode.airingAt * 1_000)
                    : null,
                nextAiringEpisode: updated.nextAiringEpisode?.episode ?? null,
            },
        });
    return updated;
}

export function refreshAnimeSchedule(id: number) {
    const pending = scheduleRequests.get(id);
    if (pending) {
        return pending;
    }

    const request = fetchAnimeSchedule(id);
    scheduleRequests.set(id, request);
    const cleanup = () => {
        if (scheduleRequests.get(id) === request) {
            scheduleRequests.delete(id);
        }
    };
    void request.then(cleanup, cleanup);
    return request;
}

export async function storedReleaseCards(ids: number[]): Promise<AnimeCard[]> {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) {
        return [];
    }

    const rows = await db
        .select({
            id: animeRelease.anilistId,
            data: animeRelease.data,
            title: animeRelease.title,
            image: animeRelease.imageUrl,
            format: animeRelease.format,
            status: animeRelease.status,
        })
        .from(animeRelease)
        .where(inArray(animeRelease.anilistId, uniqueIds));
    const cards = new Map(
        rows.flatMap((row) => {
            if (!row.image) {
                return [];
            }
            const parsed = row.data ? AniListAnimeSchema.safeParse(row.data) : null;
            const media = parsed?.success ? parsed.data : null;
            const card: AnimeCard = {
                id: row.id,
                href: `/anime/${row.id}`,
                link: `/anime/${row.id}`,
                title: row.title,
                image: row.image,
                audioLabel: '',
                format: row.format,
                status: row.status,
                score: media?.averageScore ?? 0,
                genres: present(media?.genres),
                synopsis: plainText(media?.description),
            };
            return [[row.id, card] as const];
        })
    );

    return uniqueIds.flatMap((id) => {
        const card = cards.get(id);
        return card ? [card] : [];
    });
}
