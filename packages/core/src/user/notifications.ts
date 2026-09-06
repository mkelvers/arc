import { and, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';

import { db, type DatabaseTransaction } from '@arc/shared/db';
import {
    animeExternalId,
    animeExternalIdLink,
    animeRelation,
    notification,
    watchlist,
} from '@arc/shared/db/schema';
import { getStoredMedia } from '../catalog/tmdb';

type InventoryNotification = {
    type: 'episode_available' | 'dub_available';
    episodeId: string;
    episodeNumber: number;
};

type NotificationEntry = {
    id: string;
    animeId: number;
    episodeId: string;
    type: 'episode_available' | 'dub_available';
    title: string;
    episodeNumber: number;
    imageUrl: string | null;
    anilistId: number;
    createdAt: Date;
    readAt: Date | null;
};

type CompactedNotificationEntry = NotificationEntry & {
    episodeNumbers: number[];
    dubEpisodeNumbers: number[];
    relatedIds: string[];
};

export function compactNotificationEntries(
    entries: readonly NotificationEntry[]
): CompactedNotificationEntry[] {
    const batches = new Map<string, NotificationEntry[]>();
    for (const entry of entries) {
        const key = `${entry.animeId}:${entry.createdAt.getTime()}`;
        const batch = batches.get(key);
        if (batch) {
            batch.push(entry);
        } else {
            batches.set(key, [entry]);
        }
    }

    return [...batches.values()].map((batch) => {
        const episodeEntries = batch.filter((entry) => entry.type === 'episode_available');
        const dubEntries = batch.filter((entry) => entry.type === 'dub_available');
        const primary = [...(episodeEntries.length ? episodeEntries : dubEntries)].sort(
            (left, right) => left.episodeNumber - right.episodeNumber
        )[0]!;
        const episodeNumbers = [...new Set(batch.map((entry) => entry.episodeNumber))].sort(
            (left, right) => left - right
        );
        const dubEpisodeNumbers = [...new Set(dubEntries.map((entry) => entry.episodeNumber))].sort(
            (left, right) => left - right
        );

        return {
            ...primary,
            episodeNumbers,
            dubEpisodeNumbers,
            relatedIds: batch.filter((entry) => entry.id !== primary.id).map(({ id }) => id),
            readAt: batch.every((entry) => entry.readAt) ? primary.readAt : null,
        };
    });
}

async function continuityAnimeIds(tx: DatabaseTransaction, animeId: number) {
    const ids = new Set([animeId]);
    let frontier = [animeId];

    while (frontier.length) {
        const relations = await tx
            .select({
                sourceAnimeId: animeRelation.sourceAnimeId,
                targetAnimeId: animeRelation.targetAnimeId,
            })
            .from(animeRelation)
            .where(
                and(
                    or(
                        inArray(animeRelation.sourceAnimeId, frontier),
                        inArray(animeRelation.targetAnimeId, frontier)
                    ),
                    inArray(animeRelation.relationType, ['PREQUEL', 'SEQUEL'])
                )
            );
        frontier = [];
        for (const relation of relations) {
            const relatedId = ids.has(relation.sourceAnimeId)
                ? relation.targetAnimeId
                : relation.sourceAnimeId;
            if (!ids.has(relatedId)) {
                ids.add(relatedId);
                frontier.push(relatedId);
            }
        }
    }

    return [...ids];
}

export async function createInventoryNotifications(
    tx: DatabaseTransaction,
    input: {
        animeId: number;
        title: string;
        imageUrl: string | null;
        events: readonly InventoryNotification[];
    }
) {
    if (!input.events.length) {
        return 0;
    }

    const relatedAnimeIds = await continuityAnimeIds(tx, input.animeId);
    const recipients = await tx
        .select({ userId: watchlist.userId })
        .from(watchlist)
        .where(and(inArray(watchlist.animeId, relatedAnimeIds), ne(watchlist.state, 'dropped')));
    if (!recipients.length) {
        return 0;
    }

    const rows = recipients.flatMap(({ userId }) =>
        input.events.map((event) => ({
            userId,
            animeId: input.animeId,
            type: event.type,
            episodeId: event.episodeId,
            episodeNumber: event.episodeNumber,
            title: input.title,
            imageUrl: input.imageUrl,
        }))
    );
    await tx.insert(notification).values(rows).onConflictDoNothing();
    return rows.length;
}

export async function getNotifications(userId: string) {
    const [entries, unread] = await Promise.all([
        db
            .select({
                id: notification.id,
                animeId: notification.animeId,
                episodeId: notification.episodeId,
                type: notification.type,
                title: notification.title,
                episodeNumber: notification.episodeNumber,
                imageUrl: notification.imageUrl,
                anilistId: animeExternalId.externalId,
                createdAt: notification.createdAt,
                readAt: notification.readAt,
            })
            .from(notification)
            .innerJoin(animeExternalIdLink, eq(animeExternalIdLink.animeId, notification.animeId))
            .innerJoin(animeExternalId, eq(animeExternalId.id, animeExternalIdLink.externalIdId))
            .where(
                and(
                    eq(notification.userId, userId),
                    eq(animeExternalId.provider, 'anilist'),
                    eq(animeExternalId.mediaType, 'anime')
                )
            )
            .orderBy(desc(notification.createdAt))
            .limit(100),
        db
            .select({
                count: sql<number>`count(distinct (${notification.animeId}, ${notification.createdAt}))::int`,
            })
            .from(notification)
            .where(and(eq(notification.userId, userId), isNull(notification.readAt))),
    ]);

    type NotificationResponseEntry = {
        id: string;
        href: string;
        type: NotificationEntry['type'];
        title: string;
        episodeNumber: number;
        episodeNumbers: number[];
        dubEpisodeNumbers: number[];
        imageUrl: string | null;
        createdAt: string;
        readAt: string | null;
        relatedIds?: string[];
    };
    const compactedEntries = compactNotificationEntries(entries);

    const artworkByAnilistId = new Map(
        await Promise.all(
            [...new Set(compactedEntries.map((entry) => entry.anilistId))].map(
                async (anilistId) =>
                    [
                        anilistId,
                        (await getStoredMedia(anilistId))?.artwork.selectedBackdrop?.url ?? null,
                    ] as const
            )
        )
    );

    return {
        entries: compactedEntries.map((entry) => {
            const result: NotificationResponseEntry = {
                id: entry.id,
                href: `/anime/${entry.anilistId}/watch/${entry.episodeNumber}`,
                type: entry.type,
                title: entry.title,
                episodeNumber: entry.episodeNumber,
                episodeNumbers: entry.episodeNumbers,
                dubEpisodeNumbers: entry.dubEpisodeNumbers,
                imageUrl: artworkByAnilistId.get(entry.anilistId) ?? entry.imageUrl,
                createdAt: entry.createdAt.toISOString(),
                readAt: entry.readAt?.toISOString() ?? null,
            };
            if (entry.relatedIds.length) {
                result.relatedIds = entry.relatedIds;
            }
            return result;
        }),
        unreadCount: unread[0]?.count ?? 0,
    };
}

export async function markNotificationRead(userId: string, id: string) {
    await db
        .update(notification)
        .set({ readAt: new Date() })
        .where(and(eq(notification.id, id), eq(notification.userId, userId)));
}

export async function getUnreadNotificationCount(userId: string) {
    const [result] = await db
        .select({
            count: sql<number>`count(distinct (${notification.animeId}, ${notification.createdAt}))::int`,
        })
        .from(notification)
        .where(and(eq(notification.userId, userId), isNull(notification.readAt)));
    return result?.count ?? 0;
}
