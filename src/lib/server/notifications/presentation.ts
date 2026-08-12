import { z } from 'zod';

const titleSchema = z
    .object({
        english: z.string().nullable(),
        romaji: z.string().nullable(),
        native: z.string().nullable(),
    })
    .nullable();
const animeSchema = z.object({
    id: z.number().int().positive(),
    type: z.literal('ANIME'),
    bannerImage: z.string().nullable(),
    title: titleSchema,
});
const notificationSchema = z.discriminatedUnion('__typename', [
    z.object({
        __typename: z.literal('AiringNotification'),
        id: z.number().int().positive(),
        animeId: z.number().int().positive(),
        episode: z.number().int().positive(),
        createdAt: z.number().int().nonnegative().nullable(),
        media: animeSchema.nullable(),
    }),
    z.object({
        __typename: z.literal('RelatedMediaAdditionNotification'),
        id: z.number().int().positive(),
        mediaId: z.number().int().positive(),
        createdAt: z.number().int().nonnegative().nullable(),
        media: animeSchema.nullable(),
    }),
]);

export interface NotificationItem {
    id: number;
    kind: 'airing' | 'related_media';
    anilistId: number;
    episodeNumber: number | null;
    title: string;
    body: string;
    href: string;
    image: string | null;
    createdAt: number;
}

function mediaTitle(media: z.infer<typeof animeSchema>) {
    return media.title?.english || media.title?.romaji || media.title?.native || 'Untitled anime';
}

export function notificationItems(notifications: unknown): NotificationItem[] {
    const items: NotificationItem[] = [];

    if (!Array.isArray(notifications)) {
        return items;
    }

    for (const value of notifications) {
        const parsed = notificationSchema.safeParse(value);
        if (!parsed.success) {
            continue;
        }

        const notification = parsed.data;
        const media = notification.media;
        if (!media) {
            continue;
        }

        if (notification.__typename === 'AiringNotification') {
            const title = mediaTitle(media);
            items.push({
                id: notification.id,
                kind: 'airing',
                anilistId: notification.animeId,
                episodeNumber: notification.episode,
                title,
                body: `Episode ${notification.episode} of ${title} has aired.`,
                href: `/anime/${notification.animeId}`,
                image: media.bannerImage,
                createdAt: notification.createdAt ?? 0,
            });
        } else {
            const title = mediaTitle(media);
            items.push({
                id: notification.id,
                kind: 'related_media',
                anilistId: notification.mediaId,
                episodeNumber: null,
                title,
                body: `${title} was announced as a related release for an anime in your list.`,
                href: `/anime/${notification.mediaId}`,
                image: media.bannerImage,
                createdAt: notification.createdAt ?? 0,
            });
        }
    }

    return items;
}
