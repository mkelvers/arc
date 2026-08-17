import { json } from '@sveltejs/kit';

import { getUnreadNotificationCount } from '$lib/server/notifications/store';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
    const headers = { 'cache-control': 'no-store' };

    if (!locals.user) {
        return json({ message: 'Authentication required' }, { status: 401, headers });
    }

    try {
        return json(
            { hasUnreadNotifications: (await getUnreadNotificationCount(locals.user.id)) > 0 },
            { headers }
        );
    } catch (cause) {
        console.error('Unread notification count could not be loaded', cause);
        return json({ hasUnreadNotifications: false }, { status: 503, headers });
    }
};
