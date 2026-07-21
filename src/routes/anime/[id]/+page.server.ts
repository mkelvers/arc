import { error, fail } from '@sveltejs/kit';
import { Effect, Either } from 'effect';

import { anime } from '$lib/server/anime';
import { toAnimeDetails } from '$lib/server/anime/details';
import { getWatchlistState, togglePlanToWatch } from '$lib/server/watchlist';
import type { Actions, PageServerLoad } from './$types';

const userCookie = 'arc_user';

function animeId(value: string) {
    const id = Number(value);

    if (!Number.isSafeInteger(id) || id <= 0) error(400, 'Invalid anime ID');

    return id;
}

function cookieUserId(value: string | undefined) {
    return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
        ? value
        : undefined;
}

export const load: PageServerLoad = async ({ params, cookies }) => {
    const id = animeId(params.id);

    const result = await Effect.runPromise(
        anime.anilist.getAnime(id).pipe(Effect.either),
    );

    if (Either.isLeft(result)) error(502, result.left.message);

    try {
        const artwork = await anime.tmdb.getArtwork(result.right);

        return {
            anime: toAnimeDetails(result.right),
            artwork,
            watchlistState: await getWatchlistState(
                cookieUserId(cookies.get(userCookie)),
                id,
            ),
        };
    } catch {
        return {
            anime: toAnimeDetails(result.right),
            artwork: {
                backdrops: [],
                logos: [],
                selectedBackdrop: null,
                selectedLogo: null,
                logoHidden: false,
                logoSize: 100,
            },
            watchlistState: await getWatchlistState(
                cookieUserId(cookies.get(userCookie)),
                id,
            ),
        };
    }
};

export const actions: Actions = {
    watchlist: async ({ params, cookies }) => {
        const id = animeId(params.id);
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
