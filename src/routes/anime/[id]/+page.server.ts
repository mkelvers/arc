import { error, fail } from '@sveltejs/kit';
import { Effect, Either } from 'effect';

import { formatEpisodesAudioLabel } from '$lib/anime';
import { anime } from '$lib/server/anime';
import { toAnimeDetails } from '$lib/server/anime/details';
import {
    getWatchlistedAnimeIds,
    getWatchlistState,
    togglePlanToWatch,
} from '$lib/server/watchlist';
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
    const userId = cookieUserId(cookies.get(userCookie));

    const result = await Effect.runPromise(
        anime.anilist.getAnime(id).pipe(Effect.either),
    );

    if (Either.isLeft(result)) {
        error(
            result.left.status === 404 ? 404 : 502,
            result.left.status === 404
                ? 'This anime is no longer available on AniList'
                : result.left.message,
        );
    }

    const artwork = anime.tmdb.getArtwork(result.right).catch((cause) => {
        console.error(
            `TMDB artwork enrichment failed for AniList ${id}`,
            cause,
        );
        return null;
    });
    const episodes = anime.episodes.getEpisodes(result.right).catch(() => []);
    const audioLabel = episodes.then(formatEpisodesAudioLabel);
    const franchise = result.right.idMal
        ? anime.franchise
              .getFranchiseOrder(result.right.idMal)
              .then(async (order) => {
                  const watched = await getWatchlistedAnimeIds(
                      userId,
                      order.entries.map(({ anilistId }) => anilistId),
                  );

                  return {
                      ...order,
                      entries: order.entries.map((entry) => ({
                          ...entry,
                          watchlisted: watched.has(entry.anilistId),
                      })),
                  };
              })
              .catch((cause) => {
                  console.error(
                      `Franchise order failed for MAL ${result.right.idMal}`,
                      cause,
                  );
                  return null;
              })
        : Promise.resolve(null);
    const watchlistState = await getWatchlistState(
        userId,
        id,
    );

    return {
        anime: toAnimeDetails(result.right),
        artwork,
        episodes,
        audioLabel,
        franchise,
        watchlistState,
    };
};

export const actions: Actions = {
    watchlist: async ({ params, cookies, request }) => {
        const form = await request.formData();
        const id = animeId(String(form.get('animeId') ?? params.id));
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
