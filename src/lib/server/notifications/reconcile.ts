import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';

import { NotificationTargetMediaDocument } from '$lib/graphql/anilist/generated/graphql';
import { request } from '$lib/server/anime/anilist/client';
import { mediaTitle } from '$lib/server/anime/anilist/text';
import { db } from '$lib/server/db';
import {
    anilistNotificationTarget,
    animeEpisode,
    animeEpisodeSync,
    animeExternalId,
    animeExternalIdLink,
    notificationInterest,
    playbackProgress,
    watchlist,
} from '$lib/server/db/schema';
import { batches } from '$lib/utils';
import { notificationInputsForInitialAvailability, type NotificationEventInput } from './events';
import { resolveNotificationInterests, type RelatedAnime } from './interests';
import { persistNotificationEvents } from './persist';

const relationshipCacheLifetimeMs = 6 * 60 * 60 * 1_000;

interface TargetMedia extends RelatedAnime {
    title: string;
}

async function notificationRoots(userId: string) {
    const [saved, activeProgress] = await Promise.all([
        db
            .select({ anilistId: animeExternalId.externalId })
            .from(watchlist)
            .innerJoin(animeExternalIdLink, eq(animeExternalIdLink.animeId, watchlist.animeId))
            .innerJoin(animeExternalId, eq(animeExternalId.id, animeExternalIdLink.externalIdId))
            .where(
                and(
                    eq(watchlist.userId, userId),
                    eq(animeExternalId.provider, 'anilist'),
                    eq(animeExternalId.mediaType, 'anime')
                )
            ),
        db
            .select({ anilistId: animeExternalId.externalId })
            .from(playbackProgress)
            .innerJoin(
                animeExternalIdLink,
                eq(animeExternalIdLink.animeId, playbackProgress.animeId)
            )
            .innerJoin(animeExternalId, eq(animeExternalId.id, animeExternalIdLink.externalIdId))
            .where(
                and(
                    eq(playbackProgress.userId, userId),
                    isNull(playbackProgress.dismissedAt),
                    eq(animeExternalId.provider, 'anilist'),
                    eq(animeExternalId.mediaType, 'anime')
                )
            ),
    ]);

    return [...new Set([...saved, ...activeProgress].map(({ anilistId }) => anilistId))];
}

async function loadTargetMedia(ids: number[]) {
    const stored = await db
        .select()
        .from(anilistNotificationTarget)
        .where(inArray(anilistNotificationTarget.anilistId, ids));
    const storedById = new Map<number, TargetMedia & { verifiedAt: Date }>(
        stored.map((entry) => [
            entry.anilistId,
            {
                id: entry.anilistId,
                type: 'ANIME',
                status: entry.status,
                title: entry.title,
                relations: entry.sequelIds.map((id) => ({ id, type: 'SEQUEL' })),
                verifiedAt: entry.verifiedAt,
            },
        ])
    );
    const freshAfter = Date.now() - relationshipCacheLifetimeMs;
    const refreshIds = ids.filter(
        (id) => (storedById.get(id)?.verifiedAt.getTime() ?? 0) <= freshAfter
    );

    if (refreshIds.length) {
        try {
            const data = await request(
                NotificationTargetMediaDocument,
                { ids: refreshIds },
                { cacheForMs: relationshipCacheLifetimeMs, timeoutMs: 30_000 }
            );
            const refreshed = (data.Page?.media ?? []).flatMap((entry): TargetMedia[] => {
                if (!entry) {
                    return [];
                }

                return [
                    {
                        id: entry.id,
                        type: entry.type,
                        status: entry.status,
                        title: mediaTitle(entry),
                        relations: (entry.relations?.edges ?? []).flatMap((edge) =>
                            edge?.node ? [{ id: edge.node.id, type: edge.relationType }] : []
                        ),
                    },
                ];
            });
            const received = new Set(refreshed.map(({ id }) => id));
            const omitted = refreshIds.filter((id) => !received.has(id));
            if (omitted.length) {
                throw new Error(`AniList omitted notification targets: ${omitted.join(', ')}`);
            }

            const verifiedAt = new Date();
            await db
                .insert(anilistNotificationTarget)
                .values(
                    refreshed.map((entry) => ({
                        anilistId: entry.id,
                        title: entry.title,
                        status: entry.status,
                        sequelIds: entry.relations.flatMap((relation) =>
                            relation.type === 'SEQUEL' ? [relation.id] : []
                        ),
                        verifiedAt,
                    }))
                )
                .onConflictDoUpdate({
                    target: anilistNotificationTarget.anilistId,
                    set: {
                        title: sql.raw(`excluded.${anilistNotificationTarget.title.name}`),
                        status: sql.raw(`excluded.${anilistNotificationTarget.status.name}`),
                        sequelIds: sql.raw(`excluded.${anilistNotificationTarget.sequelIds.name}`),
                        verifiedAt,
                    },
                });
            for (const entry of refreshed) {
                storedById.set(entry.id, { ...entry, verifiedAt });
            }
        } catch (cause) {
            if (refreshIds.some((id) => !storedById.has(id))) {
                throw cause;
            }

            console.warn('Using stale AniList notification relationships', cause);
        }
    }

    return ids.map((id) => {
        const entry = storedById.get(id);
        if (!entry) {
            throw new Error(`Notification target ${id} was not loaded`);
        }

        return entry;
    });
}

