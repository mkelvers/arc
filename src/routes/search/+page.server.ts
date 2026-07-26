import { error, fail } from '@sveltejs/kit';
import { Effect, Either } from 'effect';

import { anime } from '$lib/server/anime';
import {
    getWatchlistedAnimeIds,
    togglePlanToWatch,
} from '$lib/server/watchlist';
import type { Actions, PageServerLoad } from './$types';

const userCookie = 'arc_user';

function cookieUserId(value: string | undefined) {
    return value &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            value,
        )
        ? value
        : undefined;
}

function animeId(value: FormDataEntryValue | null) {
    const id = Number(value);

    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export const load: PageServerLoad = async ({ url, cookies }) => {
    const query = url.searchParams.get('q')?.trim() ?? '';
    if (!query) return { query, results: [], watchlistedIds: [] };

    const result = await Effect.runPromise(
        anime.anilist.searchAnime(query).pipe(Effect.either),
    );
    if (Either.isLeft(result)) error(502, result.left.message);

    const watchlisted = await getWatchlistedAnimeIds(
        cookieUserId(cookies.get(userCookie)),
        result.right.map(({ id }) => id),
    );

    return {
        query,
        results: result.right,
        watchlistedIds: [...watchlisted],
    };
};

export const actions: Actions = {
    watchlist: async ({ cookies, request }) => {
        const form = await request.formData();
        const id = animeId(form.get('animeId'));
        if (!id) return fail(400, { message: 'Invalid anime ID' });

        const currentUserId = cookieUserId(cookies.get(userCookie));
        const userId = currentUserId ?? crypto.randomUUID();

        try {
            const state = await togglePlanToWatch(userId, id);

            if (!currentUserId) {
                cookies.set(userCookie, userId, {
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
    },
};
