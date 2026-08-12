import { json } from '@sveltejs/kit';

import { getUnreadNotificationCount } from '$lib/server/notifications';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        const count = await getUnreadNotificationCount(locals.user.id);
        return json({ hasUnreadNotifications: count > 0 });
    } catch (cause) {
        console.error('Unread notification count could not be loaded', cause);
        return json({ hasUnreadNotifications: false }, { status: 503 });
    }
};
