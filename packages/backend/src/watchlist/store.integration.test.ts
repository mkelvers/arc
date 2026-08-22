import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { and, eq, inArray } from 'drizzle-orm';

import type { db as ArcDatabase } from '@arc/db';
import type * as ArcSchema from '@arc/db/schema';
import type * as WatchlistOperations from './application';

const databaseAvailable = Boolean(process.env.DATABASE_URL);

describe.skipIf(!databaseAvailable)('watchlist persistence operations', () => {
    let db: typeof ArcDatabase;
    let schema: typeof ArcSchema;
    let operations: typeof WatchlistOperations;
    const userIds = [randomUUID(), randomUUID()];
    const suffix = Math.floor(Math.random() * 100_000_000);
    const animeIds = [1_900_000_000 + suffix, 1_800_000_000 + suffix];

    beforeAll(async () => {
        ({ db } = await import('@arc/db'));
        schema = await import('@arc/db/schema');
        operations = await import('./application');
        await db.insert(schema.users).values(
            userIds.map((id, index) => ({
                id,
                name: `Watchlist test ${index}`,
                email: `watchlist-${id}@arc.test`,
                username: `watchlist_${id.replaceAll('-', '')}`,
                displayUsername: `watchlist_${index}`,
            }))
        );
    });

    afterAll(async () => {
        if (!db || !schema) return;
        await db.delete(schema.users).where(inArray(schema.users.id, userIds));
        const external = await db
            .select({ id: schema.animeExternalId.id })
            .from(schema.animeExternalId)
            .where(
                and(
                    eq(schema.animeExternalId.provider, 'anilist'),
                    inArray(schema.animeExternalId.externalId, animeIds)
                )
            );
        if (external.length) {
            const links = await db
                .select({ animeId: schema.animeExternalIdLink.animeId })
                .from(schema.animeExternalIdLink)
                .where(
                    inArray(
                        schema.animeExternalIdLink.externalIdId,
                        external.map(({ id }) => id)
                    )
                );
            await db.delete(schema.animeExternalId).where(
                inArray(
                    schema.animeExternalId.id,
                    external.map(({ id }) => id)
                )
            );
            if (links.length) {
                await db.delete(schema.anime).where(
                    inArray(
                        schema.anime.id,
                        links.map(({ animeId }) => animeId)
                    )
                );
            }
        }
    });

    test('isolates users and supports get, concurrent set, and idempotent delete', async () => {
        await Promise.all([
            operations.setWatchlistState(userIds[0], animeIds[0], 'watching'),
            operations.setWatchlistState(userIds[0], animeIds[0], 'completed'),
        ]);

        const concurrentState = await operations.getWatchlistState(userIds[0], animeIds[0]);
        expect(concurrentState).not.toBeNull();
        expect(['watching', 'completed']).toContain(concurrentState!);
        expect(await operations.getWatchlistState(userIds[1], animeIds[0])).toBeNull();

        await operations.setWatchlistState(userIds[1], animeIds[1], 'plan_to_watch');
        expect(await operations.getWatchlistStates(userIds[0])).toHaveLength(1);
        expect(await operations.getWatchlistStates(userIds[1])).toEqual([
            { animeId: animeIds[1], state: 'plan_to_watch' },
        ]);

        await operations.removeFromWatchlist(userIds[0], animeIds[0]);
        await operations.removeFromWatchlist(userIds[0], animeIds[0]);
        expect(await operations.getWatchlistState(userIds[0], animeIds[0])).toBeNull();
    });
});
