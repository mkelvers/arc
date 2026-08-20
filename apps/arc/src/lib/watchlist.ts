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

export function watchlistMatchesFilters(
    card: { format?: string | null; status?: string | null },
    audio: ReadonlySet<AudioMode>,
    { language, media, type }: Pick<WatchlistSelection, 'language' | 'media' | 'type'>
) {
    return (
        (language === 'all' || language === (audio.has('dub') ? 'dub' : 'sub')) &&
        (media === 'all' || media === (card.format === 'MOVIE' ? 'movie' : 'series')) &&
        (type === 'all' || card.status === (type === 'airing' ? 'RELEASING' : type.toUpperCase()))
    );
}
