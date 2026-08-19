import type { FranchiseOrder } from './types';

export type FranchiseFilter = 'main' | 'movies' | 'side-stories';

type FranchiseFilterEntry = Pick<
    FranchiseOrder['entries'][number],
    'anilistId' | 'primary' | 'format'
>;

export function matchesFranchiseFilter(entry: FranchiseFilterEntry, filter: FranchiseFilter) {
    if (filter === 'main') {
        return entry.primary;
    }

    if (filter === 'movies') {
        return entry.format === 'MOVIE';
    }

    return !entry.primary && entry.format !== 'MOVIE' && entry.format !== 'MUSIC';
}
