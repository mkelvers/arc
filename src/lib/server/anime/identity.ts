import { and, eq } from 'drizzle-orm';

import { db } from '$lib/server/db';
import {
    anime,
    animeExternalId,
    animeExternalIdLink,
} from '$lib/server/db/schema';

export async function findInternalAnimeId(anilistId: number) {
    const [stored] = await db
        .select({ animeId: animeExternalIdLink.animeId })
        .from(animeExternalId)
        .innerJoin(
            animeExternalIdLink,
            eq(animeExternalIdLink.externalIdId, animeExternalId.id),
        )
        .where(
            and(
                eq(animeExternalId.provider, 'anilist'),
                eq(animeExternalId.mediaType, 'anime'),
                eq(animeExternalId.externalId, anilistId),
            ),
        )
        .limit(1);

    return stored?.animeId ?? null;
}

export async function ensureInternalAnimeId(anilistId: number) {
    const stored = await findInternalAnimeId(anilistId);

    if (stored) {
        return stored;
    }

    return db.transaction(async (tx) => {
        await tx
            .insert(animeExternalId)
            .values({
                provider: 'anilist',
                mediaType: 'anime',
                externalId: anilistId,
            })
            .onConflictDoNothing();

        const [externalId] = await tx
            .select({ id: animeExternalId.id })
            .from(animeExternalId)
            .where(
                and(
                    eq(animeExternalId.provider, 'anilist'),
                    eq(animeExternalId.mediaType, 'anime'),
                    eq(animeExternalId.externalId, anilistId),
                ),
            )
            .limit(1);

        if (!externalId) {
            throw new Error('Failed to store anime identity');
        }

        const [existingLink] = await tx
            .select({ animeId: animeExternalIdLink.animeId })
            .from(animeExternalIdLink)
            .where(eq(animeExternalIdLink.externalIdId, externalId.id))
            .limit(1);

        if (existingLink) {
            return existingLink.animeId;
        }

        const [created] = await tx
            .insert(anime)
            .values({})
            .returning({ id: anime.id });

        if (!created) {
            throw new Error('Failed to store anime');
        }

        await tx.insert(animeExternalIdLink).values({
            animeId: created.id,
            externalIdId: externalId.id,
        });

        return created.id;
    });
}
