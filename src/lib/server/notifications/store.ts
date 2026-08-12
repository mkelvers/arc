import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';

import { getStoredBackdrops } from '$lib/server/anime/tmdb/media';
import { db } from '$lib/server/db';
import { notification } from '$lib/server/db/schema';
import {
    notificationAudioLabel,
    notificationBody,
    notificationHref,
    notificationWatchHref,
} from './presentation';

const pageSize = 25;

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

export async function markNotificationsRead(userId: string, ids: readonly string[]) {
    if (!ids.length) {
        return;
    }

    await db
        .update(notification)
        .set({ readAt: new Date() })
        .where(
            and(
                eq(notification.userId, userId),
                inArray(notification.id, [...ids]),
                isNull(notification.readAt)
            )
        );
}

export async function getNotificationInbox(userId: string, page: number) {
    const offset = (page - 1) * pageSize;
    const rows = await db
        .select()
        .from(notification)
        .where(and(eq(notification.userId, userId), isNull(notification.dismissedAt)))
        .orderBy(desc(notification.createdAt), desc(notification.id))
        .limit(pageSize + 1)
        .offset(offset);
    const pageRows = rows.slice(0, pageSize);
    const anilistIds = [...new Set(pageRows.map(({ anilistId }) => anilistId))];
    const backdropById = anilistIds.length ? await getStoredBackdrops(anilistIds) : new Map();

    return {
        notifications: pageRows.map((row) => ({
            id: row.id,
            kind: row.kind,
            title: row.title,
            body: notificationBody(row),
            audioLabel: notificationAudioLabel(row.audio),
            episodeNumber: row.episodeNumber,
            href: notificationHref(row),
            watchHref: notificationWatchHref(row),
            actionLabel: row.episodeId ? 'Watch Now' : null,
            image: backdropById.get(row.anilistId) ?? null,
            occurredAt: row.occurredAt?.getTime() ?? null,
            createdAt: row.createdAt.getTime(),
            read: row.readAt !== null,
        })),
        hasNextPage: rows.length > pageSize,
    };
}
