import type { AniListAnime } from '../anilist/types';
import { coversExpectedEpisodes } from '../providers/match';
type EpisodeRefreshReason = 'metadata-source' | 'missing' | 'scheduled';

export const episodeMetadataRevision = 'tmdb-episode-v4';

export function episodeRefreshReason(
    sync: {
        metadataExternalIdId: number | null;
        nextRefreshAt: Date | null;
    } | null,
    metadataExternalIdId: number | null,
    now = Date.now()
): EpisodeRefreshReason | null {
    if (!sync) {
        return 'missing';
    }

    if (metadataExternalIdId !== null && sync.metadataExternalIdId !== metadataExternalIdId) {
        return 'metadata-source';
    }

    return sync.nextRefreshAt && sync.nextRefreshAt.getTime() <= now ? 'scheduled' : null;
}

export function canPreserveEpisodeMetadata(
    previousExternalIdId: number | null,
    currentExternalIdId: number | null
) {
    return currentExternalIdId === null || previousExternalIdId === currentExternalIdId;
}

export function episodeMetadataNeedsRefresh(
    episodes: readonly { image: string | null; title: string; overview: string }[],
    hasMetadataSource: boolean,
    metadataRevision: string | null | undefined = episodeMetadataRevision
) {
    return (
        hasMetadataSource &&
        (metadataRevision !== episodeMetadataRevision ||
            episodes.length === 0 ||
            episodes.some(
                ({ image, title, overview }) => !image?.trim() || !title.trim() || !overview.trim()
            ))
    );
}

export function episodeMetadataRevisionAfterSync(
    episodes: readonly { image: string | null; title: string; overview: string }[],
    metadataAvailable: boolean,
    hasMetadataSource: boolean
) {
    if (!metadataAvailable || !hasMetadataSource) {
        return null;
    }

    return episodeMetadataNeedsRefresh(episodes, true) ? null : episodeMetadataRevision;
}

export function episodeInventoryIsExpected(status: AniListAnime['status']) {
    return status !== 'NOT_YET_RELEASED';
}

export function episodeRefreshBlocksPage(
    status: AniListAnime['status'],
    hasStoredEpisodes: boolean
) {
    return status !== 'FINISHED' || !hasStoredEpisodes;
}

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
        // Legacy numeric IDs can describe scheduled episodes but cannot be played.
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

const episodeRefreshRetryDelays = [
    2 * 60 * 1_000,
    5 * 60 * 1_000,
    15 * 60 * 1_000,
    60 * 60 * 1_000,
    6 * 60 * 60 * 1_000,
    12 * 60 * 60 * 1_000,
    24 * 60 * 60 * 1_000,
];
const episodeRefreshLifetimeMs = 14 * 24 * 60 * 60 * 1_000;
const maximumEpisodeRefreshAttempts = 12;

export function episodeRefreshRetryDelay(
    attempts: number,
    firstScheduledAt = Date.now(),
    now = Date.now()
) {
    if (
        attempts + 1 >= maximumEpisodeRefreshAttempts ||
        now - firstScheduledAt >= episodeRefreshLifetimeMs
    ) {
        return null;
    }

    return episodeRefreshRetryDelays[Math.min(attempts, episodeRefreshRetryDelays.length - 1)];
}

export function nextRefreshAt(anime: AniListAnime, stableSince: Date) {
    const now = Date.now();
    const after = (milliseconds: number) => new Date(now + milliseconds);
    const nextAiringAt = anime.nextAiringEpisode?.airingAt
        ? anime.nextAiringEpisode.airingAt * 1_000 + 15 * 60 * 1_000
        : null;

    switch (anime.status) {
        case 'RELEASING':
            return new Date(Math.min(nextAiringAt ?? Infinity, now + 6 * 60 * 60 * 1_000));
        case 'FINISHED': {
            return after(7 * 24 * 60 * 60 * 1_000);
        }
        case 'CANCELLED':
            return now - stableSince.getTime() >= 7 * 24 * 60 * 60 * 1_000
                ? after(30 * 24 * 60 * 60 * 1_000)
                : after(7 * 24 * 60 * 60 * 1_000);
        case 'HIATUS':
            return after(7 * 24 * 60 * 60 * 1_000);
        case 'NOT_YET_RELEASED':
            return nextAiringAt
                ? new Date(Math.min(nextAiringAt, now + 24 * 60 * 60 * 1_000))
                : after(24 * 60 * 60 * 1_000);
        default:
            return after(6 * 60 * 60 * 1_000);
    }
}
