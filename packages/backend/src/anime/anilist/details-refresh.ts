import type { AniListAnime } from './types';

const HOUR = 60 * 60 * 1_000;
const DAY = 24 * HOUR;

type StoredAnimeDetails = Pick<AniListAnime, 'nextAiringEpisode' | 'status'> & {
    fetchedAt: Date;
    version: number;
};

export type AnimeDetailsRefreshMode = 'none' | 'background' | 'urgent';

export function animeDetailsRefreshMode(
    stored: StoredAnimeDetails,
    now = Date.now()
): AnimeDetailsRefreshMode {
    if (stored.status === 'FINISHED') {
        return 'none';
    }

    if (stored.version !== 2) {
        return 'urgent';
    }

    if (
        stored.status === 'RELEASING' &&
        stored.nextAiringEpisode?.airingAt &&
        stored.nextAiringEpisode.airingAt * 1_000 <= now
    ) {
        return 'urgent';
    }

    const freshFor =
        stored.status === 'RELEASING'
            ? 6 * HOUR
            : stored.status === 'HIATUS'
              ? 7 * DAY
              : stored.status === 'CANCELLED'
                ? 90 * DAY
                : DAY;

    return now - stored.fetchedAt.getTime() >= freshFor ? 'background' : 'none';
}
