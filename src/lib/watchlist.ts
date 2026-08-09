import { z } from 'zod';

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

export type WatchlistSort = (typeof watchlistSorts)[number];
export type WatchlistOrder = 'newest' | 'oldest';

export function watchlistState(value: string | null): WatchlistState | 'all' {
  return WatchlistStateSchema.safeParse(value).data ?? 'all';
}

export function watchlistSort(value: string | null): WatchlistSort {
  return watchlistSorts.includes(value as WatchlistSort) ? (value as WatchlistSort) : 'updated';
}

export function watchlistOrder(value: string | null): WatchlistOrder {
  return value === 'oldest' ? 'oldest' : 'newest';
}
