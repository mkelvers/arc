import { json } from '@sveltejs/kit';

import { getWatchlistStates } from '$lib/server/watchlist';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) {
        return json({ message: 'Authentication required' }, { status: 401 });
    }

    try {
        return json(await getWatchlistStates(locals.user.id), {
            headers: { 'cache-control': 'no-store' },
        });
    } catch (cause) {
        console.error('Watchlist state load failed', cause);
        return json({ message: 'Watchlist could not be loaded' }, { status: 500 });
    }
};
