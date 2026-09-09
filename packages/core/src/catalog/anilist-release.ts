import { createHash, randomUUID } from 'node:crypto';

import { and, desc, eq, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';

import {
    AnimeDocument,
    AnimeOverviewDocument,
    AnimeScheduleDocument,
    WatchlistAnimeDocument,
} from '@arc/shared/graphql/generated/graphql';
import { db } from '@arc/shared/db';
import {
    anime,
    animeEpisodeSync,
    animeRelation,
    animeRelease,
    animeReleaseRequest,
    providerSnapshot,
} from '@arc/shared/db/schema';
import { ensureInternalAnimeId, findInternalAnimeId } from './identity';
import { animeTitles } from './anilist-text';
import {
    AniListAnimeOverviewSchema,
    AniListAnimeSchema,
    AniListScheduleSchema,
    type AniListAnime,
    type AniListAnimeOverview,
} from './anilist-types';
import { request } from './anilist-client';
import { mergeAnimeReleaseSnapshots, relationSnapshotProvider } from './anime-release-merge';

const animeMetadataDomain = 'anime_metadata';

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
        schemaRevision: 1,
        sourceFetchedAt,
        updatedAt: sourceFetchedAt,
    };
}

export async function storeAnimeRelease(media: AniListAnime, sourceFetchedAt = new Date()) {
    const sourceAnimeId = await ensureInternalAnimeId(media.id, animeTitles(media)[0]);
    const source = media.metadataSource ?? 'anilist';
    const sourceMediaId = String(media.metadataSourceId ?? media.id);
    const payloadHash = createHash('sha256').update(JSON.stringify(media)).digest('hex');
    const { effective, effectiveFetchedAt, relationProvider, updateRelations } =
        await db.transaction(async (tx) => {
            await tx
                .select({ id: anime.id })
                .from(anime)
                .where(eq(anime.id, sourceAnimeId))
                .for('update');
            const [stored] = await tx
                .select({ data: animeRelease.data })
                .from(animeRelease)
                .where(eq(animeRelease.anilistId, media.id))
                .limit(1);
            const existingSources = await tx
                .select({ provider: providerSnapshot.provider })
                .from(providerSnapshot)
                .where(
                    and(
                        eq(providerSnapshot.canonicalAnimeId, sourceAnimeId),
                        eq(providerSnapshot.domain, animeMetadataDomain),
                        eq(providerSnapshot.subjectType, 'anime')
                    )
                );

            const storedMedia = stored ? AniListAnimeSchema.safeParse(stored.data) : null;
            if (
                storedMedia?.success &&
                storedMedia.data.id === media.id &&
                !existingSources.some(
                    ({ provider }) => provider === (storedMedia.data.metadataSource ?? 'anilist')
                )
            ) {
                const storedProvider = storedMedia.data.metadataSource ?? 'anilist';
                await tx
                    .insert(providerSnapshot)
                    .values({
                        provider: storedProvider,
                        domain: animeMetadataDomain,
                        subjectType: 'anime',
                        subjectId: String(storedMedia.data.metadataSourceId ?? storedMedia.data.id),
                        canonicalAnimeId: sourceAnimeId,
                        payload: storedMedia.data,
                        payloadHash: createHash('sha256')
                            .update(JSON.stringify(storedMedia.data))
                            .digest('hex'),
                        firstSeenAt: new Date(),
                        sourceFetchedAt,
                        updatedAt: sourceFetchedAt,
                    })
                    .onConflictDoNothing();
            }

            await tx
                .insert(providerSnapshot)
                .values({
                    provider: source,
                    domain: animeMetadataDomain,
                    subjectType: 'anime',
                    subjectId: sourceMediaId,
                    canonicalAnimeId: sourceAnimeId,
                    payload: media,
                    payloadHash,
                    firstSeenAt: sourceFetchedAt,
                    sourceFetchedAt,
                    updatedAt: sourceFetchedAt,
                })
                .onConflictDoUpdate({
                    target: [
                        providerSnapshot.provider,
                        providerSnapshot.domain,
                        providerSnapshot.subjectType,
                        providerSnapshot.subjectId,
                        providerSnapshot.variant,
                    ],
                    set: {
                        canonicalAnimeId: sourceAnimeId,
                        payload: media,
                        payloadHash,
                        sourceFetchedAt,
                        updatedAt: sourceFetchedAt,
                    },
                });

            const sources = await tx
                .select({
                    provider: providerSnapshot.provider,
                    payload: providerSnapshot.payload,
                    sourceFetchedAt: providerSnapshot.sourceFetchedAt,
                })
                .from(providerSnapshot)
                .where(
                    and(
                        eq(providerSnapshot.canonicalAnimeId, sourceAnimeId),
                        eq(providerSnapshot.domain, animeMetadataDomain),
                        eq(providerSnapshot.subjectType, 'anime')
                    )
                );
            const releaseSnapshots = sources.flatMap((snapshot) => {
                const parsed = AniListAnimeSchema.safeParse(snapshot.payload);
                return parsed.success ? [{ ...snapshot, data: parsed.data }] : [];
            });
            const merged = mergeAnimeReleaseSnapshots(releaseSnapshots);
            if (!merged || merged.id !== media.id) {
                throw new Error(`Stored anime metadata is invalid for ${media.id}`);
            }
            if (source === 'kitsu' && stored?.data && !storedMedia?.success) {
                return {
                    effective: media,
                    effectiveFetchedAt: sourceFetchedAt,
                    relationProvider: null,
                    updateRelations: false,
                };
            }
            const effectiveFetchedAt = new Date(
                Math.max(
                    ...releaseSnapshots.map(({ sourceFetchedAt: fetchedAt }) => fetchedAt.getTime())
                )
            );

            await tx
                .insert(animeRelease)
                .values({ anilistId: media.id, ...releaseValues(merged, effectiveFetchedAt) })
                .onConflictDoUpdate({
                    target: animeRelease.anilistId,
                    set: releaseValues(merged, effectiveFetchedAt),
                    setWhere:
                        merged.metadataSource === 'kitsu'
                            ? or(
                                  and(
                                      isNull(animeRelease.data),
                                      isNull(animeRelease.imageUrl),
                                      isNull(animeRelease.status),
                                      isNull(animeRelease.format),
                                      isNull(animeRelease.malId),
                                      isNull(animeRelease.episodeCount),
                                      isNull(animeRelease.durationMinutes),
                                      isNull(animeRelease.nextAiringAt),
                                      isNull(animeRelease.nextAiringEpisode)
                                  ),
                                  sql`${animeRelease.data}->>'metadataSource' = 'kitsu'`
                              )
                            : undefined,
                });

            return {
                effective: merged,
                effectiveFetchedAt,
                relationProvider: relationSnapshotProvider(releaseSnapshots),
                updateRelations: true,
            };
        });

    if (!updateRelations) return effective;
    const relations: Array<typeof animeRelation.$inferInsert> = [];
    for (const edge of effective.relations?.edges ?? []) {
        if (!edge?.relationType || edge.node?.type !== 'ANIME') continue;

        const targetAnimeId = await ensureInternalAnimeId(edge.node.id, animeTitles(edge.node)[0]);
        relations.push({
            sourceAnimeId,
            targetAnimeId,
            relationType: edge.relationType,
            source: relationProvider ?? 'anilist',
            verifiedAt: effectiveFetchedAt,
            updatedAt: effectiveFetchedAt,
        });
    }

    await db.transaction(async (tx) => {
        await tx.delete(animeRelation).where(eq(animeRelation.sourceAnimeId, sourceAnimeId));
        if (relations.length) {
            await tx.insert(animeRelation).values(relations).onConflictDoNothing();
        }
    });

    return effective;
}

