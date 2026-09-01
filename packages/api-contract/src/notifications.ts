import { z } from 'zod';

export const NotificationSchema = z.object({
    id: z.uuid(),
    type: z.enum(['episode_available', 'dub_available']),
    title: z.string(),
    episodeNumber: z.number(),
    imageUrl: z.string().nullable(),
    href: z.string(),
    createdAt: z.string(),
    readAt: z.string().nullable(),
});

export const NotificationsResponseSchema = z.object({
    entries: z.array(NotificationSchema),
    unreadCount: z.number().int().nonnegative(),
});

export type Notification = z.infer<typeof NotificationSchema>;
