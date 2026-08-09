import type { WatchlistState } from '$lib/watchlist';
import { coversExpectedEpisodes } from '$lib/server/anime/providers/match';

interface Episode {
  episodeId: string;
  number: number;
}

interface Release {
  mediaStatus: string | null;
  expectedEpisodes: number | null;
}

export function watchlistStateAfterEpisodeCompletion(
  current: WatchlistState | null,
  release: Release | null,
  episodes: Episode[],
  completedEpisode: Episode
): WatchlistState | null {
  const storedEpisode = episodes.some(
    ({ episodeId, number }) =>
      episodeId === completedEpisode.episodeId && number === completedEpisode.number
  );
  if (!storedEpisode) {
    return current;
  }

  if (current === 'completed') {
    return current;
  }

  const expected = release?.expectedEpisodes;
  const completedSeries =
    release?.mediaStatus === 'FINISHED' &&
    expected !== null &&
    expected !== undefined &&
    expected > 0 &&
    completedEpisode.number === expected &&
    coversExpectedEpisodes(episodes, expected);

  return completedSeries ? 'completed' : 'watching';
}
