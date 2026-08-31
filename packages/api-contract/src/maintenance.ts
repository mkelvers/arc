import { z } from 'zod';

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
        mappingKind: z.literal('metadata'),
        provider: z.literal('tmdb').optional(),
    }),
    z.object({
        kind: z.literal('mapping_override'),
        anilistId: animeId,
        override: z.object({
            kind: z.literal('metadata'),
            provider: z.literal('tmdb'),
            externalId: z.string().regex(/^[1-9][0-9]*$/),
            mediaType: z.enum(['movie', 'tv']),
        }),
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

const TimestampSchema = z.iso.datetime().nullable();

export const MaintenanceTaskSchema = z.object({
    id: z.uuid(),
    kind: z.string(),
    state: z.enum(['pending', 'running', 'completed', 'failed']),
    attempts: z.number().int().nonnegative(),
    nextAttemptAt: z.iso.datetime(),
    lastError: z.string().nullable(),
    result: z.json().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    completedAt: TimestampSchema,
});

export const MaintenanceHealthSchema = z.object({
    healthy: z.boolean(),
    reason: z.string().nullable(),
    active: z.boolean(),
    startedAt: TimestampSchema,
    completedAt: TimestampSchema,
    lastSuccessAt: TimestampSchema,
    lastFailureAt: TimestampSchema,
    lastFullReconciliationAt: TimestampSchema,
    nextFullReconciliationAt: TimestampSchema,
    lastCatalogRefreshAt: TimestampSchema,
    nextCatalogRefreshAt: TimestampSchema,
    durationMs: z.number().nullable(),
    stats: z.json().nullable(),
    targets: z.object({
        pending: z.number().int().nonnegative(),
        due: z.number().int().nonnegative(),
        leased: z.number().int().nonnegative(),
        confirmed: z.number().int().nonnegative(),
        failed: z.number().int().nonnegative(),
        retired: z.number().int().nonnegative(),
    }),
    maintenanceTasks: z.record(z.string(), z.number().int().nonnegative()),
    maintenanceOldestDueAgeMs: z.number().nonnegative().nullable(),
    anilist: z
        .object({
            blockedUntil: TimestampSchema,
            lastRequestAt: TimestampSchema,
            lastOperation: z.string().nullable(),
            lastStatus: z.number().int().nullable(),
            lastError: z.string().nullable(),
            requestCount: z.number().int().nonnegative(),
            successCount: z.number().int().nonnegative(),
            failureCount: z.number().int().nonnegative(),
        })
        .nullable(),
    oldestDueAgeMs: z.number().nullable(),
});
