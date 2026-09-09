import { describe, expect, test } from 'bun:test';

import { episodeInventoryStatus } from '@arc/core';

describe('episode inventory state', () => {
    test('marks an empty inventory as pending while its backfill is queued', () => {
        expect(episodeInventoryStatus({ status: 'FINISHED' }, 0, 'pending')).toBe('pending');
        expect(episodeInventoryStatus({ status: 'FINISHED' }, 0, 'running')).toBe('pending');
    });

    test('marks a failed empty inventory as failed', () => {
        expect(episodeInventoryStatus({ status: 'FINISHED' }, 0, 'failed')).toBe('failed');
    });

    test('keeps stored episodes ready even when the provider task needs retrying', () => {
        expect(episodeInventoryStatus({ status: 'FINISHED' }, 12, 'failed')).toBe('ready');
    });

    test('keeps partial episodes visible while their backfill is running', () => {
        expect(episodeInventoryStatus({ status: 'FINISHED' }, 12, 'running')).toBe('pending');
    });

    test('does not show an unreleased anime as loading episodes', () => {
        expect(episodeInventoryStatus({ status: 'NOT_YET_RELEASED' }, 0, null)).toBe('ready');
    });
});
