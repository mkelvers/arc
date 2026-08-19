import type { FranchiseOrder } from '$lib/types';

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

    if (Number.isNaN(Date.parse(data.anilistVerifiedAt))) {
        return null;
    }

    // Force refreshes of orders written before availability and format were cached.
    if (
        data.order.entries.some(
            (entry) =>
                !Object.hasOwn(entry, 'format') ||
                !Object.hasOwn(entry, 'status') ||
                !Object.hasOwn(entry, 'relations') ||
                !Object.hasOwn(entry, 'episodes') ||
                !Object.hasOwn(entry, 'duration') ||
                !Object.hasOwn(entry, 'popularity')
        )
    ) {
        return null;
    }

    return data.order;
}
