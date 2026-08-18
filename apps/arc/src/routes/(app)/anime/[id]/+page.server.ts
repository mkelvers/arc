import { error } from '@sveltejs/kit';

import { episodeAudioAvailabilityLabel } from '$lib/audio';
import { toAnimeDetails } from '$lib/server/anime/details';
import {
    getEpisodeRevision,
    getEpisodes,
    getStoredAiringSchedule,
} from '$lib/server/anime/episodes';
import { getFranchiseOrder } from '$lib/server/anime/franchise';
import { recordAnimeVisit } from '$lib/server/anime/interest';
import { animeId, loadAnime } from '$lib/server/anime/route';
import { resolveAnimeSynopsis } from '$lib/server/anime/synopsis';
import { getArtwork } from '$lib/server/anime/tmdb/artwork';
import { continuationEpisode } from '$lib/server/playback-progress/continue';
import { getPlaybackProgress } from '$lib/server/playback-progress/store';
import { getWatchlistState } from '$lib/server/watchlist';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, depends }) => {
    const id = animeId(params.id);
    if (!id) {
        error(400, 'Invalid anime ID');
    }
    depends(`arc:anime:${id}:episodes`);

    const userId = locals.user?.id;

    const result = await loadAnime(id);
    const [synopsis, watchlistState, , storedAiringSchedule] = await Promise.all([
        resolveAnimeSynopsis(result),
        getWatchlistState(userId, id),
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
        watchlistState,
    };
};
