import type { AnimeEpisode } from '$lib/anime/types';

interface Progress {
    episodeId: string;
    positionSeconds: number;
    completed: boolean;
}

export function continuationEpisode(
    progress: Progress | null,
    episodes: AnimeEpisode[],
    releaseFinished: boolean
) {
    if (!progress) {
        return null;
    }

    const currentIndex = episodes.findIndex(({ id }) => id === progress.episodeId);
    if (currentIndex < 0) {
        return null;
    }

    if (!progress.completed) {
        return episodes[currentIndex];
    }

    return episodes[currentIndex + 1] ?? (releaseFinished ? null : episodes[currentIndex]);
}

export function resumePosition(progress: Progress | null, episodeId: string) {
    if (!progress || progress.completed || progress.episodeId !== episodeId) {
        return 0;
    }

    return progress.positionSeconds;
}
