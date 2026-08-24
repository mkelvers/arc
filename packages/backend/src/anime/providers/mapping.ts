import { and, eq, isNull, or } from 'drizzle-orm';

import { db } from '@arc/db';
import { animeMappingOverride, animeProviderMapping } from '@arc/db/schema';

export async function providerMediaId(anilistId: number, provider: string) {
    const [override] = await db
        .select({ id: animeMappingOverride.externalId })
        .from(animeMappingOverride)
        .where(
            and(
                eq(animeMappingOverride.anilistId, anilistId),
                eq(animeMappingOverride.kind, 'playback'),
                eq(animeMappingOverride.provider, provider),
                isNull(animeMappingOverride.clearedAt),
                or(
                    eq(animeMappingOverride.validationStatus, 'pending'),
                    eq(animeMappingOverride.validationStatus, 'valid')
                )
            )
        )
        .limit(1);
    if (override) {
        return override.id;
    }

    const [stored] = await db
        .select({ id: animeProviderMapping.providerMediaId })
        .from(animeProviderMapping)
        .where(
            and(
                eq(animeProviderMapping.anilistId, anilistId),
                eq(animeProviderMapping.provider, provider)
            )
        )
        .limit(1);

    return stored?.id ?? null;
}

export async function saveProviderMediaId(anilistId: number, provider: string, id: string) {
    const [override] = await db
        .select({ id: animeMappingOverride.externalId })
        .from(animeMappingOverride)
        .where(
            and(
                eq(animeMappingOverride.anilistId, anilistId),
                eq(animeMappingOverride.kind, 'playback'),
                eq(animeMappingOverride.provider, provider),
                isNull(animeMappingOverride.clearedAt),
                or(
                    eq(animeMappingOverride.validationStatus, 'pending'),
                    eq(animeMappingOverride.validationStatus, 'valid')
                )
            )
        )
        .limit(1);
    if (override && override.id !== id) {
        return;
    }

    const now = new Date();

    await db
        .insert(animeProviderMapping)
        .values({
            anilistId,
            provider,
            providerMediaId: id,
            discoveredAt: now,
            verifiedAt: now,
        })
        .onConflictDoUpdate({
            target: [animeProviderMapping.anilistId, animeProviderMapping.provider],
            set: {
                providerMediaId: id,
                verifiedAt: now,
            },
        });
}

export async function verifyProviderMediaId(anilistId: number, provider: string) {
    await db
        .update(animeProviderMapping)
        .set({ verifiedAt: new Date() })
        .where(
            and(
                eq(animeProviderMapping.anilistId, anilistId),
                eq(animeProviderMapping.provider, provider)
            )
        );
}
