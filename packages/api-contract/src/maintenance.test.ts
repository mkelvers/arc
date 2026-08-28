import { describe, expect, test } from 'bun:test';

import { MaintenanceHealthSchema, MaintenanceRequestSchema } from './maintenance';

describe('maintenance wire contracts', () => {
    test('accepts supported task requests and rejects arbitrary providers', () => {
        expect(
            MaintenanceRequestSchema.safeParse({
                kind: 'mapping_rediscover',
                anilistId: 1,
                mappingKind: 'playback',
                provider: 'allanime',
            }).success
        ).toBe(true);
        expect(
            MaintenanceRequestSchema.safeParse({
                kind: 'mapping_rediscover',
                anilistId: 1,
                mappingKind: 'playback',
                provider: 'arbitrary-provider',
            }).success
        ).toBe(false);
    });

    test('keeps scheduler health as a product response instead of a database row', () => {
        const result = MaintenanceHealthSchema.safeParse({
            healthy: true,
            reason: null,
            active: false,
            startedAt: null,
            completedAt: null,
            lastSuccessAt: null,
            lastFailureAt: null,
            lastFullReconciliationAt: null,
            nextFullReconciliationAt: null,
            lastCatalogRefreshAt: null,
            nextCatalogRefreshAt: null,
            durationMs: null,
            stats: null,
            targets: { pending: 0, due: 0, leased: 0, confirmed: 0, failed: 0, retired: 0 },
            maintenanceTasks: {},
            anilist: null,
            oldestDueAgeMs: null,
        });
        expect(result.success).toBe(true);
    });
});
