import { json } from '@sveltejs/kit';

import { animeId } from '$lib/server/anime/route';
import { removeFromWatchlist, setWatchlistState } from '$lib/server/watchlist';
import { WatchlistUpdateSchema } from '$lib/watchlist';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ locals, params, request }) => {
    if (!locals.user) {
        return json({ message: 'Authentication required' }, { status: 401 });
    }

    const id = animeId(params.id);
    if (!id) {
        return json({ message: 'Invalid anime ID' }, { status: 400 });
    }

    try {
        const parsed = WatchlistUpdateSchema.safeParse(await request.json());
        if (!parsed.success) {
            return json({ message: 'Invalid watchlist status' }, { status: 400 });
        }

        try {
            return json(
                { state: await setWatchlistState(locals.user.id, id, parsed.data.state) },
                { headers: { 'cache-control': 'no-store' } }
            );
        } catch (cause) {
            console.error(`Watchlist status update failed for AniList ${id}`, cause);
            return json({ message: 'Watchlist could not be updated' }, { status: 500 });
        }
    } catch {
        return json({ message: 'Invalid JSON body' }, { status: 400 });
    }
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
    if (!locals.user) {
        return json({ message: 'Authentication required' }, { status: 401 });
    }

    const id = animeId(params.id);
    if (!id) {
        return json({ message: 'Invalid anime ID' }, { status: 400 });
    }

    try {
        await removeFromWatchlist(locals.user.id, id);
        return new Response(null, {
            status: 204,
            headers: { 'cache-control': 'no-store' },
        });
    } catch (cause) {
        console.error(`Watchlist removal failed for AniList ${id}`, cause);
        return json({ message: 'Anime could not be removed from the watchlist' }, { status: 500 });
    }
};
