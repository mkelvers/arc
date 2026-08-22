import type { FranchiseOrder } from '@arc/shared/types';
import { z } from 'zod';

const franchiseOrderSchema = z.object({
    types: z.array(z.object({ id: z.string(), label: z.string() })),
    entries: z.array(
        z.object({
            id: z.number(),
            href: z.string(),
            link: z.string(),
            title: z.string(),
            image: z.string(),
            audioLabel: z.string(),
            format: z.string().nullable(),
            status: z.string().nullable(),
            score: z.number(),
            genres: z.array(z.string()),
            synopsis: z.string(),
            malId: z.number(),
            anilistId: z.number(),
            type: z.string(),
            episodes: z.number().nullable(),
            duration: z.number().nullable(),
            popularity: z.number().nullable(),
            relations: z.array(z.object({ type: z.string(), malId: z.number() })),
            secondary: z.boolean(),
            primary: z.boolean(),
        })
    ),
});

const franchiseCacheSchema = z.object({
    order: franchiseOrderSchema,
    anilistVerifiedAt: z.string(),
});

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

// Persisted JSON is intentionally unknown until this owning boundary validates it.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
export function verifiedFranchiseOrder(data: unknown) {
    const parsed = franchiseCacheSchema.safeParse(data);
    if (!parsed.success) {
        return null;
    }

    if (Number.isNaN(Date.parse(parsed.data.anilistVerifiedAt))) {
        return null;
    }

    // Force refreshes of orders written before availability and format were cached.
    if (
        parsed.data.order.entries.some(
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

    return (data as { order: FranchiseOrder }).order;
}
