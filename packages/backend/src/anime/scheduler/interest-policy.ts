import { watchlistState } from '@arc/db/schema';

export const interestWatchlistStates = watchlistState.enumValues.filter(
    (state) => state !== 'dropped'
);
