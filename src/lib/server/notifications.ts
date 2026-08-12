import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import {
    AniListNotificationsDocument,
    AniListUnreadNotificationCountDocument,
} from '$lib/graphql/anilist/generated/graphql';
import { anilistRequestPolicy } from '$lib/server/anime/anilist/request-policy';
import { getStoredBackdrops } from '$lib/server/anime/tmdb/media';
import { db } from '$lib/server/db';
import { accounts, animeEpisode } from '$lib/server/db/schema';
import { graphql } from '$lib/server/graphql';
import { RequestCache } from '$lib/server/request-cache';
import { notificationItems } from './notifications/presentation';

const endpoint = 'https://graphql.anilist.co';
const unreadCountCache = new RequestCache<string, number>(60_000);
const responseSchema = z.object({
    Viewer: z
        .object({
            options: z
                .object({
                    notificationOptions: z
                        .array(
                            z
                                .object({
                                    type: z.string().nullable(),
                                    enabled: z.boolean().nullable(),
                                })
                                .nullable()
                        )
                        .nullable(),
                })
                .nullable(),
        })
        .nullable(),
    Page: z
        .object({
            pageInfo: z.object({ hasNextPage: z.boolean().nullable() }).nullable(),
            notifications: z.unknown().optional(),
        })
        .nullable(),
});
const unreadCountSchema = z.object({
    Viewer: z
        .object({ unreadNotificationCount: z.number().int().nonnegative().nullable() })
        .nullable(),
});

async function accessToken(userId: string) {
    const [account] = await db
        .select({ accessToken: accounts.accessToken })
        .from(accounts)
        .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'anilist')))
        .limit(1);

    return account?.accessToken ?? null;
}

function notificationEnabled(
    options: NonNullable<z.infer<typeof responseSchema>['Viewer']>['options'],
    type: 'AIRING' | 'RELATED_MEDIA_ADDITION'
) {
    return options?.notificationOptions?.some(
        (option) => option?.type === type && option.enabled === true
    );
}

export async function getNotifications(userId: string, page: number) {
    const token = await accessToken(userId);

    if (!token) {
        return { connected: false as const };
    }

    const data = await anilistRequestPolicy.run(() =>
        graphql(
            endpoint,
            AniListNotificationsDocument,
            { page, perPage: 25 },
            {
                headers: { Authorization: `Bearer ${token}` },
                retries: 1,
            }
        )
    );
    const response = responseSchema.parse(data);

    if (!response.Viewer) {
        throw new Error('AniList returned no connected viewer');
    }

    const notifications = notificationItems(response.Page?.notifications);
    const animeIds = [...new Set(notifications.map(({ anilistId }) => anilistId))];
    const [backdrops, episodes] = await Promise.all([
        getStoredBackdrops(animeIds),
        animeIds.length
            ? db
                  .select({
                      anilistId: animeEpisode.anilistId,
                      episodeId: animeEpisode.episodeId,
                      number: animeEpisode.number,
                  })
                  .from(animeEpisode)
                  .where(inArray(animeEpisode.anilistId, animeIds))
                  .orderBy(asc(animeEpisode.number))
            : [],
    ]);

    return {
        connected: true as const,
        notifications: notifications.map((notification) => {
            const available = episodes.filter(
                ({ anilistId }) => anilistId === notification.anilistId
            );
            const target =
                (notification.episodeNumber === null
                    ? undefined
                    : available.find(({ number }) => number === notification.episodeNumber)) ??
                available.find(({ number }) => Number.isInteger(number) && number >= 1) ??
                available[0];
            const watchHref = target
                ? `/anime/${notification.anilistId}/watch/${encodeURIComponent(target.episodeId)}`
                : null;

            return {
                ...notification,
                image: backdrops.get(notification.anilistId) ?? notification.image,
                href: watchHref ?? notification.href,
                actionLabel: watchHref ? 'Watch Now' : 'View Anime',
            };
        }),
        hasNextPage: response.Page?.pageInfo?.hasNextPage === true,
        settings: {
            airing: response.Viewer.options
                ? notificationEnabled(response.Viewer.options, 'AIRING')
                : false,
            relatedMedia: response.Viewer.options
                ? notificationEnabled(response.Viewer.options, 'RELATED_MEDIA_ADDITION')
                : false,
        },
    };
}

export async function getUnreadNotificationCount(userId: string) {
    return unreadCountCache.get(
        userId,
        async () => {
            const token = await accessToken(userId);
            if (!token) {
                return 0;
            }

            const data = await anilistRequestPolicy.run(() =>
                graphql(
                    endpoint,
                    AniListUnreadNotificationCountDocument,
                    {},
                    {
                        headers: { Authorization: `Bearer ${token}` },
                        retries: 1,
                    }
                )
            );
            const response = unreadCountSchema.parse(data);
            if (!response.Viewer) {
                throw new Error('AniList returned no connected viewer');
            }

            return response.Viewer.unreadNotificationCount ?? 0;
        },
        { staleIfError: true }
    );
}
