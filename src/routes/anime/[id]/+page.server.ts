import { error } from '@sveltejs/kit';

import { episodeAudioAvailabilityLabel } from '$lib/anime/audio';
import { anime } from '$lib/server/anime';
import { toAnimeDetails } from '$lib/server/anime/details';
import { animeId, loadAnime } from '$lib/server/anime/route';
import {
    removeWatchlist,
    updateWatchlist,
} from '$lib/server/watchlist/action';
import {
    getWatchlistedAnimeIds,
    getWatchlistState,
} from '$lib/server/watchlist/store';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
    const id = animeId(params.id);
    if (!id) {
        error(400, 'Invalid anime ID');
    }

    const userId = locals.user?.id;

    const result = await loadAnime(id);

    const artwork = anime.tmdb.getArtwork(result).catch((cause) => {
        console.error(
            `TMDB artwork enrichment failed for AniList ${id}`,
            cause,
        );
        return null;
    });
    const episodes = anime.episodes.getEpisodes(result).catch(() => []);
    const audioLabel = episodes.then(episodeAudioAvailabilityLabel);
    const franchise = result.idMal
        ? anime.franchise
              .getFranchiseOrder(result.idMal)
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
                      `Franchise order failed for MAL ${result.idMal}`,
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
        anime: toAnimeDetails(result),
        artwork,
        episodes,
        audioLabel,
        franchise,
        watchlistState,
    };
};

export const actions: Actions = {
    watchlist: updateWatchlist,
    remove: removeWatchlist,
};
