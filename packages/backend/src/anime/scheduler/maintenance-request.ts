import { z } from 'zod';

import { mappingPlaybackProviders } from './mapping-policy';

const animeId = z.number().int().positive();

export const MaintenanceRequestSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('release_refresh'),
        anilistId: animeId,
        mode: z.enum(['full', 'schedule']).default('full'),
    }),
    z.object({
        kind: z.literal('mapping_rediscover'),
        anilistId: animeId,
        mappingKind: z.enum(['playback', 'metadata']),
        provider: z.enum([...mappingPlaybackProviders, 'tmdb']).optional(),
    }),
    z.object({
        kind: z.literal('mapping_override'),
        anilistId: animeId,
        override: z.discriminatedUnion('kind', [
            z.object({
                kind: z.literal('playback'),
                provider: z.enum(mappingPlaybackProviders),
                mediaId: z.string().trim().min(1).max(512),
            }),
            z.object({
                kind: z.literal('metadata'),
                provider: z.literal('tmdb'),
                externalId: z.string().regex(/^[1-9][0-9]*$/),
                mediaType: z.enum(['movie', 'tv']),
            }),
        ]),
    }),
    z.object({
        kind: z.literal('target_reactivate'),
        anilistId: animeId,
        targetEpisode: z.number().int().positive(),
    }),
    z.object({ kind: z.literal('airing_reconcile') }),
    z.object({ kind: z.literal('interest_reconcile') }),
    z.object({ kind: z.literal('episode_backfill'), anilistId: animeId }),
]);

export type MaintenanceRequest = z.infer<typeof MaintenanceRequestSchema>;
