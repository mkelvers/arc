import { describe, expect, test } from 'bun:test';

import type { FranchiseOrder } from '@arc/core/types';
import { FranchiseRecordSchema, verifiedFranchiseRecord } from './record';

const order: FranchiseOrder = { types: [], entries: [] };

describe('franchise record identity provenance', () => {
    test('does not trust a legacy order without AniList verification', () => {
        expect(FranchiseRecordSchema.safeParse(order).success).toBeFalse();
    });

    test('returns an order with valid AniList verification provenance', () => {
        const stored = verifiedFranchiseRecord(order, new Date('2026-08-02T03:00:00.000Z'));

        const parsed = FranchiseRecordSchema.safeParse(stored);

        expect(parsed.success).toBeTrue();
        if (parsed.success) {
            expect(parsed.data.order).toEqual(order);
            expect(parsed.data.membershipSource).toBe('chiaki');
            expect(parsed.data.identitySource).toBe('arc');
        }
    });

    test('rejects malformed verification provenance', () => {
        expect(
            FranchiseRecordSchema.safeParse({
                order,
                anilistVerifiedAt: 'not-a-date',
            }).success
        ).toBeFalse();
    });

    test('rejects orders written before release metadata was persisted', () => {
        const stored = verifiedFranchiseRecord(
            {
                types: [],
                entries: [
                    {
                        id: 1,
                        href: '/anime/1',
                        link: '/anime/1',
                        title: 'Anime 1',
                        image: '',
                        audioLabel: '',
                        score: 0,
                        genres: [],
                        synopsis: '',
                        malId: 1,
                        anilistId: 1,
                        type: 'TV',
                        format: 'TV',
                        status: 'FINISHED',
                        episodes: 12,
                        duration: 24,
                        popularity: 10_000,
                        relations: [],
                        secondary: false,
                        primary: true,
                    },
                ],
            },
            new Date('2026-08-02T03:00:00.000Z')
        );
        const legacy = structuredClone(stored);
        if (!('order' in legacy)) {
            throw new Error('Expected verified franchise record payload');
        }

        const entry = legacy.order.entries[0];
        if (entry) {
            Reflect.deleteProperty(entry, 'format');
            Reflect.deleteProperty(entry, 'status');
        }

        expect(FranchiseRecordSchema.safeParse(legacy).success).toBeFalse();
    });
});
