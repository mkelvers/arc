import { fail, redirect, type RequestEvent } from '@sveltejs/kit';

import { animeId } from '$lib/server/anime/route';
import {
    watchlistState as watchlistStateEnum,
    type WatchlistState,
} from '$lib/server/db/schema';
import {
    removeFromWatchlist,
    setWatchlistState,
    toggleWatchlist,
} from './store';

function isWatchlistState(value: string): value is WatchlistState {
    return watchlistStateEnum.enumValues.includes(value as WatchlistState);
}

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

    const requestedState = form.get('state');
    if (
        requestedState !== null &&
        (typeof requestedState !== 'string' ||
            !isWatchlistState(requestedState))
    ) {
        return fail(400, { message: 'Invalid watchlist state' });
    }

    try {
        const state = requestedState
            ? await setWatchlistState(locals.user.id, id, requestedState)
            : await toggleWatchlist(locals.user.id, id);

        return { success: true, state };
    } catch (cause) {
        console.error('Watchlist update failed', cause);

        return fail(500, {
            message: 'Watchlist update failed',
        });
    }
}

export async function removeWatchlist({
    locals,
    request,
}: RequestEvent) {
    if (!locals.user) {
        redirect(303, '/login');
    }

    const form = await request.formData();
    const id = animeId(form.get('animeId'));

    if (!id) {
        return fail(400, { message: 'Invalid anime ID' });
    }

    try {
        await removeFromWatchlist(locals.user.id, id);

        return { success: true };
    } catch (cause) {
        console.error('Watchlist removal failed', cause);

        return fail(500, {
            message: 'Watchlist removal failed',
        });
    }
}