async function currentSeasonAvailability(
    userId: string,
    targets: readonly { anilistId: number; sourceAnilistId: number }[],
    mediaById: ReadonlyMap<number, TargetMedia>
) {
    const releasing = targets.filter(
        ({ anilistId, sourceAnilistId }) =>
            anilistId !== sourceAnilistId && mediaById.get(anilistId)?.status === 'RELEASING'
    );
    if (!releasing.length) {
        return [];
    }

    const episodes = await db
        .select({
            anilistId: animeEpisode.anilistId,
            episodeId: animeEpisode.episodeId,
            episodeNumber: animeEpisode.number,
            audio: animeEpisode.audio,
            airDate: animeEpisode.airDate,
            firstSeenAt: animeEpisode.firstSeenAt,
        })
        .from(animeEpisode)
        .where(
            inArray(
                animeEpisode.anilistId,
                releasing.map(({ anilistId }) => anilistId)
            )
        );
    const latestById = new Map<
        number,
        {
            episodeId: string;
            episodeNumber: number;
            audio: (typeof animeEpisode.audio.enumValues)[number][];
            airDate: string | null;
            firstSeenAt: Date;
        }
    >();
    for (const episode of episodes) {
        if (!Number.isInteger(episode.episodeNumber) || episode.episodeNumber <= 0) {
            continue;
        }

        const latest = latestById.get(episode.anilistId);
        if (!latest || episode.episodeNumber > latest.episodeNumber) {
            latestById.set(episode.anilistId, episode);
        }
    }

    return releasing.flatMap((interest): NotificationEventInput[] => {
        const media = mediaById.get(interest.anilistId);
        const episode = latestById.get(interest.anilistId);
        if (!media || !episode) {
            return [];
        }

        return notificationInputsForInitialAvailability(
            {
                anilistId: interest.anilistId,
                title: media.title,
                status: media.status,
                episodeId: episode.episodeId,
                episodeNumber: episode.episodeNumber,
                audio: episode.audio,
                airDate: episode.airDate,
                observedAt: episode.firstSeenAt,
            },
            [{ userId, sourceAnilistId: interest.sourceAnilistId }]
        );
    });
}

