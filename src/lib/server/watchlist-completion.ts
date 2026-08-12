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

export function watchlistStateAfterPlayback(
    current: WatchlistState | null,
    release: Release | null,
    episodes: Episode[],
    playback: Episode & { completed: boolean }
): WatchlistState | null {
    const storedEpisode = episodes.some(
        ({ episodeId, number }) => episodeId === playback.episodeId && number === playback.number
    );
    if (!storedEpisode) {
        return current;
    }

    if (current === 'completed') {
        return current;
    }

    const expected = release?.expectedEpisodes;
    const completedSeries =
        playback.completed &&
        release?.mediaStatus === 'FINISHED' &&
        expected !== null &&
        expected !== undefined &&
        expected > 0 &&
        playback.number === expected &&
        coversExpectedEpisodes(episodes, expected);

    if (completedSeries) {
        return 'completed';
    }

    return current ? 'watching' : null;
}
