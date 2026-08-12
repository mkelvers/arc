import { redirect } from '@sveltejs/kit';

import { getNotifications } from '$lib/server/notifications';
import { positiveInteger } from '$lib/utils';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) {
        redirect(303, '/login');
    }

    const page = positiveInteger(url.searchParams.get('page')) ?? 1;
    try {
        return {
            page,
            result: await getNotifications(locals.user.id, page),
            unavailable: false,
        };
    } catch (cause) {
        console.error('AniList notifications could not be loaded', cause);
        return { page, result: null, unavailable: true };
    }
};
