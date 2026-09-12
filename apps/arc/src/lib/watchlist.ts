import type { WatchlistState } from '@arc/core/client';

export const watchlistStates = [
    { value: 'watching', label: 'Watching' },
    { value: 'plan_to_watch', label: 'Plan to Watch' },
    { value: 'completed', label: 'Completed' },
    { value: 'dropped', label: 'Dropped' },
] as const;

export type { WatchlistState };
