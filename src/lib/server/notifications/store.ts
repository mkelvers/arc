import { and, count, desc, eq, isNull } from 'drizzle-orm';

import { getStoredBackdrops } from '$lib/server/anime/tmdb/media';
import { db } from '$lib/server/db';
import { notification } from '$lib/server/db/schema';
import { presentNotification } from './presentation';

export async function getUnreadNotificationCount(userId: string) {
    const [row] = await db
        .select({ count: count() })
        .from(notification)
        .where(
            and(
                eq(notification.userId, userId),
                isNull(notification.readAt),
                isNull(notification.dismissedAt)
            )
        );

    return row?.count ?? 0;
}

export async function markAllNotificationsRead(userId: string) {
    await db
        .update(notification)
        .set({ readAt: new Date() })
        .where(
            and(
                eq(notification.userId, userId),
                isNull(notification.readAt),
                isNull(notification.dismissedAt)
            )
        );
}

export async function dismissAllNotifications(userId: string) {
    await db
        .update(notification)
        .set({ dismissedAt: new Date() })
        .where(and(eq(notification.userId, userId), isNull(notification.dismissedAt)));
}

export async function getNotificationInbox(userId: string, page: number) {
    const rows = await db
        .select()
        .from(notification)
        .where(and(eq(notification.userId, userId), isNull(notification.dismissedAt)))
        .orderBy(desc(notification.createdAt), desc(notification.id))
        .limit(25 + 1)
        .offset((page - 1) * 25);
    const pageRows = rows.slice(0, 25);
    const anilistIds = [...new Set(pageRows.map(({ anilistId }) => anilistId))];
    const backdropById = anilistIds.length ? await getStoredBackdrops(anilistIds) : new Map();

    return {
        notifications: pageRows.map((row) => ({
            id: row.id,
            kind: row.kind,
            title: row.title,
            ...presentNotification(row),
            episodeNumber: row.episodeNumber,
            image: backdropById.get(row.anilistId) ?? null,
            occurredAt: row.occurredAt?.getTime() ?? null,
            createdAt: row.createdAt.getTime(),
            read: row.readAt !== null,
        })),
        hasNextPage: rows.length > 25,
    };
}
