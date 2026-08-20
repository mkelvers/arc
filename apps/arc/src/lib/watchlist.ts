import { z } from 'zod';

import type { AudioMode } from '$lib/audio';

export const watchlistStates = [
    { value: 'watching', label: 'Watching' },
    { value: 'plan_to_watch', label: 'Plan to Watch' },
    { value: 'completed', label: 'Completed' },
    { value: 'dropped', label: 'Dropped' },
] as const;

export const WatchlistStateSchema = z.enum(watchlistStates.map(({ value }) => value));
export type WatchlistState = z.infer<typeof WatchlistStateSchema>;
export const WatchlistUpdateSchema = z.object({ state: WatchlistStateSchema });

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

export function watchlistMatchesFilters(
    card: { format?: string | null; status?: string | null },
    audio: ReadonlySet<AudioMode>,
    filters: {
        language: WatchlistLanguage;
        media: WatchlistMedia;
        type: WatchlistType;
    }
) {
    const languageMatches =
        filters.language === 'all' ||
        (filters.language === 'dub' && audio.has('dub')) ||
        (filters.language === 'sub' && !audio.has('dub'));

    const mediaMatches =
        filters.media === 'all' ||
        (filters.media === 'movie' && card.format === 'MOVIE') ||
        (filters.media === 'series' && card.format !== 'MOVIE');

    const typeMatches =
        filters.type === 'all' ||
        (filters.type === 'airing' && card.status === 'RELEASING') ||
        (filters.type === 'finished' && card.status === 'FINISHED') ||
        (filters.type === 'not_yet_released' && card.status === 'NOT_YET_RELEASED') ||
        (filters.type === 'cancelled' && card.status === 'CANCELLED') ||
        (filters.type === 'hiatus' && card.status === 'HIATUS');

    return languageMatches && mediaMatches && typeMatches;
}

// A newly synced entry can have an old provider update time but a current local add time.
export function watchlistActivityTimestamp(updatedAt: number | null, addedAt: number | null) {
    return Math.max(updatedAt ?? 0, addedAt ?? 0);
}
