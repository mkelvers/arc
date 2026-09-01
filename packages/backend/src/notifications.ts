import { and, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';

import { db, type DatabaseTransaction } from '@arc/db';
import {
    animeExternalId,
    animeExternalIdLink,
    animeRelation,
    notification,
    watchlist,
} from '@arc/db/schema';

type InventoryNotification = {
    type: 'episode_available' | 'dub_available';
    episodeId: string;
    episodeNumber: number;
};

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
            .select({ count: sql<number>`count(*)::int` })
            .from(notification)
            .where(and(eq(notification.userId, userId), isNull(notification.readAt))),
    ]);

    return {
        entries: entries.map((entry) => ({
            ...entry,
            href: `/anime/${entry.anilistId}/watch/${entry.episodeNumber}`,
            createdAt: entry.createdAt.toISOString(),
            readAt: entry.readAt?.toISOString() ?? null,
        })),
        unreadCount: unread[0]?.count ?? 0,
    };
}

export async function markNotificationRead(userId: string, id: string) {
    await db
        .update(notification)
        .set({ readAt: new Date() })
        .where(and(eq(notification.id, id), eq(notification.userId, userId)));
}

export async function markAllNotificationsRead(userId: string) {
    await db
        .update(notification)
        .set({ readAt: new Date() })
        .where(and(eq(notification.userId, userId), isNull(notification.readAt)));
}

export async function getUnreadNotificationCount(userId: string) {
    const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notification)
        .where(and(eq(notification.userId, userId), isNull(notification.readAt)));
    return result?.count ?? 0;
}
