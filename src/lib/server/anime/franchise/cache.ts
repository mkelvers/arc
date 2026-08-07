import type { FranchiseOrder } from '$lib/anime/types';

export type FranchiseCacheData =
  | FranchiseOrder
  | {
      order: FranchiseOrder;
      anilistVerifiedAt: string;
    };

export function verifiedFranchiseCache(
  order: FranchiseOrder,
  verifiedAt: Date
): FranchiseCacheData {
  return {
    order,
    anilistVerifiedAt: verifiedAt.toISOString(),
  };
}

export function verifiedFranchiseOrder(data: FranchiseCacheData) {
  if (!('order' in data) || !('anilistVerifiedAt' in data)) {
    return null;
  }

  return Number.isNaN(Date.parse(data.anilistVerifiedAt)) ? null : data.order;
}
