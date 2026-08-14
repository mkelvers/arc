import { fail, redirect } from '@sveltejs/kit';

import {
    dismissAllNotifications,
    getNotificationInbox,
    markAllNotificationsRead,
} from '$lib/server/notifications/store';
import { positiveInteger } from '$lib/utils';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) {
        redirect(303, '/login');
    }

    const page = positiveInteger(url.searchParams.get('page')) ?? 1;
    try {
        const result = await getNotificationInbox(locals.user.id, page);

        try {
            await markAllNotificationsRead(locals.user.id);
        } catch (cause) {
            console.error('Notifications could not be marked read', cause);
        }

        return {
            pageTitle: 'Notification Center',
            page,
            result,
            unavailable: false,
        };
    } catch (cause) {
        console.error('Notifications could not be loaded', cause);
        return { pageTitle: 'Notification Center', page, result: null, unavailable: true };
    }
};

export const actions: Actions = {
    default: async ({ locals, request }) => {
        if (!locals.user) {
            redirect(303, '/login');
        }

        const data = await request.formData();
        if (data.get('intent') !== 'clearAll') {
            return fail(400, { message: 'Invalid notification action' });
        }

        try {
            await dismissAllNotifications(locals.user.id);
            return { success: true };
        } catch (cause) {
            console.error('Notifications could not be cleared', cause);
            return fail(500, { message: 'Notifications could not be cleared' });
        }
    },
};
