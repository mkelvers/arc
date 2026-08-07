import { and, eq } from 'drizzle-orm';

import { db } from '$lib/server/db';
import { animeProviderMapping } from '$lib/server/db/schema';

export async function providerMediaId(anilistId: number, provider: string) {
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
