import { redirect } from '@sveltejs/kit';

import { getNotificationInbox, markNotificationsRead } from '$lib/server/notifications';
import { positiveInteger } from '$lib/utils';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) {
        redirect(303, '/login');
    }

    const page = positiveInteger(url.searchParams.get('page')) ?? 1;
    try {
        const result = await getNotificationInbox(locals.user.id, page);

        try {
            await markNotificationsRead(
                locals.user.id,
                result.notifications.map(({ id }) => id)
            );
        } catch (cause) {
            console.error('Notifications could not be marked read', cause);
        }

        return {
            page,
            result,
            unavailable: false,
        };
    } catch (cause) {
        console.error('Notifications could not be loaded', cause);
        return { page, result: null, unavailable: true };
    }
};
