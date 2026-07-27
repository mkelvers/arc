import { fail, type Cookies, type RequestEvent } from '@sveltejs/kit';

import { animeId } from '$lib/server/anime/route';
import { togglePlanToWatch } from './store';

const cookie = 'arc_user';
const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function watchlistUser(cookies: Cookies) {
    const value = cookies.get(cookie);

    return value && uuid.test(value) ? value : undefined;
}

export async function updateWatchlist({
    cookies,
    params,
    request,
}: RequestEvent) {
    const form = await request.formData();
    const id = animeId(form.get('animeId')) ?? animeId(params.id);

    if (!id) {
        return fail(400, { message: 'Invalid anime ID' });
    }

    const current = watchlistUser(cookies);
    const user = current ?? crypto.randomUUID();

    try {
        const state = await togglePlanToWatch(user, id);

        if (!current) {
            cookies.set(cookie, user, {
                path: '/',
                httpOnly: true,
                sameSite: 'lax',
                secure: !import.meta.env.DEV,
                maxAge: 60 * 60 * 24 * 365,
            });
        }

        return { success: true, state };
    } catch (cause) {
        return fail(500, {
            message:
                cause instanceof Error
                    ? cause.message
                    : 'Watchlist update failed',
        });
    }
}
