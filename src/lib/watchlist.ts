import { z } from 'zod';

import type { AudioMode } from '$lib/anime/audio';

export const watchlistStates = ['watching', 'plan_to_watch', 'completed', 'dropped'] as const;

export const WatchlistStateSchema = z.enum(watchlistStates);
export type WatchlistState = z.infer<typeof WatchlistStateSchema>;

export const watchlistStatusOptions = [
    { value: 'watching', label: 'Watching' },
    { value: 'plan_to_watch', label: 'Plan to Watch' },
    { value: 'completed', label: 'Completed' },
    { value: 'dropped', label: 'Dropped' },
] as const satisfies ReadonlyArray<{ value: WatchlistState; label: string }>;

export const WatchlistEntriesSchema = z.array(
    z.object({
        animeId: z.number().int().positive(),
        state: WatchlistStateSchema,
    })
);

export const watchlistSorts = ['updated', 'added', 'alphabetical'] as const;
export const watchlistLanguages = ['all', 'sub', 'dub'] as const;
export const watchlistMedia = ['all', 'series', 'movie'] as const;
export const watchlistTypes = [
    'all',
    'airing',
    'finished',
    'not_yet_released',
    'cancelled',
    'hiatus',
] as const;

export type WatchlistSort = (typeof watchlistSorts)[number];
export type WatchlistOrder = 'newest' | 'oldest';
export type WatchlistLanguage = (typeof watchlistLanguages)[number];
export type WatchlistMedia = (typeof watchlistMedia)[number];
export type WatchlistType = (typeof watchlistTypes)[number];

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

export function watchlistState(value: string | null): WatchlistState | 'all' {
    return WatchlistStateSchema.safeParse(value).data ?? 'all';
}

export function watchlistSort(value: string | null): WatchlistSort {
    return watchlistSorts.includes(value as WatchlistSort) ? (value as WatchlistSort) : 'updated';
}

export function watchlistOrder(value: string | null): WatchlistOrder {
    return value === 'oldest' ? 'oldest' : 'newest';
}

export function watchlistLanguage(value: string | null): WatchlistLanguage {
    return watchlistLanguages.includes(value as WatchlistLanguage)
        ? (value as WatchlistLanguage)
        : 'all';
}

export function watchlistMediaType(value: string | null): WatchlistMedia {
    return watchlistMedia.includes(value as WatchlistMedia) ? (value as WatchlistMedia) : 'all';
}

export function watchlistType(value: string | null): WatchlistType {
    return watchlistTypes.includes(value as WatchlistType) ? (value as WatchlistType) : 'all';
}

// A newly synced entry can have an old provider update time but a current local add time.
export function watchlistActivityTimestamp(updatedAt: number | null, addedAt: number | null) {
    return Math.max(updatedAt ?? 0, addedAt ?? 0);
}
