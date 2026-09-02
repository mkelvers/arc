import { Hono } from 'hono';
import { z } from 'zod';

import {
    getNotifications,
    getUnreadNotificationCount,
    markNotificationRead,
} from '@arc/backend/notifications';
import { middleware, type ApiEnvironment } from '../http';

const idSchema = z.object({ id: z.uuid() });

export const notifications = new Hono<ApiEnvironment>();
notifications.use('*', middleware);

notifications.get('/', async (context) =>
    context.json(await getNotifications(context.get('session').user.id))
);

notifications.get('/unread-count', async (context) =>
    context.json({ count: await getUnreadNotificationCount(context.get('session').user.id) })
);

notifications.post('/:id/read', async (context) => {
    const parsed = idSchema.safeParse(context.req.param());
    if (!parsed.success) {
        return context.json(
            { error: { code: 'INVALID_REQUEST', message: 'Invalid notification' } },
            400
        );
    }
    await markNotificationRead(context.get('session').user.id, parsed.data.id);
    return context.body(null, 204);
});
