import type { AniListAnime } from '../catalog/anilist-types';
import { coversExpectedEpisodes } from './matching';

export function providerEpisodeCount(anime: Pick<AniListAnime, 'format' | 'episodes'>) {
    // AniList counts the individual short segments for TV_SHORT releases;
    // playback providers generally expose their packaged broadcast episodes.
    return anime.format === 'TV_SHORT' ? null : anime.episodes;
}

export function episodeInventoryCoversTarget(
    storedEpisodes: readonly { number: number; id?: string }[],
    targetEpisode: number
) {
    return coversExpectedEpisodes(
        storedEpisodes.filter(({ id }) => id === undefined || id.includes(':')),
        targetEpisode
    );
}

export function episodeInventoryNeedsDiscovery(
    anime: Pick<AniListAnime, 'status' | 'format' | 'episodes' | 'nextAiringEpisode'>,
    storedEpisodes: readonly { number: number; id?: string }[],
    nextRefreshAt?: Date | null,
    now = Date.now()
) {
    if (anime.status === 'NOT_YET_RELEASED') {
        return false;
    }
    if (anime.status === 'RELEASING') {
        const available = availableEpisodeCount(anime);
        return (
            (available !== null && !episodeInventoryCoversTarget(storedEpisodes, available)) ||
            (nextRefreshAt !== undefined &&
                (nextRefreshAt === null || nextRefreshAt.getTime() <= now))
        );
    }
    if (storedEpisodes.length === 0) {
        return true;
    }

    const expected = providerEpisodeCount(anime);
    return (
        anime.status === 'FINISHED' &&
        expected !== null &&
        (storedEpisodes.length !== expected ||
            !episodeInventoryCoversTarget(storedEpisodes, expected) ||
            (nextRefreshAt !== undefined &&
                (nextRefreshAt === null || nextRefreshAt.getTime() <= now)))
    );
}

export function availableEpisodeCount(anime: Pick<AniListAnime, 'status' | 'nextAiringEpisode'>) {
    if (anime.status !== 'RELEASING' || !anime.nextAiringEpisode?.episode) {
        return null;
    }

    const nextEpisode = anime.nextAiringEpisode.episode;
    const airingPassed =
        anime.nextAiringEpisode.airingAt && anime.nextAiringEpisode.airingAt * 1_000 <= Date.now();

    return Math.max(0, nextEpisode - (airingPassed ? 0 : 1));
}

export function episodesAvailableToWatch<T extends { number: number }>(
    episodes: readonly T[],
    anime: Pick<AniListAnime, 'status' | 'nextAiringEpisode'>
) {
    const available = availableEpisodeCount(anime);
    if (available === null) {
        return [...episodes];
    }

    return episodes.filter(
        ({ number }) => number <= 0 || !Number.isInteger(number) || number <= available
    );
}
