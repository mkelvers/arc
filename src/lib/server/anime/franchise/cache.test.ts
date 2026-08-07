import { describe, expect, test } from 'bun:test';

import type { FranchiseOrder } from '$lib/anime/types';
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
});
