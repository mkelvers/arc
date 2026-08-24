import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@arc/db';
import { anime, animeExternalId, animeExternalIdLink } from '@arc/db/schema';

export async function findInternalAnimeId(anilistId: number) {
    const [stored] = await db
        .select({ animeId: animeExternalIdLink.animeId })
        .from(animeExternalId)
        .innerJoin(animeExternalIdLink, eq(animeExternalIdLink.externalIdId, animeExternalId.id))
        .where(
            and(
                eq(animeExternalId.provider, 'anilist'),
                eq(animeExternalId.mediaType, 'anime'),
                eq(animeExternalId.externalId, anilistId)
            )
        )
        .limit(1);

    return stored?.animeId ?? null;
}

export async function ensureInternalAnimeId(anilistId: number, title?: string) {
    const storedTitle = title?.trim() || null;
    const stored = await findInternalAnimeId(anilistId);

    if (stored) {
        if (storedTitle) {
            await db
                .update(anime)
                .set({ title: storedTitle })
                .where(and(eq(anime.id, stored), isNull(anime.title)));
        }
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
                    eq(animeExternalId.externalId, anilistId)
                )
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
            if (storedTitle) {
                await tx
                    .update(anime)
                    .set({ title: storedTitle })
                    .where(and(eq(anime.id, existingLink.animeId), isNull(anime.title)));
            }
            return existingLink.animeId;
        }

        const [created] = await tx
            .insert(anime)
            .values({ title: storedTitle })
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
