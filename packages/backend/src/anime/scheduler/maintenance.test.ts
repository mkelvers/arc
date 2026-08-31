import { describe, expect, test } from 'bun:test';

import { MaintenanceRequestSchema } from '@arc/api-contract/maintenance';
import { maintenancePriority } from './maintenance-policy';

describe('maintenance task boundary', () => {
    test('accepts global airing reconciliation', () => {
        expect(MaintenanceRequestSchema.safeParse({ kind: 'airing_reconcile' }).success).toBe(true);
    });

    test('accepts a bounded episode inventory backfill', () => {
        expect(
            MaintenanceRequestSchema.safeParse({ kind: 'episode_backfill', anilistId: 100922 })
                .success
        ).toBe(true);
    });

    test('accepts the metadata override variant', () => {
        expect(
            MaintenanceRequestSchema.safeParse({
                kind: 'mapping_override',
                anilistId: 1,
                override: {
                    kind: 'metadata',
                    provider: 'tmdb',
                    externalId: '456',
                    mediaType: 'tv',
                },
            }).success
        ).toBe(true);
    });

    test('rejects playback providers and invalid metadata fields', () => {
        expect(
            MaintenanceRequestSchema.safeParse({
                kind: 'mapping_override',
                anilistId: 1,
                override: { kind: 'playback', provider: 'arbitrary', mediaId: '123' },
            }).success
        ).toBe(false);
        expect(
            MaintenanceRequestSchema.safeParse({
                kind: 'mapping_override',
                anilistId: 1,
                override: {
                    kind: 'metadata',
                    provider: 'tmdb',
                    externalId: '456',
                    mediaType: 'episode',
                },
            }).success
        ).toBe(false);
    });

    test('gives explicit repairs precedence over automatic backfills', () => {
        expect(maintenancePriority({ kind: 'episode_backfill', anilistId: 1 })).toBe(80);
        expect(
            maintenancePriority({
                kind: 'mapping_rediscover',
                anilistId: 1,
                mappingKind: 'metadata',
            })
        ).toBe(100);
        expect(maintenancePriority({ kind: 'airing_reconcile' })).toBe(40);
    });
});