async function reconcileNotificationInterests(userId: string) {
    const [roots, existing] = await Promise.all([
        notificationRoots(userId),
        db
            .select({
                anilistId: notificationInterest.anilistId,
                sourceAnilistId: notificationInterest.sourceAnilistId,
            })
            .from(notificationInterest)
            .where(eq(notificationInterest.userId, userId)),
    ]);

    if (!roots.length) {
        await db.delete(notificationInterest).where(eq(notificationInterest.userId, userId));
        return { roots: 0, interests: 0, notifications: 0 };
    }

    const mediaById = new Map<number, TargetMedia>();
    const resolved = await resolveNotificationInterests(roots, async (ids) => {
        const media = await loadTargetMedia(ids);
        for (const entry of media) {
            mediaById.set(entry.id, entry);
        }
        return media;
    });
    const resolvedIds = resolved.map(({ anilistId }) => anilistId);
    const previousIds = new Set(existing.map(({ anilistId }) => anilistId));
    const now = new Date();
    const availability = await currentSeasonAvailability(userId, resolved, mediaById);
    const availableIds = new Set(availability.map(({ anilistId }) => anilistId));
    const announcements: NotificationEventInput[] = existing.length
        ? resolved.flatMap((interest): NotificationEventInput[] => {
              const media = mediaById.get(interest.anilistId);
              if (
                  previousIds.has(interest.anilistId) ||
                  availableIds.has(interest.anilistId) ||
                  interest.sourceAnilistId === interest.anilistId ||
                  (media?.status !== 'NOT_YET_RELEASED' && media?.status !== 'RELEASING')
              ) {
                  return [];
              }

              return [
                  {
                      userId,
                      kind: 'season_announced',
                      anilistId: interest.anilistId,
                      sourceAnilistId: interest.sourceAnilistId,
                      title: media.title,
                      episodeId: null,
                      episodeNumber: null,
                      audio: [],
                      dedupeKey: `season_announced:${interest.anilistId}`,
                      occurredAt: null,
                  },
              ];
          })
        : [];

    const created = await db.transaction(async (tx) => {
        await tx
            .delete(notificationInterest)
            .where(
                and(
                    eq(notificationInterest.userId, userId),
                    notInArray(notificationInterest.anilistId, resolvedIds)
                )
            );

        for (const batch of batches(resolved, 1_000)) {
            await tx
                .insert(notificationInterest)
                .values(batch.map((interest) => ({ userId, ...interest, updatedAt: now })))
                .onConflictDoUpdate({
                    target: [notificationInterest.userId, notificationInterest.anilistId],
                    set: {
                        sourceAnilistId: sql.raw(
                            `excluded.${notificationInterest.sourceAnilistId.name}`
                        ),
                        updatedAt: now,
                    },
                });
        }

        await tx
            .insert(animeEpisodeSync)
            .values(resolvedIds.map((anilistId) => ({ anilistId })))
            .onConflictDoNothing({ target: animeEpisodeSync.anilistId });

        return persistNotificationEvents([...announcements, ...availability], tx);
    });

    return { roots: roots.length, interests: resolved.length, notifications: created.length };
}

async function notificationInterestUsers() {
    const [saved, activeProgress] = await Promise.all([
        db.selectDistinct({ userId: watchlist.userId }).from(watchlist),
        db
            .selectDistinct({ userId: playbackProgress.userId })
            .from(playbackProgress)
            .where(isNull(playbackProgress.dismissedAt)),
    ]);

    return [...new Set([...saved, ...activeProgress].map(({ userId }) => userId))];
}

export async function reconcileAllNotificationInterests() {
    const userIds = await notificationInterestUsers();
    const results = [];
    const failures: unknown[] = [];

    for (const userId of userIds) {
        try {
            results.push(await reconcileNotificationInterests(userId));
        } catch (cause) {
            failures.push(cause);
            console.error('Notification interest reconciliation failed', cause);
        }
    }

    if (failures.length) {
        throw new AggregateError(
            failures,
            'One or more notification interests could not be reconciled'
        );
    }

    return {
        users: userIds.length,
        interests: results.reduce((total, result) => total + result.interests, 0),
        notifications: results.reduce((total, result) => total + result.notifications, 0),
    };
}
