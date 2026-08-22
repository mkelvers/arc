import { describe, expect, test } from 'bun:test';

import type { FranchiseOrder } from '@arc/shared/types';
import { verifiedFranchiseCache, verifiedFranchiseOrder } from './cache';

const order: FranchiseOrder = { types: [], entries: [] };

describe('franchise cache identity provenance', () => {
    test('does not trust a legacy order without AniList verification', () => {
        expect(verifiedFranchiseOrder(order)).toBeNull();
    });

    test('returns an order with valid AniList verification provenance', () => {
        const cached = verifiedFranchiseCache(order, new Date('2026-08-02T03:00:00.000Z'));

        expect(verifiedFranchiseOrder(cached)).toBe(order);
    });

    test('rejects malformed verification provenance', () => {
        expect(
            verifiedFranchiseOrder({
                order,
                anilistVerifiedAt: 'not-a-date',
            })
        ).toBeNull();
    });

    test('rejects orders written before release metadata was cached', () => {
        const cached = verifiedFranchiseCache(
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
        const legacy = structuredClone(cached);
        if (!('order' in legacy)) {
            throw new Error('Expected verified cache payload');
        }

        const entry = legacy.order.entries[0];
        if (entry) {
            Reflect.deleteProperty(entry, 'format');
            Reflect.deleteProperty(entry, 'status');
        }

        expect(verifiedFranchiseOrder(legacy)).toBeNull();
    });
});
