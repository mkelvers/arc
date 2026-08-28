import { describe, expect, test } from 'bun:test';

import { MaintenanceRequestSchema } from './maintenance-request';

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
});
