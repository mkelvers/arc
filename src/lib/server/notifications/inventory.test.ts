import { describe, expect, test } from 'bun:test';

import { notificationInventoryRefreshDue } from './inventory';

const now = Date.parse('2026-08-12T12:00:00.000Z');

describe('notification inventory refresh policy', () => {
    test('checks interested releasing anime hourly for episodes and delayed dubs', () => {
        expect(
            notificationInventoryRefreshDue(
                {
                    mediaStatus: 'RELEASING',
                    lastSuccessAt: new Date(now - 60 * 60 * 1_000),
                    nextRefreshAt: new Date(now + 5 * 60 * 60 * 1_000),
                },
                now
            )
        ).toBe(true);
        expect(
            notificationInventoryRefreshDue(
                {
                    mediaStatus: 'RELEASING',
                    lastSuccessAt: new Date(now - 59 * 60 * 1_000),
                    nextRefreshAt: new Date(now - 1),
                },
                now
            )
        ).toBe(false);
    });

    test('uses the ordinary durable refresh schedule outside active releases', () => {
        expect(
            notificationInventoryRefreshDue(
                {
                    mediaStatus: 'FINISHED',
                    lastSuccessAt: new Date(now - 30 * 24 * 60 * 60 * 1_000),
                    nextRefreshAt: new Date(now),
                },
                now
            )
        ).toBe(true);
        expect(
            notificationInventoryRefreshDue(
                {
                    mediaStatus: 'FINISHED',
                    lastSuccessAt: new Date(now - 30 * 24 * 60 * 60 * 1_000),
                    nextRefreshAt: new Date(now + 1),
                },
                now
            )
        ).toBe(false);
    });

    test('always initializes inventory that has never succeeded', () => {
        expect(
            notificationInventoryRefreshDue(
                { mediaStatus: null, lastSuccessAt: null, nextRefreshAt: null },
                now
            )
        ).toBe(true);
    });
});
