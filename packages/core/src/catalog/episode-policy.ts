import type { AniListAnime } from './anilist-types';
type EpisodeRefreshReason = 'metadata-source' | 'missing' | 'scheduled';

export const episodeMetadataRevision = 'tmdb-episode-v6';

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

export function episodeMetadataRefreshRequired(
    episodes: readonly { image: string | null; title: string; overview: string }[],
    sync: {
        metadataExternalIdId: number | null;
        metadataRevision: string | null;
    } | null,
    metadataExternalIdId: number
) {
    return (
        !sync ||
        sync.metadataExternalIdId !== metadataExternalIdId ||
        episodeMetadataNeedsRefresh(episodes, true, sync.metadataRevision)
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
