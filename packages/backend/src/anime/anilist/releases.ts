import { randomUUID } from 'node:crypto';

import { and, eq, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm';

import {
    AnimeOverviewDocument,
    AnimeDocument,
    AnimeScheduleDocument,
    WatchlistAnimeDocument,
} from '@arc/shared/anilist/generated/graphql';
import type { AnimeCard } from '@arc/shared/types';
import { db } from '@arc/db';
import { animeEpisodeSync, animeRelation, animeRelease, animeReleaseRequest } from '@arc/db/schema';
import { graphql } from '../../graphql';
import { ensureInternalAnimeId } from '@arc/core/catalog/identity';
import { animeTitles, plainText } from '@arc/core/catalog/anilist-text';
import { request as requestAniList } from './client';
import { coordinatedAniListRequest } from '@arc/core/catalog/anilist-lease';
import {
    AniListAnimeOverviewSchema,
    AniListAnimeSchema,
    AniListScheduleSchema,
    type AniListAnime,
    type AniListAnimeOverview,
} from './types';
import { batches } from '../../utils';

const releaseSchemaRevision = 1;
const requestLeaseMs = 30_000;

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
    const sourceAnimeId = await ensureInternalAnimeId(media.id, animeTitles(media)[0]);
    const values = releaseValues(media, sourceFetchedAt);

    await db
        .insert(animeRelease)
        .values({ anilistId: media.id, ...values })
        .onConflictDoUpdate({
            target: animeRelease.anilistId,
            set: values,
        });

    const relations: Array<typeof animeRelation.$inferInsert> = [];
    for (const edge of media.relations?.edges ?? []) {
        if (!edge?.relationType || edge.node?.type !== 'ANIME') {
            continue;
        }

        const targetAnimeId = await ensureInternalAnimeId(edge.node.id, animeTitles(edge.node)[0]);
        relations.push({
            sourceAnimeId,
            targetAnimeId,
            relationType: edge.relationType,
            source: 'anilist',
            verifiedAt: sourceFetchedAt,
            updatedAt: sourceFetchedAt,
        });
    }

    await db.transaction(async (tx) => {
        await tx.delete(animeRelation).where(eq(animeRelation.sourceAnimeId, sourceAnimeId));
        if (relations.length) {
            await tx.insert(animeRelation).values(relations).onConflictDoNothing();
        }
    });
}

export async function hydrateAnimeReleases(anilistIds: number[]) {
    const ids = [...new Set(anilistIds)].filter((id) => Number.isSafeInteger(id) && id > 0);
    const stored: number[] = [];

    for (const batch of batches(ids, 50)) {
        const response = await requestAniList(WatchlistAnimeDocument, { ids: batch });
        const media = (response.Page?.media?.filter((value) => value !== null) ?? []).flatMap(
            (entry) => {
                const parsed = AniListAnimeSchema.safeParse(entry);
                return parsed.success ? [parsed.data] : [];
            }
        );

        for (const anime of media) {
            await storeAnimeRelease(anime);
            stored.push(anime.id);
        }
    }

    return stored;
}

export async function hydrateMissingAnimeReleases(anilistIds: number[]) {
    const ids = [...new Set(anilistIds)].filter((id) => Number.isSafeInteger(id) && id > 0);
    if (!ids.length) {
        return [];
    }

    const existing = await db
        .select({ anilistId: animeRelease.anilistId })
        .from(animeRelease)
        .where(and(inArray(animeRelease.anilistId, ids), isNotNull(animeRelease.data)));
    const existingIds = new Set(existing.map(({ anilistId }) => anilistId));
    return hydrateAnimeReleases(ids.filter((id) => !existingIds.has(id)));
}

async function fetchAnimeRelease(id: number) {
    const response = await coordinatedAniListRequest('Anime', () =>
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

export async function getAnimeOverview(id: number): Promise<AniListAnimeOverview> {
    const response = await coordinatedAniListRequest('AnimeOverview', () =>
        graphql('https://graphql.anilist.co', AnimeOverviewDocument, { id }, { timeoutMs: 8_000 })
    );
    const parsed = AniListAnimeOverviewSchema.safeParse(response.Media);

    if (!parsed.success || parsed.data.id !== id) {
        throw new Error(`AniList returned invalid overview metadata for ${id}`, {
            cause: parsed.success ? undefined : parsed.error,
        });
    }

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

    let claimed: { attempts: number } | undefined;
    const deadline = Date.now() + requestLeaseMs + 12_000;
    while (!claimed && Date.now() < deadline) {
        const claimNow = new Date();
        [claimed] = await db
            .update(animeReleaseRequest)
            .set({
                leaseOwner: owner,
                leaseUntil: new Date(claimNow.getTime() + requestLeaseMs),
                lastError: null,
            })
            .where(
                and(
                    eq(animeReleaseRequest.anilistId, id),
                    lte(animeReleaseRequest.nextAttemptAt, claimNow),
                    or(
                        isNull(animeReleaseRequest.leaseUntil),
                        lte(animeReleaseRequest.leaseUntil, claimNow)
                    )
                )
            )
            .returning({ attempts: animeReleaseRequest.attempts });

        if (claimed) {
            break;
        }

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

        const retryAt = Math.min(
            pending?.leaseUntil?.getTime() ?? Number.POSITIVE_INFINITY,
            deadline
        );
        await new Promise((resolve) =>
            setTimeout(resolve, Math.max(25, Math.min(1_000, retryAt - Date.now())))
        );
    }

    if (!claimed) {
        throw new Error(`AniList release metadata for ${id} is still being fetched`);
    }

    try {
        const media = await fetchAnimeRelease(id);
        await db
            .update(animeReleaseRequest)
            .set({
                nextAttemptAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
                leaseOwner: null,
                leaseUntil: null,
                lastError: null,
            })
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
    return requestWithLease(id, options.force ?? false);
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
    return (await storedAnimeRelease(id)) ?? refreshAnimeRelease(id, { force: true });
}

export async function refreshAnimeSchedule(id: number) {
    const stored = await storedAnimeRelease(id);
    if (!stored) {
        return refreshAnimeRelease(id, { force: true });
    }

    const response = await coordinatedAniListRequest('AnimeSchedule', () =>
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
            const parsed = row.data ? AniListAnimeSchema.safeParse(row.data) : null;
            const media = parsed?.success ? parsed.data : null;
            const image =
                row.image ?? media?.coverImage?.extraLarge ?? media?.coverImage?.large ?? null;
            if (!image) {
                return [];
            }
            const card: AnimeCard = {
                id: row.id,
                href: `/anime/${row.id}`,
                link: `/anime/${row.id}`,
                title: row.title,
                image,
                audioLabel: '',
                format: row.format,
                status: row.status,
                score: media?.averageScore ?? 0,
                genres: media?.genres?.filter((genre) => genre !== null) ?? [],
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
