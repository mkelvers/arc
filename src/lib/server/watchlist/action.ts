import { fail, redirect, type RequestEvent } from '@sveltejs/kit';

import { animeId } from '$lib/server/anime/route';
import { togglePlanToWatch } from './store';

export async function updateWatchlist({
    locals,
    params,
    request,
}: RequestEvent) {
    if (!locals.user) {
        redirect(303, '/login');
    }

    const form = await request.formData();
    const id = animeId(form.get('animeId')) ?? animeId(params.id);

    if (!id) {
        return fail(400, { message: 'Invalid anime ID' });
    }

    try {
        const state = await togglePlanToWatch(locals.user.id, id);

        return { success: true, state };
    } catch (cause) {
        console.error('Watchlist update failed', cause);

        return fail(500, {
            message: 'Watchlist update failed',
        });
    }
}
