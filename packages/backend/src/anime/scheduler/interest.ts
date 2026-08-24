import { and, eq, inArray, isNull } from 'drizzle-orm';

import type { MediaRelation } from '@arc/shared/anilist/generated/graphql';
import { db } from '@arc/db';
import {
    animeExternalId,
    animeExternalIdLink,
    animeInterestDirty,
    animeRelease,
    animeReleaseInterest,
    animeReleaseRequest,
    playbackProgress,
    watchlist,
} from '@arc/db/schema';
import { animeTitles, present } from '../anilist/text';
import { AniListAnimeSchema, type AniListAnime } from '../anilist/types';
import { primaryFranchiseIds, type FranchiseSelectionEntry } from '../franchise/selection';
import { retireUninterestedTargets, scheduleInterestedTargets } from './targets';
import { interestWatchlistStates } from './interest-policy';

const continuityRelations = new Set<MediaRelation>(['PREQUEL', 'SEQUEL']);

async function requestMissingRelease(anilistId: number) {
    await db
        .insert(animeReleaseRequest)
        .values({ anilistId, nextAttemptAt: new Date() })
        .onConflictDoNothing();
}

function selectionEntry(media: AniListAnime): FranchiseSelectionEntry {
    return {
        malId: media.id,
        title: animeTitles(media)[0] ?? `Anime ${media.id}`,
        format: media.format,
        status: media.status,
        episodes: media.episodes,
        duration: media.duration,
        popularity: media.popularity,
        secondary: false,
        relations: present(media.relations?.edges).flatMap((edge) =>
            edge.relationType && edge.node?.type === 'ANIME'
                ? [{ type: edge.relationType, malId: edge.node.id }]
                : []
        ),
    };
}

async function trackedContinuity(sourceAnilistId: number) {
    const pending = [sourceAnilistId];
    const visited = new Set<number>();
    const releases = new Map<number, AniListAnime>();
    let complete = true;

    while (pending.length) {
        const batch = pending.splice(0, 50).filter((id) => !visited.has(id));
        if (!batch.length) {
            continue;
        }
        batch.forEach((id) => visited.add(id));
        const rows = await db
            .select({ anilistId: animeRelease.anilistId, data: animeRelease.data })
            .from(animeRelease)
            .where(inArray(animeRelease.anilistId, batch));
        const byId = new Map(rows.map((row) => [row.anilistId, row.data]));

        for (const id of batch) {
            const parsed = AniListAnimeSchema.safeParse(byId.get(id));
            if (!parsed.success || parsed.data.id !== id) {
                complete = false;
                await requestMissingRelease(id);
                continue;
            }

            releases.set(id, parsed.data);
            for (const edge of present(parsed.data.relations?.edges)) {
                if (
                    edge.relationType &&
                    continuityRelations.has(edge.relationType) &&
                    edge.node?.type === 'ANIME' &&
                    !visited.has(edge.node.id)
                ) {
                    pending.push(edge.node.id);
                }
            }
        }
    }

    if (!releases.has(sourceAnilistId)) {
        return { ids: [], complete: false };
    }

    const entries = [...releases.values()].map(selectionEntry);
    const primaryIds = primaryFranchiseIds(entries);
    return {
        ids: entries.flatMap((entry) =>
            primaryIds.has(entry.malId) &&
            (entry.status === 'RELEASING' || entry.status === 'NOT_YET_RELEASED')
                ? [entry.malId]
                : []
        ),
        complete,
    };
}

async function directAnilistId(animeId: number) {
    return db
        .select({ anilistId: animeExternalId.externalId })
        .from(animeExternalIdLink)
        .innerJoin(animeExternalId, eq(animeExternalId.id, animeExternalIdLink.externalIdId))
        .where(
            and(
                eq(animeExternalIdLink.animeId, animeId),
                eq(animeExternalId.provider, 'anilist'),
                eq(animeExternalId.mediaType, 'anime')
            )
        )
        .limit(1)
        .then((rows) => rows[0]?.anilistId ?? null);
}

