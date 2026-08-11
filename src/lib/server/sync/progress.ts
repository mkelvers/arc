interface EpisodeProgress {
    episodeNumber: number;
    completed: boolean;
}

export function anilistCompletedEpisodes(progress: EpisodeProgress) {
    const episodes = progress.completed
        ? Math.floor(progress.episodeNumber)
        : Math.ceil(progress.episodeNumber) - 1;

    return Math.max(0, episodes);
}

export function shouldImportAnilistProgress(
    local: EpisodeProgress | undefined,
    remoteCompletedEpisodes: number
) {
    return !local || remoteCompletedEpisodes > anilistCompletedEpisodes(local);
}