export async function hydrateAnimeReleases(anilistIds: number[]) {
    const ids = [...new Set(anilistIds)].filter((id) => Number.isSafeInteger(id) && id > 0);
    const stored: number[] = [];

    for (let index = 0; index < ids.length; index += 50) {
        const response = await request(WatchlistAnimeDocument, {
            ids: ids.slice(index, index + 50),
        });
        const media = (response.Page?.media ?? []).flatMap((entry) => {
            const parsed = AniListAnimeSchema.safeParse(entry);
            return parsed.success ? [parsed.data] : [];
        });

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
    const response = await request(AnimeDocument, { id }, { forceRefresh: true });
    const parsed = AniListAnimeSchema.safeParse(response.Media);

    if (!parsed.success || parsed.data.id !== id) {
        throw new Error(`AniList returned invalid release metadata for ${id}`, {
            cause: parsed.success ? undefined : parsed.error,
        });
    }

    return storeAnimeRelease(parsed.data);
}

export async function getAnimeOverview(id: number): Promise<AniListAnimeOverview> {
    const response = await request(AnimeOverviewDocument, { id }, { forceRefresh: true });
    const parsed = AniListAnimeOverviewSchema.safeParse(response.Media);

    if (!parsed.success || parsed.data.id !== id) {
        throw new Error(`AniList returned invalid overview metadata for ${id}`, {
            cause: parsed.success ? undefined : parsed.error,
        });
    }

    return parsed.data;
}

export async function refreshAnimeRelease(id: number, options: { force?: boolean } = {}) {
    const owner = randomUUID();
    const now = new Date();
    await db
        .insert(animeReleaseRequest)
        .values({ anilistId: id, nextAttemptAt: now })
        .onConflictDoNothing();

    if (options.force) {
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
    const deadline = Date.now() + 30_000 + 12_000;
    while (!claimed && Date.now() < deadline) {
        const claimNow = new Date();
        [claimed] = await db
            .update(animeReleaseRequest)
            .set({
                leaseOwner: owner,
                leaseUntil: new Date(claimNow.getTime() + 30_000),
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
                nextAttemptAt: new Date(
                    Date.now() +
                        (media.metadataSource === 'kitsu' ? 5 * 60 * 1_000 : 24 * 60 * 60 * 1_000)
                ),
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
                nextAttemptAt: new Date(
                    Date.now() +
                        Math.min(6 * 60 * 60 * 1_000, 60_000 * 2 ** Math.min(claimed.attempts, 8))
                ),
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

async function storedAnimeReleaseSource(id: number, provider: string) {
    const internalAnimeId = await findInternalAnimeId(id);
    if (!internalAnimeId) return null;

    const [row] = await db
        .select({
            payload: providerSnapshot.payload,
            sourceFetchedAt: providerSnapshot.sourceFetchedAt,
        })
        .from(providerSnapshot)
        .where(
            and(
                eq(providerSnapshot.canonicalAnimeId, internalAnimeId),
                eq(providerSnapshot.domain, animeMetadataDomain),
                eq(providerSnapshot.subjectType, 'anime'),
                eq(providerSnapshot.provider, provider)
            )
        )
        .orderBy(desc(providerSnapshot.sourceFetchedAt))
        .limit(1);
    const parsed = row ? AniListAnimeSchema.safeParse(row.payload) : null;
    return parsed?.success && parsed.data.id === id ? parsed.data : null;
}

export async function getAnimeRelease(id: number) {
    const stored = await storedAnimeRelease(id);
    return stored ?? refreshAnimeRelease(id, { force: true });
}

export async function refreshAnimeSchedule(id: number) {
    const stored = await storedAnimeRelease(id);
    if (!stored || stored.metadataSource) {
        return refreshAnimeRelease(id, { force: true });
    }

    const response = await request(AnimeScheduleDocument, { id }, { forceRefresh: true });
    const schedule = AniListScheduleSchema.safeParse(response.Media);
    if (!schedule.success || schedule.data.id !== id) {
        throw new Error(`AniList returned invalid schedule metadata for ${id}`, {
            cause: schedule.success ? undefined : schedule.error,
        });
    }

    const authoritative = (await storedAnimeReleaseSource(id, 'anilist')) ?? stored;
    const updated = AniListAnimeSchema.parse({
        ...authoritative,
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
