import { z } from 'zod';

export const WatchlistStateSchema = z.enum(['watching', 'plan_to_watch', 'completed', 'dropped']);

export const WatchlistSelectionSchema = z.object({
    state: WatchlistStateSchema.or(z.literal('all')).default('all'),
    sort: z.enum(['updated', 'added', 'alphabetical']).default('updated'),
    order: z.enum(['newest', 'oldest']).default('newest'),
    language: z.enum(['all', 'sub', 'dub']).default('all'),
    media: z.enum(['all', 'series', 'movie']).default('all'),
    type: z
        .enum(['all', 'airing', 'finished', 'not_yet_released', 'cancelled', 'hiatus'])
        .default('all'),
});

export const WatchlistUpdateSchema = z.object({
    state: WatchlistStateSchema,
    title: z.string().trim().min(1).max(512).optional(),
});

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
    audio: z.array(z.enum(['sub', 'dub', 'raw'])),
    format: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    score: z.number(),
    genres: z.array(z.string()),
    synopsis: z.string(),
    state: WatchlistStateSchema,
    addedAt: z.number().nullable(),
    updatedAt: z.number().nullable(),
    pendingMetadata: z.literal(true).optional(),
});

export const WatchlistPageResponseSchema = z.object({
    entries: z.array(WatchlistCardSchema),
    totalEntries: z.number().int().nonnegative(),
});

export type WatchlistCard = z.infer<typeof WatchlistCardSchema>;

export const WatchlistImportResponseSchema = z.object({
    message: z.string(),
});

export type WatchlistState = z.infer<typeof WatchlistStateSchema>;
export type WatchlistSelection = z.infer<typeof WatchlistSelectionSchema>;
