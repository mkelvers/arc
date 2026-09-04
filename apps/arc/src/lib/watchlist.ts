import { z } from 'zod';

import { WatchlistStateSchema, type WatchlistState } from '@arc/core';

export const watchlistStates = [
    { value: 'watching', label: 'Watching' },
    { value: 'plan_to_watch', label: 'Plan to Watch' },
    { value: 'completed', label: 'Completed' },
    { value: 'dropped', label: 'Dropped' },
] as const;

export type { WatchlistState };

export const WatchlistSelectionSchema = z.object({
    state: WatchlistStateSchema.or(z.literal('all')).catch('all'),
    sort: z.enum(['updated', 'added', 'alphabetical']).catch('updated'),
    order: z.enum(['newest', 'oldest']).catch('newest'),
    language: z.enum(['all', 'sub', 'dub']).catch('all'),
    media: z.enum(['all', 'series', 'movie']).catch('all'),
    type: z
        .enum(['all', 'airing', 'finished', 'not_yet_released', 'cancelled', 'hiatus'])
        .catch('all'),
});

type WatchlistSelection = z.infer<typeof WatchlistSelectionSchema>;
export type WatchlistSort = WatchlistSelection['sort'];
export type WatchlistOrder = WatchlistSelection['order'];
export type WatchlistLanguage = WatchlistSelection['language'];
export type WatchlistMedia = WatchlistSelection['media'];
export type WatchlistType = WatchlistSelection['type'];
