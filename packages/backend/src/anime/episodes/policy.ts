import type { AniListAnime } from '../anilist/types';
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
            episodes.every(({ image, title, overview }) => image === null && !title && !overview) ||
            episodes.some(({ image, title, overview }) => image !== null && (!title || !overview)))
    );
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

export function classificationRefreshDue(
    refreshedAt: Date | null | undefined,
    status: AniListAnime['status'],
    revision: string | null | undefined,
    now = Date.now()
) {
    if (revision !== 'animefillerlist-v1' || !refreshedAt) {
        return true;
    }

    if (status === 'FINISHED') {
        return false;
    }

    const lifetime = status === 'RELEASING' ? 24 * 60 * 60 * 1_000 : 7 * 24 * 60 * 60 * 1_000;
    return refreshedAt.getTime() + lifetime <= now;
}

export function providerEpisodeCount(anime: Pick<AniListAnime, 'format' | 'episodes'>) {
    // AniList counts the individual short segments for TV_SHORT releases;
    // playback providers generally expose their packaged broadcast episodes.
    return anime.format === 'TV_SHORT' ? null : anime.episodes;
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
            return null;
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
