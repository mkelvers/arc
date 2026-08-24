import { describe, expect, test } from 'bun:test';

import { MaintenanceRequestSchema } from './maintenance-request';

describe('maintenance task boundary', () => {
    test('accepts global airing reconciliation', () => {
        expect(MaintenanceRequestSchema.safeParse({ kind: 'airing_reconcile' }).success).toBe(true);
    });

    test('accepts the closed playback and metadata override variants', () => {
        expect(
            MaintenanceRequestSchema.safeParse({
                kind: 'mapping_override',
                anilistId: 1,
                override: { kind: 'playback', provider: 'anikoto', mediaId: '123' },
            }).success
        ).toBe(true);
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

    test('rejects arbitrary providers and provider fields', () => {
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
