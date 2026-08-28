import type { FranchiseOrder } from '@arc/shared/types';
import { z } from 'zod';

const franchiseOrderSchema = z
    .object({
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
    })
    .transform((value) => value as FranchiseOrder);

export const FranchiseCacheSchema = z.object({
    order: franchiseOrderSchema,
    membershipSource: z.literal('chiaki'),
    identitySource: z.literal('arc'),
    anilistVerifiedAt: z
        .string()
        .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid verification timestamp'),
});

export function verifiedFranchiseCache(order: FranchiseOrder, verifiedAt: Date) {
    return {
        order,
        membershipSource: 'chiaki' as const,
        identitySource: 'arc' as const,
        anilistVerifiedAt: verifiedAt.toISOString(),
    };
}
