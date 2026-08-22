import { z } from 'zod';

export const WatchlistStateSchema = z.enum(['watching', 'plan_to_watch', 'completed', 'dropped']);

export const WatchlistSelectionSchema = z.object({
    state: WatchlistStateSchema.or(z.literal('all')),
    sort: z.enum(['updated', 'added', 'alphabetical']),
    order: z.enum(['newest', 'oldest']),
    language: z.enum(['all', 'sub', 'dub']),
    media: z.enum(['all', 'series', 'movie']),
    type: z.enum(['all', 'airing', 'finished', 'not_yet_released', 'cancelled', 'hiatus']),
});

export const WatchlistUpdateSchema = z.object({ state: WatchlistStateSchema });

export const WatchlistStateResponseSchema = z.object({
    animeId: z.number().int().positive(),
    state: WatchlistStateSchema.nullable(),
});

export const WatchlistStatesResponseSchema = z.object({
    entries: z.array(
        z.object({
            animeId: z.number().int().positive(),
            state: WatchlistStateSchema,
        })
    ),
});

export const WatchlistCardSchema = z.object({
    id: z.number().int().positive(),
    href: z.string(),
    link: z.string(),
    title: z.string(),
    image: z.string(),
    audioLabel: z.string(),
    format: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    score: z.number(),
    genres: z.array(z.string()),
    synopsis: z.string(),
    state: WatchlistStateSchema,
});

export const WatchlistPageResponseSchema = z.object({
    entries: z.array(WatchlistCardSchema),
    totalEntries: z.number().int().nonnegative(),
});

export type WatchlistState = z.infer<typeof WatchlistStateSchema>;
export type WatchlistSelection = z.infer<typeof WatchlistSelectionSchema>;
