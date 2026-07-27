import type { AniListAnime } from './types';

export const syncVersion = 1;

export function nextRefreshAt(
    anime: AniListAnime,
    stableSince: Date,
) {
    const now = Date.now();
    const after = (milliseconds: number) => new Date(now + milliseconds);
    const nextAiringAt = anime.nextAiringEpisode?.airingAt
        ? anime.nextAiringEpisode.airingAt * 1_000 + 15 * 60 * 1_000
        : null;

    switch (anime.status) {
        case 'RELEASING':
            return new Date(
                Math.min(
                    nextAiringAt ?? Infinity,
                    now + 6 * 60 * 60 * 1_000,
                ),
            );
        case 'FINISHED': {
            const stableFor = now - stableSince.getTime();

            if (stableFor >= 30 * 24 * 60 * 60 * 1_000) {
                return null;
            }

            return stableFor >= 7 * 24 * 60 * 60 * 1_000
                ? after(7 * 24 * 60 * 60 * 1_000)
                : after(24 * 60 * 60 * 1_000);
        }
        case 'CANCELLED':
            return now - stableSince.getTime() >= 7 * 24 * 60 * 60 * 1_000
                ? null
                : after(7 * 24 * 60 * 60 * 1_000);
        case 'HIATUS':
            return after(7 * 24 * 60 * 60 * 1_000);
        case 'NOT_YET_RELEASED':
            return nextAiringAt
                ? new Date(
                      Math.min(
                          nextAiringAt,
                          now + 24 * 60 * 60 * 1_000,
                      ),
                  )
                : after(24 * 60 * 60 * 1_000);
        default:
            return after(6 * 60 * 60 * 1_000);
    }
}
