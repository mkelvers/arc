import { z } from 'zod';

export const NotificationSchema = z.object({
    id: z.uuid(),
    type: z.enum(['episode_available', 'dub_available']),
    title: z.string(),
    episodeNumber: z.number(),
    episodeNumbers: z.array(z.number()).min(1),
    dubEpisodeNumbers: z.array(z.number()),
    imageUrl: z.string().nullable(),
    relatedIds: z.array(z.uuid()).optional(),
    href: z.string(),
    createdAt: z.string(),
    readAt: z.string().nullable(),
});

export const NotificationsResponseSchema = z.object({
    entries: z.array(NotificationSchema),
    unreadCount: z.number().int().nonnegative(),
});

export type Notification = z.infer<typeof NotificationSchema>;
