import type { FranchiseOrder } from '@arc/core';

export type FranchiseFilter = 'main' | 'movies' | 'side-stories';

type FranchiseFilterEntry = Pick<
    FranchiseOrder['entries'][number],
    'anilistId' | 'primary' | 'format'
> &
    Partial<Pick<FranchiseOrder['entries'][number], 'secondary'>>;

export function matchesFranchiseFilter(
    entry: FranchiseFilterEntry,
    filter: FranchiseFilter,
    currentAnimeId?: number
) {
    if (filter === 'main') {
        return (
            entry.primary ||
            (entry.anilistId === currentAnimeId && !entry.secondary && entry.format !== 'MOVIE')
        );
    }

    if (filter === 'movies') {
        return entry.format === 'MOVIE';
    }

    return !entry.primary && entry.format !== 'MOVIE' && entry.format !== 'MUSIC';
}