export async function reconcileInterestSubject(userId: string, animeId: number) {
    const [anilistId, [watchlistEntry], [progressEntry], previous] = await Promise.all([
        directAnilistId(animeId),
        db
            .select({ state: watchlist.state })
            .from(watchlist)
            .where(
                and(
                    eq(watchlist.userId, userId),
                    eq(watchlist.animeId, animeId),
                    inArray(watchlist.state, interestWatchlistStates)
                )
            )
            .limit(1),
        db
            .select({ id: playbackProgress.id })
            .from(playbackProgress)
            .where(
                and(
                    eq(playbackProgress.userId, userId),
                    eq(playbackProgress.animeId, animeId),
                    isNull(playbackProgress.dismissedAt)
                )
            )
            .limit(1),
        db
            .select({ trackedAnilistId: animeReleaseInterest.trackedAnilistId })
            .from(animeReleaseInterest)
            .where(
                and(
                    eq(animeReleaseInterest.userId, userId),
                    eq(animeReleaseInterest.sourceAnimeId, animeId)
                )
            ),
    ]);
    const activeSources = [
        ...(watchlistEntry ? (['watchlist'] as const) : []),
        ...(progressEntry ? (['continue_watching'] as const) : []),
    ];
    const inactiveSources = (['watchlist', 'continue_watching'] as const).filter(
        (source) => !activeSources.includes(source)
    );

    if (inactiveSources.length) {
        await db
            .delete(animeReleaseInterest)
            .where(
                and(
                    eq(animeReleaseInterest.userId, userId),
                    eq(animeReleaseInterest.sourceAnimeId, animeId),
                    inArray(animeReleaseInterest.source, inactiveSources)
                )
            );
    }

    if (!anilistId || !activeSources.length) {
        await retireUninterestedTargets();
        return;
    }

    const tracked = await trackedContinuity(anilistId);
    await db.transaction(async (tx) => {
        for (const source of activeSources) {
            if (tracked.complete) {
                await tx
                    .delete(animeReleaseInterest)
                    .where(
                        and(
                            eq(animeReleaseInterest.userId, userId),
                            eq(animeReleaseInterest.source, source),
                            eq(animeReleaseInterest.sourceAnimeId, animeId)
                        )
                    );
            }
            if (tracked.ids.length) {
                await tx
                    .insert(animeReleaseInterest)
                    .values(
                        tracked.ids.map((trackedAnilistId) => ({
                            userId,
                            source,
                            sourceAnimeId: animeId,
                            trackedAnilistId,
                        }))
                    )
                    .onConflictDoNothing();
            }
        }
    });

    await scheduleInterestedTargets([
        ...new Set([...previous.map((row) => row.trackedAnilistId), ...tracked.ids]),
    ]);
    await retireUninterestedTargets();
}

export async function reconcileDirtyInterest(limit = 25) {
    const rows = await db
        .select({
            userId: animeInterestDirty.userId,
            animeId: animeInterestDirty.animeId,
            dirtyAt: animeInterestDirty.dirtyAt,
        })
        .from(animeInterestDirty)
        .orderBy(animeInterestDirty.dirtyAt)
        .limit(limit);

    for (const row of rows) {
        await reconcileInterestSubject(row.userId, row.animeId);
        await db
            .delete(animeInterestDirty)
            .where(
                and(
                    eq(animeInterestDirty.userId, row.userId),
                    eq(animeInterestDirty.animeId, row.animeId),
                    eq(animeInterestDirty.dirtyAt, row.dirtyAt)
                )
            );
    }

    return rows.length;
}

export async function markAllInterestDirty() {
    const subjects = await db
        .select({ userId: watchlist.userId, animeId: watchlist.animeId })
        .from(watchlist)
        .where(inArray(watchlist.state, interestWatchlistStates))
        .union(
            db
                .select({ userId: playbackProgress.userId, animeId: playbackProgress.animeId })
                .from(playbackProgress)
                .where(isNull(playbackProgress.dismissedAt))
        )
        .union(
            db
                .select({
                    userId: animeReleaseInterest.userId,
                    animeId: animeReleaseInterest.sourceAnimeId,
                })
                .from(animeReleaseInterest)
        );

    if (subjects.length) {
        const dirtyAt = new Date();
        await db
            .insert(animeInterestDirty)
            .values(subjects.map((subject) => ({ ...subject, dirtyAt })))
            .onConflictDoUpdate({
                target: [animeInterestDirty.userId, animeInterestDirty.animeId],
                set: { dirtyAt },
            });
    }

    return subjects.length;
}

export async function markInterestDirtyForAnilistIds(anilistIds: number[]) {
    const ids = [...new Set(anilistIds)];
    if (!ids.length) {
        return 0;
    }
    const animeIds = await db
        .select({ animeId: animeExternalIdLink.animeId })
        .from(animeExternalId)
        .innerJoin(animeExternalIdLink, eq(animeExternalIdLink.externalIdId, animeExternalId.id))
        .where(
            and(
                eq(animeExternalId.provider, 'anilist'),
                eq(animeExternalId.mediaType, 'anime'),
                inArray(animeExternalId.externalId, ids)
            )
        );
    const internalIds = animeIds.map(({ animeId }) => animeId);
    if (!internalIds.length) {
        return 0;
    }
    const subjects = await db
        .select({ userId: watchlist.userId, animeId: watchlist.animeId })
        .from(watchlist)
        .where(
            and(
                inArray(watchlist.animeId, internalIds),
                inArray(watchlist.state, interestWatchlistStates)
            )
        )
        .union(
            db
                .select({ userId: playbackProgress.userId, animeId: playbackProgress.animeId })
                .from(playbackProgress)
                .where(
                    and(
                        inArray(playbackProgress.animeId, internalIds),
                        isNull(playbackProgress.dismissedAt)
                    )
                )
        );
    if (subjects.length) {
        const dirtyAt = new Date();
        await db
            .insert(animeInterestDirty)
            .values(subjects.map((subject) => ({ ...subject, dirtyAt })))
            .onConflictDoUpdate({
                target: [animeInterestDirty.userId, animeInterestDirty.animeId],
                set: { dirtyAt },
            });
    }
    return subjects.length;
}
