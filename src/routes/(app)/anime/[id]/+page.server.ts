import { error } from '@sveltejs/kit';

import { episodeAudioAvailabilityLabel } from '$lib/anime/audio';
import { anime } from '$lib/server/anime';
import { toAnimeDetails } from '$lib/server/anime/details';
import { animeId, loadAnime } from '$lib/server/anime/route';
import { continuationEpisode } from '$lib/server/playback-progress/continue';
import { getPlaybackProgress } from '$lib/server/playback-progress/store';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const id = animeId(params.id);
  if (!id) {
    error(400, 'Invalid anime ID');
  }

  const userId = locals.user?.id;

  const result = await loadAnime(id);
  const details = toAnimeDetails(result);

  const artwork = anime.tmdb.getArtwork(result).catch((cause) => {
    console.error(`TMDB artwork enrichment failed for AniList ${id}`, cause);
    return null;
  });
  const episodes = anime.episodes.getEpisodes(result).catch(() => []);
  const watchAction = Promise.all([episodes, getPlaybackProgress(userId, id)]).then(
    ([availableEpisodes, progress]) => {
      const continuation = continuationEpisode(progress, availableEpisodes);
      const target = continuation ?? availableEpisodes[0] ?? null;

      return {
        href: target?.href ?? '#anime-episode-list',
        label: continuation
          ? `CONTINUE WATCHING ${continuation.label}`
          : target
            ? `START WATCHING ${target.label}`
            : 'VIEW EPISODES',
      };
    }
  );
  const audioLabel = episodes.then(episodeAudioAvailabilityLabel);
  const franchise = result.idMal
    ? anime.franchise.getFranchiseOrder(result.idMal).catch((cause) => {
        console.error(`Franchise order failed for MAL ${result.idMal}`, cause);
        return null;
      })
    : Promise.resolve(null);

  return {
    pageTitle: `Watch ${details.title}`,
    anime: details,
    artwork,
    episodes,
    watchAction,
    audioLabel,
    franchise,
  };
};
