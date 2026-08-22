import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';

import { WatchlistStateResponseSchema } from '@arc/api-contract/watchlist';
import { episodeAudioAvailabilityLabel } from '@arc/shared/audio';
import { toAnimeDetails } from '@arc/backend/internal/anime/details';
import {
    getEpisodeRevision,
    getEpisodes,
    getStoredAiringSchedule,
} from '@arc/backend/internal/anime/episodes';
import { getFranchiseOrder } from '@arc/backend/internal/anime/franchise';
import { recordAnimeVisit } from '@arc/backend/internal/anime/interest';
import { animeId, loadAnime } from '$lib/server/anime/route';
import { resolveAnimeSynopsis } from '@arc/backend/internal/anime/synopsis';
import { getArtwork } from '@arc/backend/internal/anime/tmdb/artwork';
import { continuationEpisode } from '$lib/server/progress/continue';
import { getPlaybackProgress } from '$lib/server/progress/store';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, depends, request }) => {
    const id = animeId(params.id);
    if (!id) {
        error(400, 'Invalid anime ID');
    }
    depends(`arc:anime:${id}:episodes`);

    const userId = locals.user?.id;

    const result = await loadAnime(id);
    const headers = new Headers({ Accept: 'application/json' });
    const cookie = request.headers.get('cookie');
    const authorization = request.headers.get('authorization');
    if (cookie) {
        headers.set('cookie', cookie);
    }
    if (authorization) {
        headers.set('authorization', authorization);
    }
    const watchlistState = locals.user
        ? fetch(new URL(`/v1/watchlist/${id}`, env.API_ORIGIN!), { headers }).then(
              async (response) => {
                  if (!response.ok) {
                      throw new Error(`Watchlist state request failed with ${response.status}`);
                  }
                  return WatchlistStateResponseSchema.parse(await response.json()).state;
              }
          )
        : Promise.resolve(null);
    const [synopsis, resolvedWatchlistState, , storedAiringSchedule] = await Promise.all([
        resolveAnimeSynopsis(result),
        watchlistState,
        recordAnimeVisit(userId, id),
        getStoredAiringSchedule(id),
    ]);
    const details = toAnimeDetails(result, synopsis, storedAiringSchedule);

    const artwork = getArtwork(result).catch((cause) => {
        console.error(`TMDB artwork enrichment failed for AniList ${id}`, cause);
        return null;
    });
    const episodes = getEpisodes(result).catch(() => []);
    const watchAction = Promise.all([episodes, getPlaybackProgress(userId, id)]).then(
        ([availableEpisodes, progress]) => {
            const continuation = continuationEpisode(
                progress,
                availableEpisodes,
                details.status === 'FINISHED'
            );
            const target = continuation ?? availableEpisodes[0] ?? null;

            return {
                href: target?.href ?? '#anime-episode-list',
                label: continuation
                    ? `Continue watching ${continuation.label}`
                    : target
                      ? `Start watching ${target.label}`
                      : 'View episodes',
            };
        }
    );
    const audioLabel = episodes.then(episodeAudioAvailabilityLabel);
    const franchise = result.idMal
        ? getFranchiseOrder(result.idMal).catch((cause) => {
              console.error(`Franchise order failed for MAL ${result.idMal}`, cause);
              return null;
          })
        : Promise.resolve(null);

    return {
        anime: details,
        artwork,
        episodes,
        episodeRevision: episodes.then(() => getEpisodeRevision(id)),
        watchAction,
        audioLabel,
        franchise,
        watchlistState: resolvedWatchlistState,
    };
};
